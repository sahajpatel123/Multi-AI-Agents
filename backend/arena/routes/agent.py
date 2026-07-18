import asyncio
import json
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from arena.core.agent_pipeline import (
    record_agent_task_usage,
    run_agent_pipeline_on_blackboard,
    run_refinement_pipeline,
)
from arena.core.file_ingest import process_upload
from arena.core.http_headers import content_disposition_attachment
from arena.core.upload_store import UPLOAD_DIR, ensure_upload_dir, register_upload, resolve_attachments
from arena.core.dependencies import get_current_user_required
from arena.core.blackboard import AgentStatus, Blackboard, StageStatus, create_blackboard, get_blackboard
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY
from arena.core.cost_tracker import get_today_token_usage
from arena.core.input_validation import (
    sanitize_html,
    sanitize_model_optional_text,
    sanitize_model_text,
    sanitize_text,
)
from arena.core.rate_limits import enforce_user_rate_limit
from arena.core.tier_config import UserTier, get_credit_budget, get_tier_str, has_feature, normalize_tier
from arena.core.agent_orchestration import synthesise_tasks
from arena.core.feedback_calibrator import (
    get_answer_feedback_distribution,
    get_recent_feedback,
)
from arena.core.agent_memory import get_watchlist_history
from arena.core.report_generator import (
    generate_orchestration_report_html,
    generate_report_html,
    write_pdf_or_html,
)
from arena.core.templates import get_templates_grouped_by_category
from arena.core.capabilities import (
    ConduraCapability,
    HybridDelegateCapability,
    HybridPrepCapability,
    evaluate_capability_gate,
    get_capability_doc,
    list_capabilities,
    list_capability_examples,
    REGISTRY,
)
from arena.core.telemetry import record_guard_decision
from arena.database import SessionLocal, get_db
from arena.db_models import (
    AgentContradiction,
    AgentTask as AgentTaskRow,
    AnswerFeedback,
    Orchestration,
    User,
    WatchlistItem,
)
from arena.models.schemas import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter()


def _enforce_capability_gate(
    *,
    capability_id: str | None = None,
    task_text: str | None = None,
) -> None:
    """Reject condura / hybrid_delegate work on web when feature flag is on.

    Uses the shared evaluate_capability_gate decision so HTTP routes and
    background runners cannot drift.
    """
    result = evaluate_capability_gate(capability_id=capability_id, task_text=task_text)
    cid = result["capability_id"]
    env = result["env"]
    decision = result["decision"]
    record_guard_decision(cid, decision)
    if decision == "allow":
        return
    if decision == "fallback":
        logger.info(
            "Condura gate: would reject capability=%s env=%s (flag off)",
            cid,
            env.value,
        )
        return
    raise HTTPException(
        status_code=409,
        detail=result["error_body"],
    )

# Sidebar history window by subscription tier (not related to temporal_profile / recheck_by).
AGENT_HISTORY_RETENTION_DAYS: dict[UserTier, int] = {
    UserTier.GUEST: 30,
    UserTier.FREE: 30,
    UserTier.PLUS: 180,
    UserTier.PRO: 365,
}


def _json_column_value(value) -> list | dict | None:
    """Normalize JSON columns (PostgreSQL returns objects; SQLite may return str)."""
    if value is None:
        return None
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return None
    return None


def _pipeline_contradictions_from_row(row: AgentTaskRow) -> list:
    parsed = _json_column_value(row.contradictions)
    return parsed if isinstance(parsed, list) else []


def _insight_report_from_row(row: AgentTaskRow) -> dict | None:
    parsed = _json_column_value(row.insight_report)
    return parsed if isinstance(parsed, dict) else None


def _intelligence_score_from_row(row: AgentTaskRow) -> dict:
    parsed = _json_column_value(row.intelligence_score)
    return parsed if isinstance(parsed, dict) else {}


def _live_updates_from_row(row: AgentTaskRow) -> list:
    parsed = _json_column_value(row.live_updates)
    return parsed if isinstance(parsed, list) else []


def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _merge_db_task_into_result_payload(payload: dict, row: AgentTaskRow) -> None:
    """Overlay persisted columns (live thread, stored intelligence) onto a blackboard dict."""
    payload["intelligence_score"] = _intelligence_score_from_row(row) or payload.get(
        "intelligence_score", {}
    )
    payload["is_live"] = bool(row.is_live)
    payload["live_last_checked"] = (
        row.live_last_checked.isoformat() if row.live_last_checked else None
    )
    payload["live_next_check"] = (
        row.live_next_check.isoformat() if row.live_next_check else None
    )
    payload["live_updates"] = _live_updates_from_row(row)


def _load_task_contradictions(db: Session, task_id: str, user_id: int) -> list[dict]:
    rows = (
        db.query(AgentContradiction)
        .filter(
            AgentContradiction.new_task_id == task_id,
            AgentContradiction.user_id == user_id,
        )
        .all()
    )
    return [
        {
            "summary": c.contradiction_summary,
            "severity": c.severity,
            "old_task_id": c.old_task_id or "",
        }
        for c in rows
    ]


def _persisted_agent_task_result_dict(
    row: AgentTaskRow, memory_contradictions: list[dict]
) -> dict:
    """Shape aligned with Blackboard.to_dict() for clients that call GET /result."""
    sources: list = []
    if row.sources_used:
        try:
            raw = json.loads(row.sources_used)
            if isinstance(raw, list):
                sources = raw
        except (json.JSONDecodeError, TypeError):
            pass

    def _stage_complete() -> dict:
        return {"status": "complete", "output": "", "model": "", "duration_ms": 0}

    stage_ids = (
        "planner",
        "researcher",
        "solver",
        "critic",
        "verifier",
        "synthesizer",
        "judge",
    )
    pipe_contra = _pipeline_contradictions_from_row(row)
    insight = _insight_report_from_row(row)
    intel = _intelligence_score_from_row(row)
    live_updates = _live_updates_from_row(row)
    return {
        "task_id": row.task_id,
        "user_id": row.user_id,
        "task": row.task_text,
        "original_task": row.task_text,
        "status": "complete",
        "current_stage": "done",
        "iterations": 0,
        "stages": {sid: _stage_complete() for sid in stage_ids},
        "final_answer": row.final_answer or "",
        "final_confidence": float(row.final_confidence or 0.0),
        "final_score": int(row.final_score or 0),
        "sources": sources,
        "flags": [],
        "caveats": [],
        "source_integrity": {},
        "contradictions": pipe_contra,
        "memory_contradictions": memory_contradictions,
        "insight_report": insight,
        "intelligence_score": intel,
        "assumptions": {},
        "memory_saved": True,
        "conversation": [],
        "is_refinement": False,
        "parent_task_id": "",
        "refinement_count": 0,
        "bridge_from_arena": False,
        "total_tokens": 0,
        "total_cost_usd": 0.0,
        "error": None,
        "expertise_level": "curious",
        "expertise_domain": "",
        "expertise_modifier": "",
        "steelman": None,
        "is_live": bool(row.is_live),
        "live_last_checked": row.live_last_checked.isoformat()
        if row.live_last_checked
        else None,
        "live_next_check": row.live_next_check.isoformat()
        if row.live_next_check
        else None,
        "live_updates": live_updates,
    }


class AgentTaskRequest(BaseModel):
    task: str
    expertise_level: str = "curious"
    expertise_domain: str = ""
    attachment_ids: list[str] = Field(default_factory=list)
    mcp_integration_ids: list[int] = Field(default_factory=list)

    @field_validator("task")
    @classmethod
    def validate_task(cls, v: str) -> str:
        return sanitize_model_text(v, max_length=2000, field_name="task")

    @field_validator("expertise_domain")
    @classmethod
    def validate_expertise_domain(cls, v: str) -> str:
        return sanitize_model_optional_text(v, max_length=100, field_name="expertise_domain") or ""


class AgentChallengeRequest(BaseModel):
    task_id: str = ""
    answer: str = ""
    task: str = ""

    @field_validator("answer", "task")
    @classmethod
    def validate_optional_content(cls, v: str, info) -> str:
        if not v:
            return ""
        return sanitize_model_text(v, max_length=2000, field_name=info.field_name)


class AgentRebuttalRequest(BaseModel):
    task: str = ""
    answer: str = ""
    challenge: str = ""

    @field_validator("task", "answer", "challenge")
    @classmethod
    def validate_rebuttal_text(cls, v: str, info) -> str:
        if info.field_name == "task" and not v:
            return ""
        return sanitize_model_text(v, max_length=2000, field_name=info.field_name)


class AgentFeedbackRequest(BaseModel):
    task_id: str
    feedback: str
    note: Optional[str] = None

    @field_validator("note")
    @classmethod
    def validate_feedback_note(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_model_optional_text(v, max_length=1000, field_name="note")


class AnswerAccuracyFeedbackBody(BaseModel):
    verdict: str
    note: Optional[str] = None

    @field_validator("note")
    @classmethod
    def validate_answer_feedback_note(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_model_optional_text(v, max_length=1000, field_name="note")


class RefinementRequest(BaseModel):
    task_id: str
    message: str

    @field_validator("message")
    @classmethod
    def validate_refinement_message(cls, v: str) -> str:
        return sanitize_model_text(v, max_length=1000, field_name="message")


class BridgeRequest(BaseModel):
    arena_answer: str
    original_question: str
    winning_persona: str = ""
    arena_score: int = 0

    @field_validator("arena_answer", "original_question")
    @classmethod
    def validate_bridge_text(cls, v: str, info) -> str:
        return sanitize_model_text(v, max_length=2000, field_name=info.field_name)

    @field_validator("winning_persona")
    @classmethod
    def validate_persona(cls, v: str) -> str:
        if not v:
            return ""
        return sanitize_model_text(v, max_length=100, field_name="winning_persona")


class AgentTaskRenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        return sanitize_model_text(v, max_length=100, field_name="title")


class LiveToggleBody(BaseModel):
    is_live: Optional[bool] = None
    # Optional reschedule window (hours, clamped 1..168) so users can
    # dial cadence per task without waiting for the next toggle round.
    reschedule_hours: Optional[int] = Field(default=None, ge=1, le=168)


class MarkLiveReadBody(BaseModel):
    update_id: Optional[str] = None


class OrchestrateRequest(BaseModel):
    questions: list[str]
    expertise_level: str = "curious"
    expertise_domain: str = ""

    @field_validator("questions")
    @classmethod
    def validate_questions(cls, values: list[str]) -> list[str]:
        return [sanitize_model_text(v, max_length=2000, field_name="question") for v in values]

    @field_validator("expertise_domain")
    @classmethod
    def validate_orchestration_domain(cls, v: str) -> str:
        return sanitize_model_optional_text(v, max_length=100, field_name="expertise_domain") or ""


class WatchlistCreateBody(BaseModel):
    question: str
    interval_hours: int
    expertise_level: str = "curious"
    expertise_domain: str = ""

    @field_validator("question")
    @classmethod
    def validate_question(cls, v: str) -> str:
        return sanitize_model_text(v, max_length=2000, field_name="question")

    @field_validator("expertise_domain")
    @classmethod
    def validate_watchlist_domain(cls, v: str) -> str:
        return sanitize_model_optional_text(v, max_length=100, field_name="expertise_domain") or ""


class WatchlistPatchBody(BaseModel):
    interval_hours: Optional[int] = None
    is_active: Optional[bool] = None


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
        response, _, _ = await call_llm(
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


def _ensure_agent_access(user: UserResponse, db: Session) -> None:
    u = db.query(User).filter(User.id == user.id).first()
    if not u:
        raise HTTPException(status_code=401, detail="User not found")
    tier = normalize_tier(get_tier_str(u))
    if tier == UserTier.PRO:
        return
    if tier == UserTier.PLUS and (
        getattr(u, "agent_addon_active", False) or getattr(u, "agent_addon_cancelling", False)
    ):
        return
    raise HTTPException(
        status_code=403,
        detail={
            "error": "agent_not_available",
            "message": "Agent Mode requires Pro, or Plus with the Agent add-on.",
            "upgrade_required": "plus",
        },
    )


def _ensure_agent_orchestrate_access(user: UserResponse) -> None:
    tier = normalize_tier(get_tier_str(user))
    if not has_feature(tier, "agent_orchestrate"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "orchestrate_not_available",
                "message": "Multi-task orchestration requires Arena Pro.",
                "upgrade_required": "pro",
            },
        )


def _ensure_agent_watchlist_access(user: UserResponse) -> None:
    tier = normalize_tier(get_tier_str(user))
    if not has_feature(tier, "agent_watchlist"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "watchlist_not_available",
                "message": "Watchlist is available on Arena Plus and Pro.",
                "upgrade_required": "plus",
            },
        )


WATCHLIST_INTERVALS = frozenset({24, 72, 168})
WATCHLIST_MAX_ACTIVE = 10
# Live research threads schedule periodic LLM re-checks. Without a per-user
# ceiling an authenticated client can mark thousands of historical tasks live
# and saturate the live_scheduler / provider budget.
LIVE_MAX_ACTIVE = 10


def _watchlist_latest_summary(db: Session, user_id: int, latest_task_id: Optional[str]) -> Optional[dict]:
    if not latest_task_id:
        return None
    row = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == latest_task_id, AgentTaskRow.user_id == user_id)
        .first()
    )
    if not row:
        return None
    title = (row.title or "").strip() or (row.task_text or "")[:80]
    return {
        "task_id": row.task_id,
        "title": title,
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "final_score": row.final_score,
    }


def _watchlist_item_api_dict(db: Session, item: WatchlistItem) -> dict:
    return {
        "id": item.id,
        "question": item.question,
        "interval_hours": item.interval_hours,
        "expertise_level": item.expertise_level or "curious",
        "expertise_domain": item.expertise_domain or "",
        "last_run_at": item.last_run_at.isoformat() if item.last_run_at else None,
        "next_run_at": item.next_run_at.isoformat() if item.next_run_at else "",
        "latest_task_id": item.latest_task_id,
        "run_count": int(item.run_count or 0),
        "is_active": bool(item.is_active),
        "created_at": item.created_at.isoformat() if item.created_at else "",
        "latest_task": _watchlist_latest_summary(db, item.user_id, item.latest_task_id),
    }


def _export_overlay_from_bb(bb: Optional[Blackboard]) -> Optional[dict]:
    if not bb or bb.status != AgentStatus.COMPLETE:
        return None
    return {
        "caveats": list(bb.caveats or []),
        "steelman": bb.steelman or {},
        "assumptions": bb.assumptions or {},
        "sources": list(bb.sources or []),
        "intelligence_score": bb.intelligence_score or {},
    }


def _orchestration_any_task_failed(task_ids: list[str]) -> bool:
    for tid in task_ids:
        bb = get_blackboard(tid)
        if bb and bb.status == AgentStatus.FAILED:
            return True
    return False


async def run_orchestration_watcher(orch_id: str, user_id: int, task_ids: list[str]) -> None:
    deadline = time.monotonic() + 600.0
    while time.monotonic() < deadline:
        await asyncio.sleep(5.0)

        if _orchestration_any_task_failed(task_ids):
            db = SessionLocal()
            try:
                orch = db.query(Orchestration).filter(Orchestration.id == orch_id).first()
                if orch:
                    orch.status = "failed"
                    db.commit()
            finally:
                db.close()
            return

        db = SessionLocal()
        try:
            all_done = True
            for tid in task_ids:
                row = (
                    db.query(AgentTaskRow)
                    .filter(AgentTaskRow.task_id == tid, AgentTaskRow.user_id == user_id)
                    .first()
                )
                if not row or not (row.final_answer or "").strip():
                    all_done = False
                    break
            if not all_done:
                continue

            rows = (
                db.query(AgentTaskRow)
                .filter(
                    AgentTaskRow.user_id == user_id,
                    AgentTaskRow.task_id.in_(task_ids),
                )
                .all()
            )
            by_id = {r.task_id: r for r in rows}
            ordered = [by_id[tid] for tid in task_ids if tid in by_id]
            if len(ordered) != len(task_ids):
                continue

            out = await synthesise_tasks(ordered)
            orch = db.query(Orchestration).filter(Orchestration.id == orch_id).first()
            if orch:
                orch.synthesis = out.get("synthesis") or ""
                orch.synthesis_bullets = out.get("bullets") or []
                orch.conflicts = out.get("conflicts") or []
                orch.status = "complete"
                db.commit()
            return
        finally:
            db.close()

    db = SessionLocal()
    try:
        orch = db.query(Orchestration).filter(Orchestration.id == orch_id).first()
        if orch and orch.status == "running":
            orch.status = "failed"
            db.commit()
    finally:
        db.close()


def _ensure_task_owner(bb: Blackboard, user: UserResponse) -> None:
    if bb.user_id != user.id:
        raise HTTPException(status_code=404, detail="Task not found")


async def run_agent_pipeline_background(
    task_id: str,
    user_id: int,
    task: str,
    expertise_level: str = "curious",
    expertise_domain: str = "",
    orchestration_id: Optional[str] = None,
    watchlist_item_id: Optional[str] = None,
) -> None:
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
        await run_agent_pipeline_on_blackboard(
            bb,
            memory_context=memory_context,
            expertise_level=expertise_level,
            expertise_domain=expertise_domain,
        )
    except Exception as e:
        bb2 = get_blackboard(task_id)
        if bb2:
            bb2.status = AgentStatus.FAILED
            bb2.error = str(e)
        logger.exception("[AGENT] Background pipeline error task_id=%s", task_id)
        return

    if bb.status != AgentStatus.COMPLETE:
        return

    await _save_completed_task_to_memory(
        bb, user_id, task, orchestration_id, watchlist_item_id=watchlist_item_id
    )


async def _save_completed_task_to_memory(
    bb: Blackboard,
    user_id: int,
    task_text_for_memory: str,
    orchestration_id: Optional[str] = None,
    watchlist_item_id: Optional[str] = None,
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
                insight_report=bb.insight_report,
                pipeline_contradictions=bb.cross_task_contradictions or None,
                intelligence_score=bb.intelligence_score if bb.intelligence_score else None,
                orchestration_id=orchestration_id,
                watchlist_item_id=watchlist_item_id,
                bb=bb,
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
    finally:
        record_agent_task_usage(bb)


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


@router.post("/upload")
async def upload_agent_attachment(
    file: UploadFile = File(...),
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Multipart upload: PDF, images, Word docs — ephemeral /tmp + in-memory registry.

    Rate-limited per user: without this, an authenticated client can fill
    process memory (base64 images) and /tmp by hammering this endpoint.
    Registry ownership + TTL/caps live in upload_store.
    """
    _ensure_agent_access(user, db)
    enforce_user_rate_limit(
        user.id,
        scope="agent_upload",
        limit=30,
        window_seconds=3600,
        message="Too many file uploads. Limit is 30 per hour.",
    )
    ensure_upload_dir()
    data = await file.read()
    max_bytes = 10 * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail="File too large (max 10MB)",
        )
    orig = (file.filename or "upload").strip() or "upload"
    file_id = str(uuid.uuid4())
    safe_name = "".join(c for c in orig if c.isalnum() or c in "._- ")[:180] or "file"
    stored_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"
    dest_path = os.path.join(UPLOAD_DIR, stored_name)
    ct = file.content_type or "application/octet-stream"
    try:
        record = process_upload(filename=orig, content_type=ct, data=data, dest_path=dest_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    record["file_id"] = file_id
    # Bind to the uploader so resolve_attachments cannot be used for IDOR.
    register_upload(file_id, record, user_id=user.id)
    rtype = record.get("type") or "doc"
    if rtype == "image":
        content_preview = "[Image]"
    else:
        content_preview = ((record.get("content") or "")[:100]) or ""
    return {
        "file_id": file_id,
        "filename": orig,
        "type": rtype,
        "content_preview": content_preview,
        "size_kb": max(1, len(data) // 1024),
    }


@router.get("/templates")
async def list_agent_templates() -> dict:
    """Public list of task prompt templates (grouped by category)."""
    return get_templates_grouped_by_category()


@router.get("/capabilities")
async def list_agent_capabilities() -> dict:
    """Capability taxonomy for UI badges and Condura handoff."""
    return {"capabilities": list_capabilities()}


@router.get("/capability-usage")
async def get_capability_usage(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    days: int = Query(30, ge=1, le=365, description="Window length in days, ending today (UTC)."),
) -> dict:
    """Per-capability call counts for the caller over a window.

    Backs a 'How often am I using each Agent capability?' widget on
    the Agent history page. The source of truth is UsageRecord.mode +
    prompt_category — every Agent pipeline run records one row, so
    summing the rows by category is a single GROUP BY.

    Web (Arena) calls are reported separately so the UI can show
    '12 arena, 5 agent' totals without a second roundtrip.
    """
    from arena.db_models import UsageRecord
    from datetime import datetime, timezone, timedelta

    enforce_user_rate_limit(
        user.id,
        scope="capability_usage",
        limit=60,
        window_seconds=3600,
        message="Too many capability-usage requests. Limit is 60 per hour.",
    )

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    window_start = now_utc - timedelta(days=days - 1)

    # Single GROUP BY over the relevant columns; cheap because
    # timestamp is indexed and we already filter by user_id.
    rows = (
        db.query(
            UsageRecord.mode,
            UsageRecord.prompt_category,
            func.count(UsageRecord.id),
        )
        .filter(
            UsageRecord.user_id == user.id,
            UsageRecord.timestamp >= window_start,
        )
        .group_by(UsageRecord.mode, UsageRecord.prompt_category)
        .all()
    )

    by_mode: dict[str, int] = {"arena": 0, "agent": 0, "debate": 0, "discuss": 0, "other": 0}
    by_category: dict[str, int] = {}
    agent_total = 0
    web_total = 0

    for mode, category, count in rows:
        count = int(count or 0)
        bucket = mode if mode in by_mode else "other"
        by_mode[bucket] = by_mode.get(bucket, 0) + count
        if mode == "agent":
            agent_total += count
        elif mode in ("arena", "debate", "discuss"):
            web_total += count
        if category:
            by_category[category] = by_category.get(category, 0) + count

    return {
        "window_days": days,
        "window_start": window_start.date().isoformat(),
        "window_end": now_utc.date().isoformat(),
        "by_mode": by_mode,
        "by_category": by_category,
        "totals": {
            "agent": agent_total,
            "web": web_total,
            "all": agent_total + web_total,
        },
    }


@router.get("/capabilities/docs")
async def list_capability_docs() -> dict:
    """Extended markdown docs for every capability in the registry.

    The /capabilities endpoint returns the short one-liner description;
    this one returns a longer markdown body suitable for a "what
    does this do?" tooltip or a developer reference. No auth —
    capability metadata is public, and a paying customer evaluating
    the product shouldn't need to log in just to read docs.
    """
    from arena.core.capabilities import CAPABILITY_DOCS, REGISTRY

    items = []
    for cap_id, cap in REGISTRY.items():
        items.append({
            "id": cap_id,
            "description": cap.description,
            "execution": cap.execution.value,
            "markdown": CAPABILITY_DOCS.get(
                cap_id, "No extended documentation for this capability yet."
            ),
        })
    # Stable alphabetical order so the UI doesn't shuffle.
    items.sort(key=lambda x: x["id"])
    return {"docs": items, "total": len(items)}


@router.get("/capabilities/docs/{capability_id}")
async def get_capability_doc_endpoint(capability_id: str) -> dict:
    """Single-capability doc lookup. 404 if the id is unknown so a
    client can detect a typo without a try/except."""
    doc = get_capability_doc(capability_id)
    if doc is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "capability_not_found", "id": capability_id},
        )
    return doc


@router.get("/capabilities/examples")
async def list_capability_examples_endpoint() -> dict:
    """Curated 'try one' prompt examples for every capability.

    Powers the Agent page's suggestion chip row — a first-time user
    clicks a chip instead of staring at an empty textarea. No auth:
    examples are public marketing copy, not user data.
    """
    return {"examples": list_capability_examples()}


@router.get("/capabilities/stats")
async def list_capability_stats() -> dict:
    """Per-capability aggregate counts and metadata.

    Useful for the Agent page's 'popular capabilities' widget —
    lists each capability alongside the number of registered
    parameters (so the UI can show 'stream heartbeat 10m' for hybrid
    capabilities, etc.). No DB queries — pulls straight from the
    in-memory REGISTRY. No auth.
    """
    items: list[dict[str, Any]] = []
    for cap_id, cap in REGISTRY.items():
        item: dict[str, Any] = {
            "id": cap_id,
            "description": cap.description,
            "execution": cap.execution.value,
        }
        if isinstance(cap, ConduraCapability):
            item["condura_method"] = cap.condura_method
        if isinstance(cap, (HybridPrepCapability, HybridDelegateCapability)):
            item["condura_method"] = cap.condura_method
            item["stream_heartbeat_seconds"] = cap.stream_heartbeat_seconds
        items.append(item)
    # Stable alphabetical order.
    items.sort(key=lambda x: x["id"])
    return {"stats": items, "total": len(items)}


@router.get("/tasks/{task_id}/feedback")
async def get_task_answer_feedback(
    task_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    tid = task_id.strip()
    owned = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == tid, AgentTaskRow.user_id == user.id)
        .first()
    )
    if not owned:
        raise HTTPException(status_code=404, detail="Task not found")
    fb = (
        db.query(AnswerFeedback)
        .filter(AnswerFeedback.user_id == user.id, AnswerFeedback.task_id == tid)
        .first()
    )
    if not fb:
        return None
    return {
        "verdict": fb.verdict,
        "note": fb.note,
        "created_at": fb.created_at.isoformat() if fb.created_at else None,
    }


@router.post("/tasks/{task_id}/feedback")
async def post_task_answer_feedback(
    task_id: str,
    body: AnswerAccuracyFeedbackBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    enforce_user_rate_limit(
        user.id,
        scope="agent_feedback",
        limit=120,
        window_seconds=3600,
        message="Too many feedback submissions. Limit is 120 per hour.",
    )
    tid = task_id.strip()
    owned = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == tid, AgentTaskRow.user_id == user.id)
        .first()
    )
    if not owned:
        raise HTTPException(status_code=404, detail="Task not found")
    v = body.verdict.strip().lower()
    if v not in ("correct", "partial", "wrong"):
        raise HTTPException(status_code=400, detail="Invalid verdict")
    note_val = sanitize_model_optional_text(body.note, max_length=1000, field_name="note")
    existing = (
        db.query(AnswerFeedback)
        .filter(AnswerFeedback.user_id == user.id, AnswerFeedback.task_id == tid)
        .first()
    )
    if existing:
        existing.verdict = v
        existing.note = note_val
    else:
        db.add(
            AnswerFeedback(
                user_id=user.id,
                task_id=tid,
                verdict=v,
                note=note_val,
            )
        )
    db.commit()
    stats = get_answer_feedback_distribution(user.id, db)
    return {"success": True, "feedback_stats": stats}


@router.post("/orchestrate")
async def start_orchestration(
    body: OrchestrateRequest,
    background_tasks: BackgroundTasks,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    _ensure_agent_orchestrate_access(user)
    # Spawns 2–4 full agent pipelines — cost amplification without a cap.
    enforce_user_rate_limit(
        user.id,
        scope="agent_orchestrate",
        limit=6,
        window_seconds=3600,
        message="Too many orchestrations. Limit is 6 per hour.",
    )

    raw_qs = [str(q).strip() for q in body.questions if str(q).strip()]
    _enforce_capability_gate(
        capability_id="agent.orchestrate",
        task_text=" ".join(raw_qs),
    )
    if not (2 <= len(raw_qs) <= 4):
        raise HTTPException(
            status_code=400,
            detail="Provide between 2 and 4 non-empty questions",
        )
    for q in raw_qs:
        if len(q) > 2000:
            raise HTTPException(
                status_code=400,
                detail="Each question may be at most 2000 characters",
            )

    el = (body.expertise_level or "curious").strip().lower() or "curious"
    ed = (body.expertise_domain or "").strip()[:100]

    orch_id = str(uuid.uuid4())
    task_ids: list[str] = []
    for q in raw_qs:
        bb = create_blackboard(user_id=user.id, task=q)
        bb.status = AgentStatus.RUNNING
        bb.expertise_level = el
        bb.expertise_domain = ed
        task_ids.append(bb.task_id)
        background_tasks.add_task(
            run_agent_pipeline_background,
            bb.task_id,
            user.id,
            q,
            el,
            ed,
            orch_id,
        )

    db.add(
        Orchestration(
            id=orch_id,
            user_id=user.id,
            task_ids=task_ids,
            status="running",
        )
    )
    db.commit()

    background_tasks.add_task(run_orchestration_watcher, orch_id, user.id, task_ids)

    return JSONResponse(
        content={"orchestration_id": orch_id, "task_ids": task_ids},
    )


@router.get("/orchestrate/{orch_id}")
async def get_orchestration_status(
    orch_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    _ensure_agent_orchestrate_access(user)

    orch = db.query(Orchestration).filter(Orchestration.id == orch_id.strip()).first()
    if not orch or orch.user_id != user.id:
        raise HTTPException(status_code=404, detail="Orchestration not found")

    child_tasks = []
    for tid in orch.task_ids or []:
        bb = get_blackboard(tid)
        row = (
            db.query(AgentTaskRow)
            .filter(AgentTaskRow.task_id == tid, AgentTaskRow.user_id == user.id)
            .first()
        )
        text = ""
        if row and row.task_text:
            text = row.task_text
        elif bb and bb.task:
            text = bb.task

        st = "running"
        stage = "planner"
        if bb:
            stage = bb.current_stage or "planner"
            if bb.status == AgentStatus.COMPLETE:
                st = "complete"
            elif bb.status == AgentStatus.FAILED:
                st = "failed"
            else:
                st = "running"
        if row and (row.final_answer or "").strip():
            st = "complete"
            stage = "done"

        snippet = (text[:50] + "…") if len(text) > 50 else text
        child_tasks.append(
            {
                "task_id": tid,
                "status": st,
                "current_stage": stage,
                "question_snippet": snippet,
            }
        )

    return JSONResponse(
        content={
            "id": orch.id,
            "status": orch.status,
            "task_ids": orch.task_ids,
            "synthesis": orch.synthesis,
            "synthesis_bullets": orch.synthesis_bullets or [],
            "conflicts": orch.conflicts or [],
            "created_at": orch.created_at.isoformat() if orch.created_at else None,
            "child_tasks": child_tasks,
        }
    )


@router.get("/orchestrate/{orch_id}/export/pdf")
async def export_orchestration_pdf(
    orch_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    _ensure_agent_orchestrate_access(user)

    oid = orch_id.strip()
    orch = (
        db.query(Orchestration)
        .filter(Orchestration.id == oid, Orchestration.user_id == user.id)
        .first()
    )
    if not orch:
        raise HTTPException(status_code=404, detail="Orchestration not found")
    if orch.status != "complete":
        raise HTTPException(status_code=400, detail="Orchestration is not complete yet")

    tids = list(orch.task_ids or [])
    rows = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.user_id == user.id, AgentTaskRow.task_id.in_(tids))
        .all()
    )
    by_id = {r.task_id: r for r in rows}
    ordered = [by_id[i] for i in tids if i in by_id]
    if len(ordered) != len(tids):
        raise HTTPException(status_code=400, detail="Missing saved tasks for orchestration")

    overlays = [_export_overlay_from_bb(get_blackboard(tid)) for tid in tids]
    html_str = generate_orchestration_report_html(
        orch.synthesis or "",
        list(orch.synthesis_bullets or []),
        list(orch.conflicts or []),
        ordered,
        overlays,
    )
    blob, mime, ext = write_pdf_or_html(html_str, f"arena-orch-{oid[:8]}")
    filename = f"arena-orchestration-{oid[:8]}.{ext}"
    return Response(
        content=blob,
        media_type=mime,
        headers={"Content-Disposition": content_disposition_attachment(filename)},
    )


@router.get("/tasks/{task_id}/export/pdf")
async def export_task_pdf(
    task_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    tid = task_id.strip()
    row = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == tid, AgentTaskRow.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    if not (row.final_answer or "").strip():
        raise HTTPException(status_code=400, detail="Nothing to export yet for this task")

    bb = get_blackboard(tid)
    overlay = _export_overlay_from_bb(bb)
    html_str = generate_report_html(row, overlay)
    blob, mime, ext = write_pdf_or_html(html_str, f"arena-report-{tid[:8]}")
    filename = f"arena-report-{tid[:8]}.{ext}"
    return Response(
        content=blob,
        media_type=mime,
        headers={"Content-Disposition": content_disposition_attachment(filename)},
    )


@router.post("/run")
async def run_agent_task(
    body: AgentTaskRequest,
    background_tasks: BackgroundTasks,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    enforce_user_rate_limit(
        user.id,
        scope="agent_run",
        limit=10,
        window_seconds=60,
        message="Too many agent runs. Limit is 10 per minute.",
    )

    tier = normalize_tier(get_tier_str(user))
    today_usage = get_today_token_usage(db, user.id)
    daily_limit = get_credit_budget(tier)
    if today_usage >= daily_limit:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "daily_limit_reached",
                "message": "Daily usage limit reached.",
                "used": today_usage,
                "limit": daily_limit,
                "resets_at": "midnight UTC",
            },
        )

    task = sanitize_text(body.task, max_length=2000, field_name="task")
    _enforce_capability_gate(capability_id="agent.research", task_text=task)

    expertise_level = (body.expertise_level or "curious").strip().lower() or "curious"
    expertise_domain = (body.expertise_domain or "").strip()[:100]

    bb = create_blackboard(user_id=user.id, task=task)
    bb.status = AgentStatus.RUNNING
    bb.expertise_level = expertise_level
    bb.expertise_domain = expertise_domain
    # Ownership-scoped: only this user's uploads resolve; foreign file_ids are dropped.
    bb.attachments = resolve_attachments(
        list(body.attachment_ids or [])[:32],
        user_id=user.id,
    )
    bb.mcp_integration_ids = list(body.mcp_integration_ids or [])[:20]

    background_tasks.add_task(
        run_agent_pipeline_background,
        bb.task_id,
        user.id,
        task,
        expertise_level,
        expertise_domain,
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
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    bb = get_blackboard(task_id)
    if bb:
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

    row = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == task_id, AgentTaskRow.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")

    complete = "complete"
    return JSONResponse(
        content={
            "task_id": row.task_id,
            "status": complete,
            "current_stage": "done",
            "stages": {
                "planner": {"status": complete},
                "researcher": {"status": complete},
                "solver": {"status": complete},
                "critic": {"status": complete},
                "verifier": {"status": complete},
                "synthesizer": {"status": complete},
                "judge": {"status": complete},
            },
        }
    )


@router.get("/result/{task_id}")
async def get_agent_result(
    task_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Returns full blackboard including per-stage output, model, and duration_ms for revision trace."""
    _ensure_agent_access(user, db)
    bb = get_blackboard(task_id)
    if bb:
        _ensure_task_owner(bb, user)
        out = bb.to_dict()
        row = (
            db.query(AgentTaskRow)
            .filter(AgentTaskRow.task_id == task_id, AgentTaskRow.user_id == user.id)
            .first()
        )
        if row:
            _merge_db_task_into_result_payload(out, row)
        return JSONResponse(content=out)

    row = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == task_id, AgentTaskRow.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")

    contra = _load_task_contradictions(db, task_id, user.id)
    return JSONResponse(content=_persisted_agent_task_result_dict(row, contra))


@router.post("/challenge")
async def challenge_agent_answer(
    body: AgentChallengeRequest,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    # Three parallel LLM calls per request — without a cap an authenticated
    # client can burn provider quota (cost amplification / DoS).
    enforce_user_rate_limit(
        user.id,
        scope="agent_challenge",
        limit=15,
        window_seconds=3600,
        message="Too many challenge runs. Limit is 15 per hour.",
    )
    answer = sanitize_text(body.answer, max_length=2000, field_name="answer")
    _enforce_capability_gate(capability_id="agent.challenge", task_text=answer)

    task_text = (body.task or "").strip()
    tid = body.task_id.strip()
    if tid:
        bb = get_blackboard(tid)
        if bb:
            _ensure_task_owner(bb, user)
            task_text = bb.task
        else:
            row = (
                db.query(AgentTaskRow)
                .filter(AgentTaskRow.task_id == tid, AgentTaskRow.user_id == user.id)
                .first()
            )
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
            task_text = row.task_text
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
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    # Synchronous LLM call — bound per-user volume for cost control.
    enforce_user_rate_limit(
        user.id,
        scope="agent_rebuttal",
        limit=30,
        window_seconds=3600,
        message="Too many rebuttal requests. Limit is 30 per hour.",
    )
    task = body.task.strip() or "(context not provided)"
    answer = sanitize_text(body.answer, max_length=2000, field_name="answer")
    challenge = sanitize_text(body.challenge, max_length=2000, field_name="challenge")
    _enforce_capability_gate(capability_id="agent.rebuttal", task_text=f"{task} {answer}")

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
        response, _, _ = await call_llm(
            client=model["client"],
            provider="claude",
            model_id=model["model_id"],
            system_prompt=REBUTTAL_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.4,
            max_tokens=600,
        )
        return JSONResponse(content={"rebuttal": response, "status": "complete"})
    except Exception:
        raise HTTPException(status_code=500, detail="Rebuttal generation failed")


@router.post("/watchlist")
async def create_watchlist_item(
    body: WatchlistCreateBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_watchlist_access(user)
    # Active-cap alone does not stop create/pause churn; bound create rate.
    enforce_user_rate_limit(
        user.id,
        scope="watchlist_create",
        limit=30,
        window_seconds=3600,
        message="Too many watchlist creates. Limit is 30 per hour.",
    )
    q = sanitize_text(body.question, max_length=2000, field_name="question")
    _enforce_capability_gate(capability_id="watchlist.create", task_text=q)
    if body.interval_hours not in WATCHLIST_INTERVALS:
        raise HTTPException(status_code=400, detail="interval_hours must be 24, 72, or 168")

    active_n = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.user_id == user.id, WatchlistItem.is_active.is_(True))
        .count()
    )
    if active_n >= WATCHLIST_MAX_ACTIVE:
        raise HTTPException(status_code=400, detail="Watchlist limit reached")

    el = (body.expertise_level or "curious").strip().lower() or "curious"
    ed = (body.expertise_domain or "").strip()[:100]
    now = _utc_naive()
    item = WatchlistItem(
        id=str(uuid.uuid4()),
        user_id=user.id,
        question=q,
        interval_hours=int(body.interval_hours),
        expertise_level=el,
        expertise_domain=ed,
        next_run_at=now + timedelta(hours=int(body.interval_hours)),
        run_count=0,
        is_active=True,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return JSONResponse(content=_watchlist_item_api_dict(db, item))


@router.get("/watchlist")
async def list_watchlist_items(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_watchlist_access(user)
    items = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.user_id == user.id)
        .order_by(WatchlistItem.next_run_at.asc())
        .all()
    )
    active_n = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.user_id == user.id, WatchlistItem.is_active.is_(True))
        .count()
    )
    return JSONResponse(
        content={
            "items": [_watchlist_item_api_dict(db, i) for i in items],
            "active_count": active_n,
            "active_cap": WATCHLIST_MAX_ACTIVE,
        }
    )


@router.patch("/watchlist/{item_id}")
async def patch_watchlist_item(
    item_id: str,
    body: WatchlistPatchBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_watchlist_access(user)
    item = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.id == item_id.strip(), WatchlistItem.user_id == user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")

    now = _utc_naive()
    if body.interval_hours is not None:
        if body.interval_hours not in WATCHLIST_INTERVALS:
            raise HTTPException(status_code=400, detail="interval_hours must be 24, 72, or 168")
        item.interval_hours = int(body.interval_hours)
        if item.is_active:
            item.next_run_at = now + timedelta(hours=item.interval_hours)

    if body.is_active is not None:
        if body.is_active:
            item.is_active = True
            item.next_run_at = now + timedelta(hours=int(item.interval_hours))
        else:
            item.is_active = False

    db.commit()
    db.refresh(item)
    return JSONResponse(content=_watchlist_item_api_dict(db, item))


@router.delete("/watchlist/{item_id}")
async def delete_watchlist_item(
    item_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_watchlist_access(user)
    item = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.id == item_id.strip(), WatchlistItem.user_id == user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    db.delete(item)
    db.commit()
    return JSONResponse(content={"success": True})


@router.get("/watchlist/{item_id}/history")
async def get_watchlist_item_history(
    item_id: str,
    limit: int = 50,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Run history for a single watchlist item with aggregate stats.

    Each item row is one spawned AgentTask (one re-check), newest
    first. Stats summarize scored runs only — `scored_count` lets
    the UI distinguish \"3 runs, 2 scored\" from \"2 runs, 2 scored\".
    Limit is clamped to [1, 200].
    """
    _ensure_agent_watchlist_access(user)
    item = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.id == item_id.strip(), WatchlistItem.user_id == user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    payload = get_watchlist_history(db, user.id, item.id, limit=limit)
    return JSONResponse(content={"success": True, **payload})


@router.get("/metrics")
async def get_agent_metrics(
    window_days: int = Query(30, ge=1, le=90),
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Per-user Agent Mode metrics: lifetime counts + 30-day daily trend.

    Scoped to the caller's own AgentTask and Orchestration rows — never
    exposes data from other users. The 30-day trend is bucketed by UTC
    day so the UI can render it as a calendar heatmap without doing
    any timezone math itself.
    """
    _ensure_agent_access(user, db)
    from arena.core.agent_metrics import compute_user_agent_metrics

    orm_user = db.query(User).filter(User.id == user.id).first()
    if orm_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    payload = compute_user_agent_metrics(
        db=db,
        user=orm_user,
        window_days=window_days,
    )
    return JSONResponse(content=payload)


@router.get("/feedback/recent")
async def list_recent_feedback(
    limit: int = Query(20, ge=1, le=200),
    verdict: Optional[str] = Query(
        None,
        description=(
            "Filter by verdict: 'correct', 'partial', or 'wrong'. "
            "Unknown values return an empty list."
        ),
    ),
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Paginated recent feedback for the agent page.

    Scoped to the caller's own AnswerFeedback rows; verdict filter is
    exact-match on the canonical values, and the result is ordered
    newest-first. Tasks that have been deleted (or never existed in
    production) are returned with title=None so the UI can render them
    as a tombstone rather than 500 on a join.
    """
    _ensure_agent_access(user, db)
    items = get_recent_feedback(
        db=db,
        user_id=user.id,
        limit=limit,
        verdict=verdict,
    )
    return JSONResponse(content={"success": True, "items": items, "count": len(items)})


@router.get("/history")
async def get_agent_history(
    page: int = Query(1, ge=1),
    per_page: int = Query(200, ge=1, le=200),
    search: str | None = Query(None, max_length=100, description="Case-insensitive substring match on title or task_text."),
    feedback: str | None = Query(None, description="Filter by feedback status: 'positive', 'negative', or 'none'."),
    orchestration_id: str | None = Query(None, description="Restrict to a single orchestration chain."),
    sort: str = Query("newest", description="Sort mode: 'newest' (default), 'oldest', 'score', or 'confidence'."),
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    from arena.core.agent_memory import get_user_task_history

    tier = normalize_tier(get_tier_str(user))
    retention_days = AGENT_HISTORY_RETENTION_DAYS.get(tier, 30)
    history = get_user_task_history(
        db=db,
        user_id=user.id,
        page=page,
        per_page=per_page,
        retention_days=retention_days,
        search=search,
        feedback=feedback,
        orchestration_id=orchestration_id,
        sort=sort,
    )
    return JSONResponse(content=history)


@router.patch("/tasks/{task_id}/rename")
async def rename_agent_task(
    task_id: str,
    body: AgentTaskRenameRequest,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    row = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == task_id.strip(), AgentTaskRow.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    row.title = sanitize_html(body.title, max_length=100, field_name="title")
    db.commit()
    db.refresh(row)
    return JSONResponse(content={"success": True, "title": row.title})


@router.delete("/tasks/{task_id}")
async def delete_agent_task(
    task_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    row = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == task_id.strip(), AgentTaskRow.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(row)
    db.commit()
    return JSONResponse(content={"success": True})


@router.post("/tasks/{task_id}/live")
async def toggle_agent_task_live(
    task_id: str,
    body: LiveToggleBody = LiveToggleBody(),
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    enforce_user_rate_limit(
        user.id,
        scope="agent_live_toggle",
        limit=60,
        window_seconds=3600,
        message="Too many live-thread toggles. Limit is 60 per hour.",
    )
    row = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == task_id, AgentTaskRow.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    _enforce_capability_gate(
        capability_id="watchlist.toggle",
        task_text=row.task_text or "",
    )
    if body.is_live is not None:
        want_live = bool(body.is_live)
    else:
        want_live = not bool(row.is_live)

    # Cap concurrent live threads before enabling (not when turning off).
    if want_live and not bool(row.is_live):
        active_live = (
            db.query(AgentTaskRow)
            .filter(
                AgentTaskRow.user_id == user.id,
                AgentTaskRow.is_live.is_(True),
            )
            .count()
        )
        if int(active_live) >= LIVE_MAX_ACTIVE:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "live_limit_reached",
                    "message": (
                        f"Live research limit reached ({LIVE_MAX_ACTIVE} active). "
                        "Turn off another live task first."
                    ),
                    "active_cap": LIVE_MAX_ACTIVE,
                },
            )

    row.is_live = want_live
    now = _utc_naive()
    if row.is_live:
        # Allow callers to dial cadence per task (1h..168h). Default to
        # the stored cadence or 24h if neither is set.
        cadence = body.reschedule_hours
        if cadence is None:
            cadence = int(getattr(row, "live_reschedule_hours", 24) or 24)
        row.live_reschedule_hours = cadence
        row.live_next_check = now + timedelta(hours=cadence)
    else:
        row.live_next_check = None
    db.commit()
    db.refresh(row)
    return JSONResponse(content={"task": row.to_dict()})


@router.get("/tasks/{task_id}/updates")
async def get_agent_task_live_updates(
    task_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    row = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == task_id, AgentTaskRow.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return JSONResponse(content={"live_updates": _live_updates_from_row(row)})


@router.post("/tasks/{task_id}/live-updates/mark-read")
async def mark_agent_live_updates_read(
    task_id: str,
    body: MarkLiveReadBody = MarkLiveReadBody(),
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    row = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == task_id, AgentTaskRow.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    updates = list(_live_updates_from_row(row))
    uid = (body.update_id or "").strip()
    changed = False
    for u in updates:
        if not isinstance(u, dict):
            continue
        if not uid or str(u.get("id") or "") == uid:
            if u.get("status") != "read":
                u["status"] = "read"
                changed = True
            if uid:
                break
    if changed:
        row.live_updates = updates
        db.commit()
    return JSONResponse(content={"success": True, "live_updates": updates})


@router.get("/memory/context")
async def get_memory_context(
    task: str = "",
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
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
    """Load a persisted Agent task from DB when no in-memory blackboard exists."""
    _ensure_agent_access(user, db)
    row = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == task_id, AgentTaskRow.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    memory_contradictions = _load_task_contradictions(db, task_id, user.id)
    pipe_contra = _pipeline_contradictions_from_row(row)
    insight_saved = _insight_report_from_row(row)
    intel = _intelligence_score_from_row(row)
    live_updates = _live_updates_from_row(row)
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
            "contradictions": pipe_contra,
            "memory_contradictions": memory_contradictions,
            "insight_report": insight_saved,
            "intelligence_score": intel,
            "is_live": bool(row.is_live),
            "live_last_checked": row.live_last_checked.isoformat()
            if row.live_last_checked
            else None,
            "live_next_check": row.live_next_check.isoformat()
            if row.live_next_check
            else None,
            "live_updates": live_updates,
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
    _ensure_agent_access(user, db)
    enforce_user_rate_limit(
        user.id,
        scope="agent_feedback",
        limit=120,
        window_seconds=3600,
        message="Too many feedback submissions. Limit is 120 per hour.",
    )
    _enforce_capability_gate(capability_id="agent.feedback", task_text=body.feedback or "")
    task_record = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == body.task_id.strip(), AgentTaskRow.user_id == user.id)
        .first()
    )
    if not task_record:
        raise HTTPException(status_code=404, detail="Task not found")

    valid_feedback = ("accurate", "inaccurate", "partial")
    if body.feedback not in valid_feedback:
        raise HTTPException(status_code=400, detail="Invalid feedback value")

    task_record.user_feedback = body.feedback
    task_record.feedback_note = sanitize_model_optional_text(
        body.note,
        max_length=1000,
        field_name="note",
    )
    db.commit()

    return JSONResponse(
        content={
            "status": "saved",
            "task_id": body.task_id.strip(),
            "feedback": body.feedback,
        }
    )


@router.get("/feedback/recent")
async def list_recent_feedback(
    limit: int = 20,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Recent feedback events for the current user, newest first.

    Each entry carries the task_id, verdict, optional note, timestamp,
    and the task title/snippet when the underlying AgentTask still
    exists. Used by Profile to show \"what did I rate recently?\"
    without forcing a full history reload.
    """
    _ensure_agent_access(user, db)
    items = get_recent_feedback(user.id, db, limit=limit)
    return {"success": True, "items": items, "count": len(items)}


@router.post("/refine")
async def refine_agent_answer(
    body: RefinementRequest,
    background_tasks: BackgroundTasks,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    # Refinement re-enters the pipeline (LLM-heavy). Cap per user.
    enforce_user_rate_limit(
        user.id,
        scope="agent_refine",
        limit=20,
        window_seconds=3600,
        message="Too many refine requests. Limit is 20 per hour.",
    )

    message = sanitize_text(body.message, max_length=1000, field_name="message")
    _enforce_capability_gate(capability_id="agent.refine", task_text=message)

    bb = get_blackboard(body.task_id.strip())
    if not bb:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "task_not_found",
                "message": "No active session for this task. Start a new task to continue.",
            },
        )

    if bb.user_id != user.id:
        raise HTTPException(status_code=404, detail="Task not found")

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
    db: Session = Depends(get_db),
):
    _ensure_agent_access(user, db)
    # Spawns a full agent pipeline (bridge) — same cost class as /run.
    enforce_user_rate_limit(
        user.id,
        scope="agent_verify_arena",
        limit=10,
        window_seconds=3600,
        message="Too many Arena→Agent verifications. Limit is 10 per hour.",
    )

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
    _enforce_capability_gate(
        capability_id="agent.verify_arena_answer",
        task_text=verification_task,
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


class CrossPollinateRequest(BaseModel):
    task_id: str
    persona_ids: list[str] = Field(default_factory=list)

    @field_validator("task_id")
    @classmethod
    def validate_task_id(cls, v: str) -> str:
        return sanitize_model_text(v, max_length=100, field_name="task_id")

    @field_validator("persona_ids", mode="before")
    @classmethod
    def validate_persona_ids(cls, v: list[str] | None) -> list[str]:
        if v is None:
            return []
        return [sanitize_model_text(str(pid), max_length=100, field_name="persona_id") for pid in v if pid]


@router.post("/pollinate")
async def cross_pollinate_agent_answer(
    body: CrossPollinateRequest,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """
    Cross-pollinate: prepare an Agent Mode answer to send through the Arena for 4-mind perspectives.

    This creates a bridge where an Agent answer becomes an Arena prompt, generating
    additional viewpoints that can challenge or refine the original answer.
    Each persona evaluates whether they agree, disagree, or see important nuances missed.
    """
    _ensure_agent_access(user, db)
    # Cheap prep endpoint but still auth+DB work; bound spam.
    enforce_user_rate_limit(
        user.id,
        scope="agent_pollinate",
        limit=60,
        window_seconds=3600,
        message="Too many cross-pollinate requests. Limit is 60 per hour.",
    )

    tid = body.task_id.strip()
    if not tid:
        raise HTTPException(status_code=400, detail="task_id required")

    # Load the completed task
    bb = get_blackboard(tid)
    row = None
    if not bb:
        row = (
            db.query(AgentTaskRow)
            .filter(AgentTaskRow.task_id == tid, AgentTaskRow.user_id == user.id)
            .first()
        )

    def _intel_total(raw) -> float | int | None:
        """Best-effort total_score from blackboard dict or DB JSON."""
        if raw is None:
            return None
        data = raw
        if isinstance(raw, str):
            try:
                data = json.loads(raw)
            except Exception:
                return None
        if not isinstance(data, dict):
            return None
        score = data.get("total_score")
        if isinstance(score, (int, float)) and not isinstance(score, bool):
            return score
        return None

    # If blackboard exists, verify ownership
    if bb:
        _ensure_task_owner(bb, user)
        answer_text = bb.final_answer or ""
        original_task = bb.original_task or bb.task or ""
        intel_score = _intel_total(bb.intelligence_score)
    elif row and (row.final_answer or "").strip():
        _ensure_task_owner(Blackboard(task_id=tid, user_id=user.id), user)
        answer_text = row.final_answer or ""
        original_task = row.task_text or ""
        intel_score = _intel_total(row.intelligence_score)
    else:
        raise HTTPException(status_code=404, detail="Task not found or not complete")

    # Extract one_liner if answer is JSON-structured
    if isinstance(answer_text, str) and answer_text.strip().startswith("{"):
        try:
            parsed_answer = json.loads(answer_text)
            if isinstance(parsed_answer, dict):
                answer_text = parsed_answer.get("one_liner", parsed_answer.get("text", answer_text)) or answer_text
        except json.JSONDecodeError:
            pass

    user_tier = normalize_tier(get_tier_str(user))
    _enforce_persona_access(user_tier, body.persona_ids)

    pollinate_prompt = (
        f"ORIGINAL RESEARCH QUESTION: {original_task}\n\n"
        f"AGENT RESEARCH ANSWER: {answer_text}\n\n"
        f"CRITICAL REVIEW: This answer was generated by Arena's deep research pipeline. "
        f"Your job: evaluate it critically. Do you agree, disagree, or see important nuances missed? "
        f"If you find flaws or missing perspectives, say so. If you agree, explain why it's sound. "
        f"Give a concise verdict (one-liner) and confidence score (0-100)."
    )

    session_id = str(uuid.uuid4())

    return JSONResponse(
        content={
            "status": "ready",
            "session_id": session_id,
            "original_task_id": tid,
            "prompt": pollinate_prompt,
            "intel_score": intel_score,
        }
    )


@router.get("/history/{task_id}/evolution")
async def get_temporal_evolution(
    task_id: str,
    db: Session = Depends(get_db),
    user: UserResponse = Depends(get_current_user_required),
):
    """
    How this task's answer evolved vs related research runs (similar question prefix).
    """
    _ensure_agent_access(user, db)

    from arena.core.temporal_evolution import analyze_temporal_evolution, extract_answer_snippet

    tid = (task_id or "").strip()
    task = (
        db.query(AgentTaskRow)
        .filter(AgentTaskRow.task_id == tid, AgentTaskRow.user_id == user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    question_prefix = (task.task_text or "").strip()[:30]
    if len(question_prefix) < 8:
        evolution = analyze_temporal_evolution([])
        return JSONResponse(
            content={
                "task_id": tid,
                "related_count": 1,
                "evolution": {
                    **evolution,
                    "message": "Question too short to match related research runs",
                },
            }
        )

    similar_tasks = (
        db.query(AgentTaskRow)
        .filter(
            AgentTaskRow.user_id == user.id,
            AgentTaskRow.task_text.startswith(question_prefix),
            AgentTaskRow.final_answer.is_not(None),
        )
        .order_by(AgentTaskRow.created_at.asc())
        .limit(40)
        .all()
    )

    tasks_data = [
        {
            "task_id": t.task_id,
            "question": t.task_text or "",
            "one_liner": extract_answer_snippet(t.final_answer, limit=240),
            "final_answer": t.final_answer,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "score": t.final_score if getattr(t, "final_score", None) is not None else None,
        }
        for t in similar_tasks
    ]

    evolution = analyze_temporal_evolution(tasks_data)
    return JSONResponse(
        content={
            "task_id": tid,
            "related_count": len(tasks_data),
            "evolution": evolution,
        }
    )
