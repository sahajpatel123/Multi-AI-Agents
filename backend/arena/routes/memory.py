"""Memory persistence routes."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from arena.core.auth import get_current_user_required
from arena.core.memory import get_memory_manager
from arena.core.preferences import infer_preferences_from_session
from arena.core.stance_archive import save_agent_stance
from arena.database import get_db
from arena.db_models import SessionSummary
from arena.models.schemas import UserResponse

logger = logging.getLogger(__name__)

memory_router = APIRouter(tags=["memory"])


class MemorySaveRequest(BaseModel):
    session_id: str
    trigger: Literal["session_end", "new_chat", "manual"]


@memory_router.post("/save")
async def save_memory(
    body: MemorySaveRequest,
    db: Session = Depends(get_db),
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    memory = get_memory_manager()
    session_state = memory.get_session_state(body.session_id)
    if not session_state or not session_state.get("exchanges"):
        return {"status": "skipped", "reason": "no exchanges"}

    exchanges = list(session_state["exchanges"])
    stances_saved = 0
    partial_error: str | None = None

    try:
        summary = await memory.compressor.compress_session(
            session_id=body.session_id,
            exchanges=exchanges,
            user_id=user.id,
        )
    except Exception as exc:
        logger.exception("Memory compression failed for %s", body.session_id)
        partial_error = str(exc)
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
        logger.exception("Memory persistence partially failed for %s", body.session_id)
        partial_error = str(exc)

    memory.clear_session(body.session_id)

    if partial_error:
        return {
            "status": "partial",
            "session_id": body.session_id,
            "exchanges_compressed": len(exchanges),
            "topics_extracted": list(summary.get("main_topics") or []),
            "stances_saved": stances_saved,
            "error": partial_error,
        }

    return {
        "status": "saved",
        "session_id": body.session_id,
        "exchanges_compressed": len(exchanges),
        "topics_extracted": list(summary.get("main_topics") or []),
        "stances_saved": stances_saved,
    }
