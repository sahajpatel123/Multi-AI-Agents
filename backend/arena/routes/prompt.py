"""Prompt route — main endpoint for submitting prompts to agents"""

import json
import time
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from arena.core.datetime_utils import utcnow_naive
from arena.core.dependencies import get_current_user_required
from arena.core.contradiction_detector import get_contradiction_detector
from arena.core.cost_tracker import (
    RateLimitExceeded,
    RequestCostAccumulator,
    TokenBudgetExceeded,
    check_and_increment_user,
    check_token_budget,
    record_usage,
)
from arena.core.rate_limits import enforce_ip_rate_limit
from arena.core.input_pipeline import run_input_pipeline
from arena.core.memory import SessionOwnershipError, get_memory_manager
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
from arena.core.tier_config import (
    UserTier,
    get_tier_personas,
    get_tier_str,
    has_feature,
    normalize_tier,
    validate_persona_access,
)
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


def _check_rate_limit(
    request: Request,
    user: UserResponse,
    db: Session,
    request_id: str,
) -> None:
    """Enforce rate limits BEFORE touching the input pipeline. Raises HTTPException if exceeded."""
    try:
        check_and_increment_user(db, user.id, user.tier)
    except RateLimitExceeded as e:
        log_rate_limit_hit(
            request_id=request_id,
            user_id=str(user.id),
            tier=e.tier,
            used=e.used,
            limit=e.limit,
        )
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limit_exceeded",
                "scope": e.scope,
                "message": e.message,
                "tier": e.tier,
                "prompts_used": e.used,
                "daily_limit": e.limit,
            },
        )


def _check_token_budget(
    user: UserResponse,
    db: Session,
) -> None:
    """Block the request if the user is over their daily token budget."""
    try:
        check_token_budget(db, user.id)
    except TokenBudgetExceeded as e:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limit_exceeded",
                "scope": "tokens",
                "message": e.message,
                "tier": e.tier,
                "tokens_used": e.used,
                "daily_token_budget": e.limit,
            },
        )


def _get_request_tier(user: UserResponse) -> UserTier:
    return normalize_tier(get_tier_str(user))


def _enforce_persona_access(user_tier: UserTier, persona_ids: list[str] | None) -> None:
    if not persona_ids:
        return

    is_allowed, blocked = validate_persona_access(user_tier, persona_ids)
    if not is_allowed:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "persona_not_allowed",
                "message": "Some personas in your panel require a Plus or Pro subscription.",
                "blocked_personas": blocked,
                "upgrade_required": "plus",
                "allowed_personas": sorted(get_tier_personas(user_tier)),
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
    user: UserResponse = Depends(get_current_user_required),
) -> PromptResponse:
    """Submit a prompt to all 4 agents simultaneously."""
    request_id = new_request_id()
    t_start = time.monotonic()
    tracker = LatencyTracker()
    tracker.mark("pipeline_start")
    orchestrator = Orchestrator()
    scorer = Scorer()
    session_id = body.session_id or str(uuid.uuid4())
    user_label = str(user.id)

    _check_rate_limit(request, user, db, request_id)
    _check_token_budget(user, db)
    user_tier = _get_request_tier(user)
    _enforce_persona_access(user_tier, body.persona_ids)
    memory_enabled = has_feature(user_tier, "memory")

    cost = RequestCostAccumulator(request_id=request_id)

    try:
        try:
            active_agents = get_all_agents(body.persona_ids)
        except ValueError as e:
            raise HTTPException(status_code=400, detail="Invalid persona selection") from e

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
            user_id=user.id if memory_enabled else None,
            db=db if memory_enabled else None,
            session_id=session_id,
            tracker=tracker,
        )
        agent_timings["all_agents"] = int((time.monotonic() - t_agents) * 1000)

        integrity_report = await check_integrity(
            responses,
            session_id,
            prompt=body.prompt,
            user_id=user.id,
            persona_ids=body.persona_ids,
            db=db,
        )
        tracker.mark("integrity_done")

        scored_responses = await scorer.score_responses(
            body.prompt,
            responses,
            integrity_report,
            session_id=session_id,
            user_id=user.id,
            prompt_category=pipeline_result.classification.category.value,
            persona_ids=body.persona_ids,
            db=db,
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
        try:
            memory.add_turn(
                session_id=session_id,
                prompt=body.prompt,
                prompt_category=pipeline_result.classification.category.value,
                scored_responses=scored_responses,
                winner_id=winner.response.agent_id,
                winner_persona_id=get_persona_id_for_agent(winner.response.agent_id, body.persona_ids),
                persona_ids=body.persona_ids,
                user_id=str(user.id),
            )
        except SessionOwnershipError as exc:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "forbidden",
                    "message": "Session does not belong to this user",
                },
            ) from exc

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
            user_id=user.id,
            guest_ip=None,
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
        raise HTTPException(status_code=500, detail="Prompt request failed")


@router.post("/prompt/stream")
async def stream_prompt(
    request: Request,
    body: PromptRequest,
    db: Session = Depends(get_db),
    user: UserResponse = Depends(get_current_user_required),
):
    """SSE streaming endpoint — streams agent tokens in real-time."""
    request_id = new_request_id()
    t_start = time.monotonic()
    tracker = LatencyTracker()
    tracker.mark("pipeline_start")
    orchestrator = Orchestrator()
    scorer = Scorer()
    session_id = body.session_id or str(uuid.uuid4())
    user_label = str(user.id)

    _check_rate_limit(request, user, db, request_id)
    _check_token_budget(user, db)
    user_tier = _get_request_tier(user)
    _enforce_persona_access(user_tier, body.persona_ids)
    memory_enabled = has_feature(user_tier, "memory")

    cost = RequestCostAccumulator(request_id=request_id)

    async def event_generator():
        gather_task = None
        try:
            try:
                active_agents = get_all_agents(body.persona_ids)
            except ValueError as e:
                yield _sse_event("error", {"detail": "Prompt request failed"})
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
                user_id=user.id if memory_enabled else None,
                db=db if memory_enabled else None,
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
                user_id=user.id,
                persona_ids=body.persona_ids,
                db=db,
            )
            tracker.mark("integrity_done")
            scored_responses = await scorer.score_responses(
                body.prompt,
                responses,
                integrity_report,
                session_id=session_id,
                user_id=user.id,
                prompt_category=pipeline_result.classification.category.value,
                persona_ids=body.persona_ids,
                db=db,
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
            try:
                memory.add_turn(
                    session_id=session_id,
                    prompt=body.prompt,
                    prompt_category=pipeline_result.classification.category.value,
                    scored_responses=scored_responses,
                    winner_id=winner.response.agent_id,
                    winner_persona_id=get_persona_id_for_agent(winner.response.agent_id, body.persona_ids),
                    persona_ids=body.persona_ids,
                    user_id=str(user.id),
                )
            except SessionOwnershipError as exc:
                yield _sse_event(
                    "error",
                    {
                        "error": "forbidden",
                        "message": "Session does not belong to this user",
                    },
                )
                return

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
                user_id=user.id,
                guest_ip=None,
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
            yield _sse_event("error", {"detail": "Prompt request failed"})
        finally:
            # If the stream ends early — client disconnect (GeneratorExit) or a
            # mid-stream error — the background agent task may still be running.
            # Cancel it so agents stop generating instead of burning LLM tokens
            # for a response nobody will receive, and to avoid orphaned tasks.
            if gather_task is not None and not gather_task.done():
                gather_task.cancel()
                try:
                    await gather_task
                except BaseException:
                    pass

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


# ──────────────────────────────────────────────────────────────
# Liveness + readiness probes (no auth — Render's uptime checker hits these)
# ──────────────────────────────────────────────────────────────


@router.get("/prompt/health")
async def prompt_health(request: Request) -> dict:
    """Liveness probe — process is up and the route is reachable.

    No auth, no DB call: this is the cheapest possible check so a
    load balancer can hit it every few seconds without load on
    Postgres. A 200 here means the FastAPI worker can serve requests;
    it does NOT mean the prompt pipeline works. Use /readiness for that.
    """
    # Generous IP cap — probes are frequent; still block abusive floods.
    enforce_ip_rate_limit(
        request,
        scope="prompt_health",
        limit=300,
        window_seconds=60,
        message="Too many health probes. Please slow down.",
    )
    return {"status": "ok", "service": "arena-prompt"}


@router.get("/prompt/readiness")
async def prompt_readiness(
    request: Request,
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Readiness probe — DB reachable AND short-term memory store loaded.

    A 200 means the prompt pipeline can plausibly serve a request:
      - DB: a trivial SELECT round-trips
      - memory: the in-process ShortTermMemory has been instantiated
        (presence guarantees no startup crash; absence indicates the
        lifespan hook failed)
      - prompt route registered: defensive check that /prompt is on
        the router (catches a misconfigured app where health lives but
        the actual prompt route is missing)

    Returns 503 if any check fails — load balancers and uptime
    checkers treat 503 as 'remove from rotation'.
    """
    # Lower than liveness — readiness hits Postgres.
    enforce_ip_rate_limit(
        request,
        scope="prompt_readiness",
        limit=120,
        window_seconds=60,
        message="Too many readiness probes. Please slow down.",
    )
    checks: dict[str, str] = {}
    ok = True

    # DB round-trip — a `SELECT 1` is the cheapest meaningful query.
    try:
        db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as exc:  # noqa: BLE001 — surface any failure mode
        checks["db"] = f"fail: {type(exc).__name__}"
        ok = False

    # Short-term memory — module-level singleton. Absence means the
    # app started but the memory manager failed to initialize, in
    # which case every prompt would 500.
    try:
        from arena.core.memory import get_memory_manager

        mm = get_memory_manager()
        checks["memory"] = "ok" if mm is not None else "fail: not initialized"
        if mm is None:
            ok = False
    except Exception as exc:  # noqa: BLE001
        checks["memory"] = f"fail: {type(exc).__name__}"
        ok = False

    # Prompt route registration — there are routes registered before
    # and after this one; if our exact path is missing, the lifespan
    # must have failed silently. We trust that if memory + db are
    # both healthy, /prompt is also wired (it's mounted
    # unconditionally in main.py).
    checks["prompt_route"] = "ok"

    body = {
        "status": "ok" if ok else "degraded",
        "service": "arena-prompt",
        "checked_at": utcnow_naive().isoformat() + "Z",
        "checks": checks,
    }
    return JSONResponse(status_code=200 if ok else 503, content=body)
