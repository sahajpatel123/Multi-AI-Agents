"""Prompt route - main endpoint for submitting prompts to agents"""

import asyncio
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from arena.models.schemas import (
    PromptRequest,
    PromptResponse,
    ErrorResponse,
)
from arena.core.orchestrator import Orchestrator
from arena.core.scorer import Scorer
from arena.core.input_pipeline import run_input_pipeline
from arena.core.persona_integrity import check_integrity
from arena.core.response_shaper import assemble_payload
from arena.core.memory import get_memory_manager
from arena.core.contradiction_detector import get_contradiction_detector


router = APIRouter(prefix="/api", tags=["prompt"])


@router.post(
    "/prompt",
    response_model=PromptResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def submit_prompt(request: PromptRequest) -> PromptResponse:
    """
    Submit a prompt to all 4 agents simultaneously.
    
    Pipeline: input validation → toxicity gate → classify + extract intent →
    enrich prompt → fan out to agents → persona integrity → score → respond.
    """
    orchestrator = Orchestrator()
    scorer = Scorer()
    
    # Generate session ID if not provided
    session_id = request.session_id or str(uuid.uuid4())
    
    try:
        # Step 1: Input pipeline — classify, extract intent, toxicity gate
        pipeline_result = await run_input_pipeline(request.prompt)
        
        if not pipeline_result.passed:
            raise HTTPException(
                status_code=400,
                detail=pipeline_result.rejection_reason or "Prompt rejected by content policy",
            )
        
        # Step 2: Fan out to all 4 agents with enriched prompt
        responses = await orchestrator.run_all_agents(pipeline_result.enriched_prompt)
        
        # Step 3: Persona integrity check (drift guard + overlap filter)
        integrity_report = check_integrity(responses, session_id)
        
        # Step 4: Score all responses and determine winner
        scored_responses = await scorer.score_responses(
            request.prompt, responses, integrity_report
        )
        
        # Step 5: Get winner
        winner = scorer.get_winner(scored_responses)
        if not winner:
            raise HTTPException(status_code=500, detail="Failed to determine winner")
        
        # Step 5.5: Check for contradictions
        detector = get_contradiction_detector()
        contradiction_reports = await detector.check_all_agents(responses, session_id)
        
        # Attach contradiction flags to scored responses
        from arena.models.schemas import ContradictionFlag
        for scored in scored_responses:
            report = contradiction_reports.get(scored.response.agent_id)
            if report and report.contradiction_detected:
                scored.contradiction = ContradictionFlag(
                    detected=True,
                    previous_statement=report.previous_statement,
                    current_statement=report.current_statement,
                    severity=report.severity,
                )
        
        # Step 6: Shape final response (format winner, fix one-liners, assemble payload)
        final_response = await assemble_payload(
            prompt=request.prompt,
            session_id=session_id,
            prompt_category=pipeline_result.classification.category.value,
            scored_responses=scored_responses,
            winner=winner,
            integrity=integrity_report,
        )
        
        # Step 7: Save turn to memory
        memory = get_memory_manager()
        agent_responses_dict = {
            scored.response.agent_id: scored.response
            for scored in scored_responses
        }
        memory.add_turn(
            session_id=session_id,
            prompt=request.prompt,
            agent_responses=agent_responses_dict,
            winner_id=winner.response.agent_id,
        )
        
        return final_response
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@router.post("/prompt/stream")
async def stream_prompt(request: PromptRequest):
    """
    SSE streaming endpoint — streams agent tokens in real-time.
    
    Event types:
    - "pipeline"   → input pipeline result (category, passed)
    - "token"      → individual token from an agent
    - "agent_done" → an agent finished streaming
    - "result"     → final scored + shaped payload (same as /api/prompt response)
    - "error"      → something went wrong
    """
    orchestrator = Orchestrator()
    scorer = Scorer()
    session_id = request.session_id or str(uuid.uuid4())

    async def event_generator():
        try:
            # Step 1: Input pipeline
            pipeline_result = await run_input_pipeline(request.prompt)

            yield _sse_event("pipeline", {
                "passed": pipeline_result.passed,
                "category": pipeline_result.classification.category.value,
                "rejection_reason": pipeline_result.rejection_reason,
            })

            if not pipeline_result.passed:
                yield _sse_event("error", {
                    "detail": pipeline_result.rejection_reason or "Prompt rejected",
                })
                return

            # Step 2: Stream all agents in parallel
            queue, gather_task = await orchestrator.stream_all_agents(
                pipeline_result.enriched_prompt
            )

            # Consume the queue and yield SSE events
            while True:
                msg = await queue.get()
                event_type = msg["type"]

                if event_type == "token":
                    yield _sse_event("token", {
                        "agent_id": msg["agent_id"],
                        "token": msg["token"],
                    })
                elif event_type == "agent_done":
                    yield _sse_event("agent_done", {
                        "agent_id": msg["agent_id"],
                    })
                elif event_type == "agent_error":
                    yield _sse_event("agent_error", {
                        "agent_id": msg["agent_id"],
                        "error": msg["error"],
                    })
                elif event_type == "all_done":
                    break

            # Step 3: Get final parsed responses
            responses = await gather_task

            # Step 4: Integrity check
            integrity_report = check_integrity(responses, session_id)

            # Step 5: Score
            scored_responses = await scorer.score_responses(
                request.prompt, responses, integrity_report
            )

            # Step 6: Get winner + shape payload
            winner = scorer.get_winner(scored_responses)
            if not winner:
                yield _sse_event("error", {"detail": "Failed to determine winner"})
                return

            final = await assemble_payload(
                prompt=request.prompt,
                session_id=session_id,
                prompt_category=pipeline_result.classification.category.value,
                scored_responses=scored_responses,
                winner=winner,
                integrity=integrity_report,
            )

            yield _sse_event("result", final.model_dump(mode="json"))

        except Exception as e:
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
    """Format a Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"
