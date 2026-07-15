"""Condura handoff audit + draft APIs (browser-mediated; no server→daemon)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required
from arena.core.handoff_status import (
    ALL_KNOWN_STATUSES,
    ALLOWED_EVENT_KINDS,
    DISPATCHED,
    RUNNING_EVENT_KINDS,
    STREAMING,
)
from arena.core.migration import list_open_flags_for_user, resolve_flag
from arena.core.telemetry import admin_metrics_payload, record_handoff_dispatched, record_probe_state
from arena.database import get_db
from arena.db_models import HandoffDraft, HandoffEvent, HandoffRecord
from arena.models.schemas import UserResponse

logger = logging.getLogger(__name__)
router = APIRouter()


def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class HandoffDispatchBody(BaseModel):
    capability: str = Field(..., min_length=1, max_length=64)
    execution_env: str = Field(..., min_length=1, max_length=32)
    session_id: Optional[str] = None
    condura_run_id: Optional[str] = None
    summary: Optional[str] = Field(None, max_length=512)
    retention_class: str = "standard"
    status: str = DISPATCHED


class HandoffEventBody(BaseModel):
    event_id: Optional[str] = None
    event_kind: str = Field(..., min_length=1, max_length=32)
    payload: Optional[dict[str, Any]] = None


class HandoffDraftBody(BaseModel):
    capability: str = Field(..., min_length=1, max_length=64)
    payload: dict[str, Any]


class ResolveMigrationBody(BaseModel):
    decision: str = Field(..., min_length=1, max_length=64)


class ProbeTelemetryBody(BaseModel):
    kind: str = Field(..., min_length=1, max_length=32)


@router.post("/handoff")
async def record_handoff_dispatch(
    body: HandoffDispatchBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    row = HandoffRecord(
        user_id=user.id,
        session_id=body.session_id,
        capability=body.capability.strip()[:64],
        execution_env=body.execution_env.strip()[:32],
        condura_run_id=(body.condura_run_id or None),
        status=body.status[:32],
        retention_class=body.retention_class[:16] if body.retention_class else "standard",
        summary=(body.summary or "")[:512] or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    record_handoff_dispatched(body.capability)
    return {
        "id": row.id,
        "status": row.status,
        "condura_run_id": row.condura_run_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.post("/handoff/{handoff_id}/events")
async def append_handoff_event(
    handoff_id: int,
    body: HandoffEventBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    row = (
        db.query(HandoffRecord)
        .filter(HandoffRecord.id == handoff_id, HandoffRecord.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Handoff not found")
    kind = body.event_kind.lower().strip()
    # Defense-in-depth: validate kind against the known set before persisting
    # it as a status value. Browser-mediated, but we don't trust arbitrary
    # clients to write any string into HandoffRecord.status.
    if kind not in ALLOWED_EVENT_KINDS:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_event_kind",
                "message": f"event_kind must be one of {sorted(ALLOWED_EVENT_KINDS)}",
            },
        )
    ev = HandoffEvent(
        handoff_id=row.id,
        event_id=body.event_id,
        event_kind=kind[:32],
        payload=body.payload,
    )
    db.add(ev)
    if kind in ALL_KNOWN_STATUSES:
        row.status = kind
    elif kind in RUNNING_EVENT_KINDS:
        row.status = STREAMING
    row.updated_at = _utc_naive()
    db.commit()
    return {"ok": True, "status": row.status}


@router.get("/handoffs")
async def list_handoffs(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    limit: int = 50,
):
    lim = max(1, min(limit, 100))
    rows = (
        db.query(HandoffRecord)
        .filter(HandoffRecord.user_id == user.id)
        .order_by(HandoffRecord.created_at.desc())
        .limit(lim)
        .all()
    )
    return {
        "handoffs": [
            {
                "id": r.id,
                "capability": r.capability,
                "execution_env": r.execution_env,
                "status": r.status,
                "condura_run_id": r.condura_run_id,
                "summary": r.summary,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]
    }


@router.post("/handoff-drafts")
async def save_handoff_draft(
    body: HandoffDraftBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    draft = HandoffDraft(
        user_id=user.id,
        capability=body.capability.strip()[:64],
        payload_json=json.dumps(body.payload)[:100_000],
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return {"id": draft.id, "capability": draft.capability}


@router.get("/handoff-drafts")
async def list_handoff_drafts(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(HandoffDraft)
        .filter(HandoffDraft.user_id == user.id)
        .order_by(HandoffDraft.created_at.desc())
        .limit(50)
        .all()
    )
    out = []
    for r in rows:
        try:
            payload = json.loads(r.payload_json)
        except (json.JSONDecodeError, TypeError):
            payload = {}
        out.append(
            {
                "id": r.id,
                "capability": r.capability,
                "payload": payload,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return {"drafts": out}


@router.delete("/handoff-drafts/{draft_id}")
async def delete_handoff_draft(
    draft_id: int,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    row = (
        db.query(HandoffDraft)
        .filter(HandoffDraft.id == draft_id, HandoffDraft.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Draft not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/migration-flags")
async def get_migration_flags(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    return {"flags": list_open_flags_for_user(db, user.id)}


@router.post("/migration-flags/{flag_id}/resolve")
async def resolve_migration_flag(
    flag_id: int,
    body: ResolveMigrationBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    ok = resolve_flag(db, user.id, flag_id, body.decision)
    if not ok:
        raise HTTPException(status_code=404, detail="Flag not found")
    return {"ok": True}


@router.post("/probe-telemetry")
async def probe_telemetry(
    body: ProbeTelemetryBody,
    user: UserResponse = Depends(get_current_user_required),
):
    """Opt-in categorical probe state only (no ports/paths)."""
    record_probe_state(body.kind)
    return JSONResponse(content={"ok": True})


@router.get("/metrics")
async def get_condura_metrics(
    user: UserResponse = Depends(get_current_user_required),
):
    """Admin-only aggregate Condura handoff counters.

    Process-local telemetry snapshot (no PII). Requires ADMIN_EMAIL match —
    same gate as /api/metrics so any logged-in user cannot scrape ops counters.
    """
    from arena.core.admin_gate import require_admin_email

    require_admin_email(user.email)
    return JSONResponse(content=admin_metrics_payload())
