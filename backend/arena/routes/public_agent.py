"""Public, unauthenticated reads for shared Agent Mode reports.

Share links are opt-in: a row is only visible here while it carries a
``share_token`` created by POST /api/agent/tasks/{id}/share. The payload is
hand-built so no user id, task id, feedback, or internal report fields can
leak to the public link.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from arena.core.errors import ErrorCodes
from arena.core.rate_limits import enforce_ip_rate_limit
from arena.database import get_db
from arena.db_models import AgentTask


router = APIRouter()

_PUBLIC_SOURCE_MAX_ITEMS = 24
_PUBLIC_SOURCE_MAX_CHARS = 240


def _public_source_references(row: AgentTask) -> list[str]:
    """Return a small, text-only source list safe for an unauthenticated page.

    ``sources_used`` is persisted JSON assembled from model output and search
    context. Public shares should expose useful references without forwarding
    arbitrary nested objects, oversized values, or duplicate rows.
    """
    raw = row.sources_used
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(parsed, list):
        return []

    references: list[str] = []
    seen: set[str] = set()
    for item in parsed:
        if not isinstance(item, str):
            continue
        reference = " ".join(item.split()).strip()
        if not reference:
            continue
        if len(reference) > _PUBLIC_SOURCE_MAX_CHARS:
            reference = (
                reference[: _PUBLIC_SOURCE_MAX_CHARS - 1].rstrip() + "…"
            )
        key = reference.casefold()
        if key in seen:
            continue
        seen.add(key)
        references.append(reference)
        if len(references) >= _PUBLIC_SOURCE_MAX_ITEMS:
            break
    return references


@router.get("/agent/{token}")
async def get_public_agent_report(
    request: Request,
    token: str,
    db: Session = Depends(get_db),
) -> dict:
    """Return a sanitized snapshot of a shared, completed Agent report."""
    # Public token lookup is enumerable by nature, so keep the per-IP read
    # budget tight (mirrors the public room read route).
    enforce_ip_rate_limit(
        request,
        scope="public_agent_report",
        limit=60,
        window_seconds=60,
        message="Too many report reads from this IP. Please slow down.",
    )
    raw = (token or "").strip()
    if not raw:
        raise HTTPException(
            status_code=404,
            detail={"error": ErrorCodes.NOT_FOUND, "message": "Report not found"},
        )
    row = db.query(AgentTask).filter(AgentTask.share_token == raw).first()
    if row is None or not (row.final_answer or "").strip():
        # A token whose task lost its answer should behave like a revoked or
        # unknown link — same 404, no oracle for which tokens exist.
        raise HTTPException(
            status_code=404,
            detail={"error": ErrorCodes.NOT_FOUND, "message": "Report not found"},
        )
    return {
        "token": row.share_token,
        "title": (row.title or "").strip() or (row.task_text or "")[:80],
        "question": row.task_text,
        "answer": row.final_answer,
        "final_score": row.final_score,
        "final_confidence": row.final_confidence,
        "sources": _public_source_references(row),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "shared_at": row.share_created_at.isoformat() if row.share_created_at else None,
    }
