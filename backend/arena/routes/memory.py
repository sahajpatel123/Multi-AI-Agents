"""Memory persistence routes."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required
from arena.core.input_validation import sanitize_model_text
from arena.core.memory import get_memory_manager
from arena.core.preferences import infer_preferences_from_session
from arena.core.rate_limits import enforce_user_rate_limit
from arena.core.stance_archive import save_agent_stance
from arena.core.tier_config import get_tier_str, has_feature, normalize_tier
from arena.database import get_db
from arena.db_models import SessionSummary
from arena.models.schemas import UserResponse

logger = logging.getLogger(__name__)

memory_router = APIRouter(tags=["memory"])


class MemorySaveRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=64)
    trigger: Literal["session_end", "new_chat", "manual"]

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        return sanitize_model_text(v, max_length=64, field_name="session_id")


@memory_router.post("/save")
async def save_memory(
    body: MemorySaveRequest,
    db: Session = Depends(get_db),
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    if not has_feature(normalize_tier(get_tier_str(user)), "memory"):
        return {"status": "skipped", "reason": "Memory requires Plus tier"}

    # Bound save chatter (compression is LLM-backed and cost-bearing).
    enforce_user_rate_limit(
        user.id,
        scope="memory_save",
        limit=30,
        window_seconds=3600,
        message="Too many memory save requests. Limit is 30 per hour.",
    )

    memory = get_memory_manager()
    session_state = memory.get_session_state(body.session_id)
    if not session_state or not session_state.get("exchanges"):
        return {"status": "skipped", "reason": "no exchanges"}

    # Ownership guard (in-memory first): session_id is a client-chosen key.
    # Without this check, any authenticated Plus user who learns another
    # user's live session_id could compress their exchanges, write a
    # SessionSummary under their own account, and clear the victim's
    # short-term memory (IDOR + session wipe).
    # Use 404 (not 403) so foreign session_ids cannot be distinguished
    # from missing ones.
    owner = str(session_state.get("user_id") or "").strip()
    caller = str(user.id)
    if owner and owner not in ("anonymous", "None") and owner != caller:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "not_found",
                "message": "Session not found",
            },
        )

    exchanges = list(session_state["exchanges"])
    stances_saved = 0
    partial_error: str | None = None

    # Ownership guard (persisted): a summary row belonging to another user
    # must never be reassigned or overwritten. Reject before compression
    # / clear so the error is not swallowed by the persistence try/except.
    existing_summary = (
        db.query(SessionSummary)
        .filter(SessionSummary.session_id == body.session_id)
        .first()
    )
    if existing_summary is not None and existing_summary.user_id != user.id:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "not_found",
                "message": "Session not found",
            },
        )

    try:
        summary = await memory.compressor.compress_session(
            session_id=body.session_id,
            exchanges=exchanges,
            user_id=user.id,
        )
    except Exception as exc:
        # Log full detail server-side only — never return str(exc) to clients
        # (stack paths, SQL, provider URLs, etc.).
        logger.exception("Memory compression failed for %s: %s", body.session_id, exc)
        partial_error = "compression_failed"
        summary = {
            "session_id": body.session_id,
            "main_topics": [],
            "dominant_category": exchanges[-1].get("prompt_category", "question"),
            "preferred_depth": "moderate",
            "trusted_persona": None,
            "key_positions_taken": [],
            "session_summary": f"Session with {len(exchanges)} exchanges.",
            "exchange_count": len(exchanges),
            "timestamp": datetime.now(UTC).isoformat(),
        }

    try:
        row = db.query(SessionSummary).filter(SessionSummary.session_id == body.session_id).first()
        if row is None:
            row = SessionSummary(session_id=body.session_id, user_id=user.id)

        row.user_id = user.id
        row.main_topics = list(summary.get("main_topics") or [])
        row.dominant_category = str(summary.get("dominant_category") or "question")
        row.preferred_depth = str(summary.get("preferred_depth") or "moderate")
        row.trusted_persona = summary.get("trusted_persona")
        row.key_positions_taken = list(summary.get("key_positions_taken") or [])
        row.session_summary = str(summary.get("session_summary") or f"Session with {len(exchanges)} exchanges.")
        row.exchange_count = int(summary.get("exchange_count") or len(exchanges))
        row.raw_exchanges_count = len(exchanges)
        row.compressed_at = datetime.now(UTC).replace(tzinfo=None)
        if row.id is None:
            db.add(row)
        db.commit()

        for entry in row.key_positions_taken:
            persona_id = entry.get("persona_id")
            topic = entry.get("topic")
            stance = entry.get("stance")
            if not persona_id or not topic or not stance:
                continue
            await save_agent_stance(
                user_id=user.id,
                persona_id=persona_id,
                topic=topic,
                stance=stance,
                confidence=int(entry.get("confidence", 0)),
                session_id=body.session_id,
                prompt_snippet=topic[:100],
                db=db,
            )
            stances_saved += 1

        await infer_preferences_from_session(
            user.id,
            {"exchanges": exchanges, "summary": summary},
            db,
        )
    except Exception as exc:
        logger.exception(
            "Memory persistence partially failed for %s: %s", body.session_id, exc
        )
        # Stable public code only — do not surface exception text.
        partial_error = partial_error or "persistence_failed"

    memory.clear_session(body.session_id)

    if partial_error:
        return {
            "status": "partial",
            "session_id": body.session_id,
            "exchanges_compressed": len(exchanges),
            "topics_extracted": list(summary.get("main_topics") or []),
            "stances_saved": stances_saved,
            "error": partial_error,
            "message": "Some memory data could not be fully saved. Your session was closed.",
        }

    return {
        "status": "saved",
        "session_id": body.session_id,
        "exchanges_compressed": len(exchanges),
        "topics_extracted": list(summary.get("main_topics") or []),
        "stances_saved": stances_saved,
    }
