"""Prompt route — main endpoint for submitting prompts to agents"""

import asyncio
import json
import time
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from arena.core.auth import get_current_user_optional
from arena.core.contradiction_detector import get_contradiction_detector
from arena.core.cost_tracker import (
    RateLimitExceeded,
    RequestCostAccumulator,
    check_and_increment_guest,
    check_and_increment_user,
    record_usage,
)
from arena.core.input_pipeline import run_input_pipeline
from arena.core.memory import get_memory_manager
from arena.core.observability import (
    LatencyTracker,
    log_rate_limit_hit,
    log_request,
    log_toxicity_rejection,
    log_unhandled_exception,
    new_request_id,
)
from arena.core.agents import get_all_agents, get_persona_id_for_agent
from arena.core.orchestrator import Orchestrator
from arena.core.persona_integrity import check_integrity
from arena.core.response_shaper import assemble_payload
from arena.core.scorer import Scorer
from arena.database import get_db
from arena.models.schemas import (
    ContradictionFlag,
    ErrorResponse,
    PromptRequest,
    PromptResponse,
    RateLimitError,
    UserResponse,
)

router = APIRouter(prefix="/api", tags=["prompt"])


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(
    request: Request,
    user: Optional[UserResponse],
    db: Session,
    request_id: str,
) -> None:
    """Enforce rate limits BEFORE touching the input pipeline. Raises HTTPException if exceeded."""
    try:
        if user:
            check_and_increment_user(db, user.id, user.tier)
        else:
            ip = _get_client_ip(request)
            check_and_increment_guest(db, ip)
    except RateLimitExceeded as e:
        log_rate_limit_hit(
            request_id=request_id,
            user_id=str(user.id) if user else _get_client_ip(request),
            tier=e.tier,
            used=e.used,
            limit=e.limit,
        )
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limit_exceeded",
                "message": e.message,
                "tier": e.tier,
                "prompts_used": e.used,
                "daily_limit": e.limit,
            },
        )


@router.post(
    "/prompt",
    response_model=PromptResponse,
    responses={
        400: {"model": ErrorResponse},
        429: {"model": RateLimitError},
        500: {"model": ErrorResponse},
    },
)
async def submit_prompt(
    request: Request,
    body: PromptRequest,
    db: Session = Depends(get_db),
    user: Optional[UserResponse] = Depends(get_current_user_optional),
) -> PromptResponse:
    """Submit a prompt to all 4 agents simultaneously."""
    request_id = new_request_id()
    t_start = time.monotonic()
    tracker = LatencyTracker()
    tracker.mark("pipeline_start")
    orchestrator = Orchestrator()
    scorer = Scorer()
    session_id = body.session_id or str(uuid.uuid4())
    user_label = str(user.id) if user else "guest"

    _check_rate_limit(request, user, db, request_id)

    cost = RequestCostAccumulator(request_id=request_id)

    try:
        try:
            active_agents = get_all_agents(body.persona_ids)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        pipeline_result = await run_input_pipeline(body.prompt)
        tracker.mark("input_pipeline_done")

        if not pipeline_result.passed:
            log_toxicity_rejection(request_id, user_label, pipeline_result.rejection_reason or "")
            raise HTTPException(
                status_code=400,
                detail=pipeline_result.rejection_reason or "Prompt rejected by content policy",
            )

        agent_timings: dict[str, int] = {}
        t_agents = time.monotonic()
        responses, tools_used = await orchestrator.run_all_agents(
            pipeline_result.enriched_prompt,
            agents=active_agents,
            persona_ids=body.persona_ids,
            user_id=user.id if user else None,
            db=db if user else None,
            session_id=session_id,
            tracker=tracker,
        )
        agent_timings["all_agents"] = int((time.monotonic() - t_agents) * 1000)

        integrity_report = await check_integrity(
            responses,
            session_id,
            prompt=body.prompt,
            user_id=user.id if user else None,
            persona_ids=body.persona_ids,
            db=db if user else None,
        )
        tracker.mark("integrity_done")

        scored_responses = await scorer.score_responses(
            body.prompt,
            responses,
            integrity_report,
            session_id=session_id,
            user_id=user.id if user else None,
            prompt_category=pipeline_result.classification.category.value,
            persona_ids=body.persona_ids,
            db=db if user else None,
            scoring_duration_ms=None,
        )
        tracker.mark("scoring_done")

        winner = scorer.get_winner(scored_responses)
        if not winner:
            raise HTTPException(status_code=500, detail="Failed to determine winner")

        detector = get_contradiction_detector()
        contradiction_reports = await detector.check_all_agents(responses, session_id)

        for scored in scored_responses:
            report = contradiction_reports.get(scored.response.agent_id)
            if report and report.contradiction_detected:
                scored.contradiction = ContradictionFlag(
                    detected=True,
                    previous_statement=report.previous_statement,
                    current_statement=report.current_statement,
                    severity=report.severity,
                )

        final_response = await assemble_payload(
            prompt=body.prompt,
            session_id=session_id,
            prompt_category=pipeline_result.classification.category.value,
            scored_responses=scored_responses,
            winner=winner,
            integrity=integrity_report,
            tools_used=tools_used,
        )
        tracker.mark("response_shaped")

        memory = get_memory_manager()
        memory.add_turn(
            session_id=session_id,
            prompt=body.prompt,
            prompt_category=pipeline_result.classification.category.value,
            scored_responses=scored_responses,
            winner_id=winner.response.agent_id,
            winner_persona_id=get_persona_id_for_agent(winner.response.agent_id, body.persona_ids),
            persona_ids=body.persona_ids,
            user_id=str(user.id) if user else "anonymous",
        )

        total_ms = int((time.monotonic() - t_start) * 1000)
        tracker.mark("pipeline_end")
        stage_timings = {
            "input_pipeline": tracker.get_stage_duration("pipeline_start", "input_pipeline_done") or 0,
            "tool_router": tracker.get_stage_duration("input_pipeline_done", "tool_router_done") or 0,
            "agents_total": tracker.get_stage_duration("agents_start", "agents_done") or agent_timings.get("all_agents", 0),
            "integrity_check": tracker.get_stage_duration("agents_done", "integrity_done") or 0,
            "scoring": tracker.get_stage_duration("integrity_done", "scoring_done") or 0,
            "response_shaper": tracker.get_stage_duration("scoring_done", "response_shaped") or 0,
            "total": tracker.get_stage_duration("pipeline_start", "pipeline_end") or total_ms,
        }
        log_request(
            request_id=request_id,
            user_id=user_label,
            prompt_length=len(body.prompt),
            prompt_category=pipeline_result.classification.category.value,
            agent_timings_ms=stage_timings,
            total_processing_ms=total_ms,
            winner_agent_id=winner.response.agent_id,
            input_tokens=cost.input_tokens,
            output_tokens=cost.output_tokens,
            estimated_cost_usd=cost.estimated_cost_usd,
        )

        record_usage(
            db=db,
            cost=cost,
            session_id=session_id,
            user_id=user.id if user else None,
            guest_ip=_get_client_ip(request) if not user else None,
            prompt_category=pipeline_result.classification.category.value,
            winner_agent_id=winner.response.agent_id,
            persona_ids=body.persona_ids,
            panel_used=[
                {
                    "agent_id": agent.agent_id,
                    "persona_id": agent.persona_id,
                    "name": agent.name,
                    "color": agent.color,
                }
                for agent in active_agents
            ],
            mode="arena",
            winning_persona_id=get_persona_id_for_agent(winner.response.agent_id, body.persona_ids),
            total_processing_ms=total_ms,
        )

        return final_response

    except HTTPException:
        raise
    except Exception as e:
        log_unhandled_exception(request_id, user_label, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prompt/stream")
async def stream_prompt(
    request: Request,
    body: PromptRequest,
    db: Session = Depends(get_db),
    user: Optional[UserResponse] = Depends(get_current_user_optional),
):
    """SSE streaming endpoint — streams agent tokens in real-time."""
    request_id = new_request_id()
    t_start = time.monotonic()
    tracker = LatencyTracker()
    tracker.mark("pipeline_start")
    orchestrator = Orchestrator()
    scorer = Scorer()
    session_id = body.session_id or str(uuid.uuid4())
    user_label = str(user.id) if user else "guest"

    _check_rate_limit(request, user, db, request_id)

    cost = RequestCostAccumulator(request_id=request_id)

    async def event_generator():
        try:
            try:
                active_agents = get_all_agents(body.persona_ids)
            except ValueError as e:
                yield _sse_event("error", {"detail": str(e)})
                return

            pipeline_result = await run_input_pipeline(body.prompt)
            tracker.mark("input_pipeline_done")

            yield _sse_event("pipeline", {
                "passed": pipeline_result.passed,
                "category": pipeline_result.classification.category.value,
                "rejection_reason": pipeline_result.rejection_reason,
            })

            if not pipeline_result.passed:
                log_toxicity_rejection(request_id, user_label, pipeline_result.rejection_reason or "")
                yield _sse_event("error", {
                    "detail": pipeline_result.rejection_reason or "Prompt rejected",
                })
                return

            queue, gather_task, tools_used = await orchestrator.stream_all_agents(
                pipeline_result.enriched_prompt,
                agents=active_agents,
                persona_ids=body.persona_ids,
                user_id=user.id if user else None,
                db=db if user else None,
                session_id=session_id,
                tracker=tracker,
            )

            while True:
                msg = await queue.get()
                event_type = msg["type"]

                if event_type == "token":
                    yield _sse_event("token", {
                        "agent_id": msg["agent_id"],
                        "token": msg["token"],
                    })
                elif event_type == "agent_done":
                    yield _sse_event("agent_done", {"agent_id": msg["agent_id"]})
                elif event_type == "agent_error":
                    yield _sse_event("agent_error", {
                        "agent_id": msg["agent_id"],
                        "error": msg["error"],
                    })
                elif event_type == "all_done":
                    break

            responses = await gather_task
            integrity_report = await check_integrity(
                responses,
                session_id,
                prompt=body.prompt,
                user_id=user.id if user else None,
                persona_ids=body.persona_ids,
                db=db if user else None,
            )
            tracker.mark("integrity_done")
            scored_responses = await scorer.score_responses(
                body.prompt,
                responses,
                integrity_report,
                session_id=session_id,
                user_id=user.id if user else None,
                prompt_category=pipeline_result.classification.category.value,
                persona_ids=body.persona_ids,
                db=db if user else None,
            )
            tracker.mark("scoring_done")
            winner = scorer.get_winner(scored_responses)
            if not winner:
                yield _sse_event("error", {"detail": "Failed to determine winner"})
                return

            final = await assemble_payload(
                prompt=body.prompt,
                session_id=session_id,
                prompt_category=pipeline_result.classification.category.value,
                scored_responses=scored_responses,
                winner=winner,
                integrity=integrity_report,
                tools_used=tools_used,
            )
            tracker.mark("response_shaped")

            memory = get_memory_manager()
            memory.add_turn(
                session_id=session_id,
                prompt=body.prompt,
                prompt_category=pipeline_result.classification.category.value,
                scored_responses=scored_responses,
                winner_id=winner.response.agent_id,
                winner_persona_id=get_persona_id_for_agent(winner.response.agent_id, body.persona_ids),
                persona_ids=body.persona_ids,
                user_id=str(user.id) if user else "anonymous",
            )

            yield _sse_event("result", final.model_dump(mode="json"))

            total_ms = int((time.monotonic() - t_start) * 1000)
            tracker.mark("pipeline_end")
            log_request(
                request_id=request_id,
                user_id=user_label,
                prompt_length=len(body.prompt),
                prompt_category=pipeline_result.classification.category.value,
                agent_timings_ms={
                    "input_pipeline": tracker.get_stage_duration("pipeline_start", "input_pipeline_done") or 0,
                    "tool_router": tracker.get_stage_duration("input_pipeline_done", "tool_router_done") or 0,
                    "agents_total": tracker.get_stage_duration("agents_start", "agents_done") or 0,
                    "integrity_check": tracker.get_stage_duration("agents_done", "integrity_done") or 0,
                    "scoring": tracker.get_stage_duration("integrity_done", "scoring_done") or 0,
                    "response_shaper": tracker.get_stage_duration("scoring_done", "response_shaped") or 0,
                    "total": tracker.get_stage_duration("pipeline_start", "pipeline_end") or total_ms,
                },
                total_processing_ms=total_ms,
                winner_agent_id=winner.response.agent_id,
                input_tokens=cost.input_tokens,
                output_tokens=cost.output_tokens,
                estimated_cost_usd=cost.estimated_cost_usd,
            )

            record_usage(
                db=db,
                cost=cost,
                session_id=session_id,
                user_id=user.id if user else None,
                guest_ip=_get_client_ip(request) if not user else None,
                prompt_category=pipeline_result.classification.category.value,
                winner_agent_id=winner.response.agent_id,
                persona_ids=body.persona_ids,
                panel_used=[
                    {
                        "agent_id": agent.agent_id,
                        "persona_id": agent.persona_id,
                        "name": agent.name,
                        "color": agent.color,
                    }
                    for agent in active_agents
                ],
                mode="arena",
                winning_persona_id=get_persona_id_for_agent(winner.response.agent_id, body.persona_ids),
                total_processing_ms=total_ms,
            )

        except Exception as e:
            log_unhandled_exception(request_id, user_label, e)
            yield _sse_event("error", {"detail": str(e)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"
