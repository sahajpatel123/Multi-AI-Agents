import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from arena.core.agent_pipeline import (
    run_agent_pipeline_on_blackboard,
    run_refinement_pipeline,
)
from arena.core.auth import get_current_user_required
from arena.core.blackboard import AgentStatus, Blackboard, StageStatus, create_blackboard, get_blackboard
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY
from arena.core.tier_config import has_feature, normalize_tier
from arena.database import SessionLocal, get_db
from arena.db_models import AgentContradiction, AgentTask as AgentTaskRow
from arena.models.schemas import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter()


class AgentTaskRequest(BaseModel):
    task: str


class AgentChallengeRequest(BaseModel):
    task_id: str = ""
    answer: str = ""
    task: str = ""


class AgentRebuttalRequest(BaseModel):
    task: str = ""
    answer: str = ""
    challenge: str = ""


class AgentFeedbackRequest(BaseModel):
    task_id: str
    feedback: str
    note: Optional[str] = None


class RefinementRequest(BaseModel):
    task_id: str
    message: str


class BridgeRequest(BaseModel):
    arena_answer: str
    original_question: str
    winning_persona: str = ""
    arena_score: int = 0


class AgentTaskRenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)


ANALYST_CHALLENGE_PROMPT = """
You are The Analyst challenging an AI-generated answer.

Your job: Find every logical flaw, weak assumption, and missing data
point in this answer.

Be ruthless. Be specific.
Do not suggest improvements.
Only attack weaknesses.

Format your challenge as:
## The Core Flaw
[the single most important problem]

## Weak Assumptions
[assumptions that may not hold]

## Missing Evidence
[what data is absent]

## Verdict
[one sentence on how much this weakens the answer]

Keep response under 200 words.
Be punchy not verbose.
"""

CONTRARIAN_CHALLENGE_PROMPT = """
You are The Contrarian.
You argue the opposite of whatever you are shown.

You have been given an answer.
Your job: Make the strongest possible case that this answer is wrong.

Not nuanced. Not balanced.
The most forceful counterargument that exists.

Format:
## The Opposite Case
[argue the complete opposite]

## Why This Answer Is Wrong
[most powerful objection]

## What Was Missed
[the perspective this ignores]

Keep under 150 words.
Be provocative and direct.
"""

PHILOSOPHER_CHALLENGE_PROMPT = """
You are The Philosopher.
You question premises.

You have been given an answer to a question. Your job: challenge
whether the question itself was right, and whether the answer's
foundational assumptions hold.

Format:
## The Flawed Premise
[what assumption underlies this]

## The Better Question
[what should have been asked]

## The Deeper Issue
[what this answer misses entirely]

Keep under 150 words.
Be intellectually sharp.
"""

REBUTTAL_SYSTEM_PROMPT = """
You are defending an AI-generated answer against a specific challenge.

You have:
1. The original task
2. Your original answer
3. A challenge to your answer

Your job:
Either defend your answer with stronger evidence, OR acknowledge
the valid point and refine your answer to address it.

Be honest. If the challenge reveals a real weakness, admit it and fix it.
If the challenge is wrong, explain why.

Format:
## Response to Challenge
[direct response to the objection]

## Refined Answer (if needed)
[updated answer incorporating valid criticism, or original answer if challenge is invalid]

## What This Changes
[one sentence on what if anything you updated and why]
"""


async def run_challenge(
    task: str,
    answer: str,
    challenger_name: str,
    system_prompt: str,
    model_key: str,
    temperature: float,
) -> dict:
    model = MODEL_REGISTRY.get(model_key, MODEL_REGISTRY["claude_sonnet"])
    provider = str(model.get("provider", "claude"))
    user_prompt = f"""
Original Task: {task}

Agent's Answer:
{answer}

Challenge this answer now.
"""
    try:
        response = await call_llm(
            client=model["client"],
            provider=provider,
            model_id=model["model_id"],
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=500,
        )
        return {
            "challenger": challenger_name,
            "challenge": response,
            "model": model["model_id"],
            "status": "complete",
        }
    except Exception as e:
        return {
            "challenger": challenger_name,
            "challenge": f"Challenge failed: {e}",
            "model": model_key,
            "status": "failed",
        }


def _stage_status_value(status) -> str:
    return status.value if hasattr(status, "value") else str(status)


def _ensure_agent_access(user: UserResponse) -> None:
    tier = normalize_tier(user.tier)
    if not has_feature(tier, "agent_mode"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "agent_not_available",
                "message": "Agent Mode requires a Pro subscription.",
                "upgrade_required": "pro",
            },
        )


def _ensure_task_owner(bb: Blackboard, user: UserResponse) -> None:
    if bb.user_id != user.id:
        raise HTTPException(status_code=404, detail="Task not found")


async def run_agent_pipeline_background(task_id: str, user_id: int, task: str) -> None:
    """Run pipeline for an existing blackboard (same task_id as POST /run)."""
    bb = get_blackboard(task_id)
    if not bb:
        logger.error("[AGENT] Background: no blackboard for task_id=%s", task_id)
        return
    if bb.user_id != user_id or bb.task != task:
        logger.error("[AGENT] Background: blackboard mismatch task_id=%s", task_id)
        return

    memory_context = None
    try:
        db_ctx = SessionLocal()
        try:
            from arena.core.agent_memory import get_user_memory_context

            memory_context = get_user_memory_context(
                db_ctx, user_id, current_task=task, limit=5
            )
        finally:
            db_ctx.close()
    except Exception as e:
        logger.warning("[AGENT] Memory context load failed (non-fatal): %s", e)

    try:
        await run_agent_pipeline_on_blackboard(bb, memory_context=memory_context)
    except Exception as e:
        bb2 = get_blackboard(task_id)
        if bb2:
            bb2.status = AgentStatus.FAILED
            bb2.error = str(e)
        logger.exception("[AGENT] Background pipeline error task_id=%s", task_id)
        return

    if bb.status != AgentStatus.COMPLETE:
        return

    await _save_completed_task_to_memory(bb, user_id, task)


async def _save_completed_task_to_memory(
    bb: Blackboard,
    user_id: int,
    task_text_for_memory: str,
) -> None:
    """Persist completed agent run to research memory (non-fatal on failure)."""
    try:
        from arena.core.agent_memory import save_task_to_memory

        db = SessionLocal()
        try:
            sources = list(bb.sources or [])
            try:
                parsed = json.loads(bb.final_answer)
                if isinstance(parsed, dict) and parsed.get("sources_referenced"):
                    for s in parsed["sources_referenced"]:
                        s = str(s)
                        if s not in sources:
                            sources.append(s)
            except Exception:
                pass

            stage_pairs = [
                ("planner", bb.plan),
                ("researcher", bb.research),
                ("solver", bb.solution),
                ("critic", bb.critique),
                ("verifier", bb.verification),
                ("synthesizer", bb.synthesis),
                ("judge", bb.judgment),
            ]
            stages_run = [
                name
                for name, sr in stage_pairs
                if sr.status in (StageStatus.COMPLETE, StageStatus.SKIPPED)
            ]

            await save_task_to_memory(
                db=db,
                user_id=user_id,
                task_id=bb.task_id,
                task_text=task_text_for_memory,
                final_answer=bb.final_answer or "",
                final_score=bb.final_score,
                final_confidence=bb.final_confidence,
                sources_used=sources,
                stages_run=stages_run,
            )

            rows = (
                db.query(AgentContradiction)
                .filter(AgentContradiction.new_task_id == bb.task_id)
                .all()
            )
            bb.contradictions = [
                {
                    "summary": r.contradiction_summary,
                    "severity": r.severity,
                    "old_task_id": r.old_task_id or "",
                }
                for r in rows
            ]
            bb.memory_saved = True
        finally:
            db.close()
    except Exception as e:
        logger.warning("[AGENT] Memory save failed (non-fatal): %s", e)


async def run_refinement_background(
    task_id: str,
    user_message: str,
    user_id: int,
) -> None:
    bb = get_blackboard(task_id)
    if not bb:
        logger.error("[REFINEMENT] No blackboard for task_id=%s", task_id)
        return
    try:
        await run_refinement_pipeline(
            existing_bb=bb,
            user_message=user_message,
            user_id=user_id,
        )
    except Exception as e:
        bb2 = get_blackboard(task_id)
        if bb2:
            bb2.status = AgentStatus.FAILED
            bb2.error = str(e)
        logger.exception("[REFINEMENT] Background failed task_id=%s", task_id)


async def run_bridge_pipeline_background(task_id: str, user_id: int) -> None:
    bb = get_blackboard(task_id)
    if not bb or bb.user_id != user_id:
        logger.error("[BRIDGE] Invalid blackboard task_id=%s", task_id)
        return
    try:
        await run_agent_pipeline_on_blackboard(bb, memory_context=None)
    except Exception as e:
        bb2 = get_blackboard(task_id)
        if bb2:
            bb2.status = AgentStatus.FAILED
            bb2.error = str(e)
        logger.exception("[BRIDGE] Pipeline error task_id=%s", task_id)
        return

    if bb.status != AgentStatus.COMPLETE:
        return

    await _save_completed_task_to_memory(bb, user_id, bb.task)


@router.post("/run")
async def run_agent_task(
    body: AgentTaskRequest,
    background_tasks: BackgroundTasks,
    user: UserResponse = Depends(get_current_user_required),
):
    _ensure_agent_access(user)

    task = body.task.strip()
    if not task:
        raise HTTPException(status_code=400, detail="Task cannot be empty")
    if len(task) > 2000:
        raise HTTPException(
            status_code=400,
            detail="Task too long. Maximum 2000 characters.",
        )

    bb = create_blackboard(user_id=user.id, task=task)
    bb.status = AgentStatus.RUNNING

    background_tasks.add_task(
        run_agent_pipeline_background,
        bb.task_id,
        user.id,
        task,
    )

    return JSONResponse(
        content={
            "task_id": bb.task_id,
            "status": "running",
            "message": "Pipeline started",
        }
    )


@router.get("/status/{task_id}")
async def get_agent_status(
    task_id: str,
    user: UserResponse = Depends(get_current_user_required),
):
    _ensure_agent_access(user)
    bb = get_blackboard(task_id)
    if not bb:
        raise HTTPException(status_code=404, detail="Task not found")
    _ensure_task_owner(bb, user)

    return JSONResponse(
        content={
            "task_id": bb.task_id,
            "status": _stage_status_value(bb.status),
            "current_stage": bb.current_stage,
            "stages": {
                "planner": {"status": _stage_status_value(bb.plan.status)},
                "researcher": {"status": _stage_status_value(bb.research.status)},
                "solver": {"status": _stage_status_value(bb.solution.status)},
                "critic": {"status": _stage_status_value(bb.critique.status)},
                "verifier": {"status": _stage_status_value(bb.verification.status)},
                "synthesizer": {"status": _stage_status_value(bb.synthesis.status)},
                "judge": {"status": _stage_status_value(bb.judgment.status)},
            },
        }
    )


@router.get("/result/{task_id}")
async def get_agent_result(
    task_id: str,
    user: UserResponse = Depends(get_current_user_required),
):
    """Returns full blackboard including per-stage output, model, and duration_ms for revision trace."""
    _ensure_agent_access(user)
    bb = get_blackboard(task_id)
    if not bb:
        raise HTTPException(status_code=404, detail="Task not found or expired")
    _ensure_task_owner(bb, user)

    return JSONResponse(content=bb.to_dict())


@router.post("/challenge")
async def challenge_agent_answer(
    body: AgentChallengeRequest,
    user: UserResponse = Depends(get_current_user_required),
):
    _ensure_agent_access(user)
    answer = body.answer.strip()
    if not answer:
        raise HTTPException(status_code=400, detail="Answer required")

    task_text = body.task.strip()
    tid = body.task_id.strip()
    if tid:
        bb = get_blackboard(tid)
        if not bb:
            raise HTTPException(status_code=404, detail="Task not found")
        _ensure_task_owner(bb, user)
        task_text = bb.task
    if not task_text:
        raise HTTPException(
            status_code=400,
            detail="Original task required (provide task_id or task)",
        )

    challenges = await asyncio.gather(
        run_challenge(
            task_text,
            answer,
            "The Analyst",
            ANALYST_CHALLENGE_PROMPT,
            "deepseek_v3",
            0.2,
        ),
        run_challenge(
            task_text,
            answer,
            "The Contrarian",
            CONTRARIAN_CHALLENGE_PROMPT,
            "grok_3_mini",
            1.0,
        ),
        run_challenge(
            task_text,
            answer,
            "The Philosopher",
            PHILOSOPHER_CHALLENGE_PROMPT,
            "gpt_4o",
            0.7,
        ),
    )

    return JSONResponse(
        content={
            "task_id": tid,
            "challenges": list(challenges),
            "challenger_count": 3,
        }
    )


@router.post("/rebuttal")
async def agent_rebuttal(
    body: AgentRebuttalRequest,
    user: UserResponse = Depends(get_current_user_required),
):
    _ensure_agent_access(user)
    task = body.task.strip() or "(context not provided)"
    answer = body.answer.strip()
    challenge = body.challenge.strip()
    if not answer or not challenge:
        raise HTTPException(status_code=400, detail="Answer and challenge required")

    model = MODEL_REGISTRY["claude_sonnet"]
    user_prompt = f"""
Original Task: {task}

My Original Answer:
{answer}

Challenge Received:
{challenge}

Respond to this challenge now.
"""
    try:
        response = await call_llm(
            client=model["client"],
            provider="claude",
            model_id=model["model_id"],
            system_prompt=REBUTTAL_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.4,
            max_tokens=600,
        )
        return JSONResponse(content={"rebuttal": response, "status": "complete"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/history")
async def get_agent_history(
    page: int = Query(1, ge=1),
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user)
    from arena.core.agent_memory import get_user_task_history

    history = get_user_task_history(db=db, user_id=user.id, page=page, per_page=20)
    return JSONResponse(content=history)


@router.patch("/tasks/{task_id}/rename")
async def rename_agent_task(
    task_id: str,
    body: AgentTaskRenameRequest,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    row = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == task_id, AgentTaskRow.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    trimmed = body.title.strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    row.title = trimmed[:120]
    db.commit()
    db.refresh(row)
    return JSONResponse(content={"success": True, "title": row.title})


@router.delete("/tasks/{task_id}")
async def delete_agent_task(
    task_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    row = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == task_id, AgentTaskRow.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(row)
    db.commit()
    return JSONResponse(content={"success": True})


@router.get("/memory/context")
async def get_memory_context(
    task: str = "",
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user)
    from arena.core.agent_memory import get_user_memory_context

    context = get_user_memory_context(
        db=db, user_id=user.id, current_task=task, limit=5
    )
    return JSONResponse(content=context)


@router.get("/saved/{task_id}")
async def get_saved_agent_task(
    task_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Load a persisted Agent task from DB (when in-memory blackboard expired)."""
    _ensure_agent_access(user)
    row = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == task_id, AgentTaskRow.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    contra = (
        db.query(AgentContradiction)
        .filter(
            AgentContradiction.new_task_id == task_id,
            AgentContradiction.user_id == user.id,
        )
        .all()
    )
    contradictions = [
        {
            "summary": c.contradiction_summary,
            "severity": c.severity,
            "old_task_id": c.old_task_id or "",
        }
        for c in contra
    ]
    return JSONResponse(
        content={
            "task_id": row.task_id,
            "task": row.task_text,
            "final_answer": row.final_answer,
            "final_score": row.final_score,
            "final_confidence": row.final_confidence,
            "topics": json.loads(row.topics or "[]"),
            "user_feedback": row.user_feedback,
            "created_at": row.created_at.isoformat() if row.created_at else "",
            "source_integrity": {},
            "contradictions": contradictions,
            "memory_saved": True,
            "status": "complete",
        }
    )


@router.post("/feedback")
async def submit_task_feedback(
    body: AgentFeedbackRequest,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user)
    task_record = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == body.task_id, AgentTaskRow.user_id == user.id)
        .first()
    )
    if not task_record:
        raise HTTPException(status_code=404, detail="Task not found")

    valid_feedback = ("accurate", "inaccurate", "partial")
    if body.feedback not in valid_feedback:
        raise HTTPException(status_code=400, detail="Invalid feedback value")

    task_record.user_feedback = body.feedback
    task_record.feedback_note = body.note
    db.commit()

    return JSONResponse(
        content={
            "status": "saved",
            "task_id": body.task_id,
            "feedback": body.feedback,
        }
    )


@router.post("/refine")
async def refine_agent_answer(
    body: RefinementRequest,
    background_tasks: BackgroundTasks,
    user: UserResponse = Depends(get_current_user_required),
):
    _ensure_agent_access(user)

    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(message) > 1000:
        raise HTTPException(
            status_code=400,
            detail="Message too long. Max 1000 characters.",
        )

    bb = get_blackboard(body.task_id.strip())
    if not bb:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "task_not_found",
                "message": "Task expired. Start new task.",
            },
        )

    if bb.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if bb.refinement_count >= 10:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "refinement_limit",
                "message": "Maximum refinements reached for this task. Start a new task to continue.",
            },
        )

    bb.status = AgentStatus.RUNNING
    bb.error = None

    background_tasks.add_task(
        run_refinement_background,
        body.task_id.strip(),
        message,
        user.id,
    )

    return JSONResponse(
        content={
            "task_id": body.task_id.strip(),
            "status": "refining",
            "refinement_count": bb.refinement_count + 1,
            "message": "Refinement started",
        }
    )


@router.post("/verify-from-arena")
async def verify_arena_answer(
    body: BridgeRequest,
    background_tasks: BackgroundTasks,
    user: UserResponse = Depends(get_current_user_required),
):
    _ensure_agent_access(user)

    arena_answer = body.arena_answer.strip()
    original_question = body.original_question.strip()
    if not arena_answer or not original_question:
        raise HTTPException(
            status_code=400,
            detail="Answer and question required",
        )

    persona = body.winning_persona.strip() or "Arena winner"
    verification_task = (
        f"VERIFICATION TASK:\n"
        f"Original question: {original_question}\n\n"
        f"Answer to verify (from {persona} with score {body.arena_score}/100):\n"
        f"{arena_answer}\n\n"
        f"Your job: rigorously verify this answer. Find supporting evidence. "
        f"Attack assumptions. Score every claim. Produce a verified, refined version."
    )

    bb = create_blackboard(user_id=user.id, task=verification_task)
    bb.status = AgentStatus.RUNNING
    bb.error = None
    bb.bridge_from_arena = True
    bb.plan.reasoning = (
        "This is a verification task for an Arena answer. "
        "Focus on fact-checking and assumption testing. "
        f"The original question was: {original_question}"
    )

    background_tasks.add_task(
        run_bridge_pipeline_background,
        bb.task_id,
        user.id,
    )

    return JSONResponse(
        content={
            "task_id": bb.task_id,
            "status": "running",
            "message": "Agent is verifying the Arena answer",
        }
    )
