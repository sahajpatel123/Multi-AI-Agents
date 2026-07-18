"""Condura handoff audit + draft APIs (browser-mediated; no server→daemon)."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

import json
import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from arena.core.admin_gate import require_admin_email
from arena.core.dependencies import get_current_user_required
from arena.core.handoff_status import (
    ALL_KNOWN_STATUSES,
    ALLOWED_EVENT_KINDS,
    DISPATCHED,
    RUNNING_EVENT_KINDS,
    STREAMING,
)
from arena.core.migration import list_open_flags_for_user, resolve_flag, summarize_flags_for_user
from arena.core.rate_limits import enforce_user_rate_limit
from arena.core.telemetry import (
    admin_metrics_payload,
    record_handoff_dispatched,
    record_probe_state,
    render_prometheus,
)
from arena.database import get_db
from arena.db_models import HandoffDraft, HandoffEvent, HandoffRecord
from arena.models.schemas import UserResponse

logger = logging.getLogger(__name__)
router = APIRouter()




# Free-form JSON blobs (event/draft payloads) must not bloat Postgres.
# Defense-in-depth beyond the global 10KB request body ceiling.
_EVENT_PAYLOAD_MAX_KEYS = 40
_EVENT_PAYLOAD_MAX_CHARS = 4000
_DRAFT_PAYLOAD_MAX_KEYS = 80
_DRAFT_PAYLOAD_MAX_CHARS = 50_000


def _bound_json_object(
    value: Any,
    *,
    max_keys: int,
    max_chars: int,
    field_name: str,
) -> dict[str, Any]:
    """Require a JSON object with bounded key count and serialized size."""
    if not isinstance(value, dict):
        raise ValueError(f"{field_name} must be an object")
    if len(value) > max_keys:
        raise ValueError(f"{field_name} has too many keys (max {max_keys})")
    try:
        serialized = json.dumps(value, default=str)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} is not JSON-serializable") from exc
    if len(serialized) > max_chars:
        raise ValueError(f"{field_name} is too large (max {max_chars} chars)")
    return value


class HandoffDispatchBody(BaseModel):
    capability: str = Field(..., min_length=1, max_length=64)
    execution_env: str = Field(..., min_length=1, max_length=32)
    session_id: Optional[str] = Field(None, max_length=128)
    condura_run_id: Optional[str] = Field(None, max_length=128)
    summary: Optional[str] = Field(None, max_length=512)
    retention_class: str = Field(default="standard", max_length=16)
    status: str = Field(default=DISPATCHED, max_length=32)


class HandoffEventBody(BaseModel):
    event_id: Optional[str] = Field(None, max_length=128)
    event_kind: str = Field(..., min_length=1, max_length=32)
    payload: Optional[dict[str, Any]] = None

    @field_validator("payload")
    @classmethod
    def validate_event_payload(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        if v is None:
            return None
        return _bound_json_object(
            v,
            max_keys=_EVENT_PAYLOAD_MAX_KEYS,
            max_chars=_EVENT_PAYLOAD_MAX_CHARS,
            field_name="payload",
        )


class HandoffDraftBody(BaseModel):
    capability: str = Field(..., min_length=1, max_length=64)
    payload: dict[str, Any]

    @field_validator("payload")
    @classmethod
    def validate_draft_payload(cls, v: dict[str, Any]) -> dict[str, Any]:
        return _bound_json_object(
            v,
            max_keys=_DRAFT_PAYLOAD_MAX_KEYS,
            max_chars=_DRAFT_PAYLOAD_MAX_CHARS,
            field_name="payload",
        )


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
    # Bound write volume so a client cannot fill HandoffRecord tables.
    enforce_user_rate_limit(
        user.id,
        scope="condura_handoff",
        limit=60,
        window_seconds=3600,
        message="Too many Condura handoffs. Please try again later.",
    )
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
    enforce_user_rate_limit(
        user.id,
        scope="condura_handoff_event",
        limit=120,
        window_seconds=3600,
        message="Too many Condura handoff events. Please try again later.",
    )
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
    row.updated_at = utcnow_naive()
    db.commit()
    return {"ok": True, "status": row.status}


@router.get("/handoffs")
async def list_handoffs(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    capability: Optional[str] = Query(None, max_length=64, description="Filter by capability (e.g. 'delegate_task')."),
    status: Optional[str] = Query(None, max_length=32, description="Filter by status (e.g. 'dispatched', 'completed')."),
):
    """List the caller's handoff records with optional filters and pagination.

    Returns an envelope {handoffs, total, page, per_page, total_pages,
    filters} so the UI can render pagination controls and a filter
    summary without inferring state.
    """
    # 60/min/user — list pagination scraping bound.
    enforce_user_rate_limit(
        user.id,
        scope="condura_handoffs_list",
        limit=60,
        window_seconds=60,
        message="Too many handoff list reads. Please slow down.",
    )
    q = db.query(HandoffRecord).filter(HandoffRecord.user_id == user.id)

    if capability:
        q = q.filter(HandoffRecord.capability == capability)
    if status:
        q = q.filter(HandoffRecord.status == status)

    total = q.count()
    rows = (
        q.order_by(HandoffRecord.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
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
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page if per_page else 0,
        "filters": {"capability": capability, "status": status},
    }


@router.get("/handoffs/{handoff_id}")
async def get_handoff(
    handoff_id: int,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Full handoff detail — the parent row plus every HandoffEvent in
    chronological order. List endpoints strip event bodies to keep the
    payload small, so the UI fetches the detail only when needed.

    Foreign-or-missing ids return 404 with the same shape so a caller
    can't enumerate by status code.
    """
    # 60/min/user — same throttle shape as the list endpoint.
    enforce_user_rate_limit(
        user.id,
        scope="condura_handoff_detail",
        limit=60,
        window_seconds=60,
        message="Too many handoff detail reads. Please slow down.",
    )
    row = (
        db.query(HandoffRecord)
        .filter(HandoffRecord.id == handoff_id, HandoffRecord.user_id == user.id)
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Handoff not found"},
        )

    events = (
        db.query(HandoffEvent)
        .filter(HandoffEvent.handoff_id == handoff_id)
        .order_by(HandoffEvent.created_at.asc())
        .all()
    )
    return {
        "id": row.id,
        "capability": row.capability,
        "execution_env": row.execution_env,
        "status": row.status,
        "condura_run_id": row.condura_run_id,
        "session_id": row.session_id,
        "summary": row.summary,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "events": [
            {
                "id": e.id,
                "event_kind": e.event_kind,
                "payload": _decode_event_payload(e.payload),
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ],
    }


@router.post("/handoff-drafts")
async def save_handoff_draft(
    body: HandoffDraftBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    # Payload size is validated on the model; rate-limit stops table spam.
    enforce_user_rate_limit(
        user.id,
        scope="condura_handoff_draft",
        limit=40,
        window_seconds=3600,
        message="Too many Condura drafts. Please try again later.",
    )
    draft = HandoffDraft(
        user_id=user.id,
        capability=body.capability.strip()[:64],
        # Already bounded by HandoffDraftBody validator (max keys + chars).
        payload_json=json.dumps(body.payload, default=str),
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return {"id": draft.id, "capability": draft.capability}


@router.get("/handoff-drafts")
async def list_handoff_drafts(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    capability: Optional[str] = Query(None, max_length=64, description="Filter by capability."),
):
    """List the caller's saved handoff drafts with optional capability filter.

    Drafts are typically short-lived (the browser saves one and the user
    either submits or abandons it), so a default 50-row cap is plenty.
    """
    # 60/min/user — list pagination scraping bound (mirrors /handoffs).
    enforce_user_rate_limit(
        user.id,
        scope="condura_handoff_drafts_list",
        limit=60,
        window_seconds=60,
        message="Too many handoff-draft list reads. Please slow down.",
    )
    q = db.query(HandoffDraft).filter(HandoffDraft.user_id == user.id)
    if capability:
        q = q.filter(HandoffDraft.capability == capability)

    total = q.count()
    rows = (
        q.order_by(HandoffDraft.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
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
    return {
        "drafts": out,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page if per_page else 0,
        "filters": {"capability": capability},
    }


def _decode_event_payload(raw) -> dict | None:
    """Normalize the event payload across drivers.

    Postgres returns JSON columns as native dicts; SQLite (test) returns
    TEXT. Without this, the detail endpoint would return a string on
    SQLite and a dict on Postgres — the response shape would differ
    between environments.
    """
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else None
        except (json.JSONDecodeError, TypeError):
            return None
    return None


@router.delete("/handoff-drafts/{draft_id}")
async def delete_handoff_draft(
    draft_id: int,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    # Defense-in-depth: ownership is gated (404 if not yours) but a hostile
    # caller still gets one DB hit per attempt and burns a request lifecycle.
    # Same shape as DELETE /api/rooms/{slug} (cycle 40).
    enforce_user_rate_limit(
        user.id,
        scope="condura_handoff_draft_delete",
        limit=10,
        window_seconds=60,
        message="Too many handoff-draft delete attempts. Please slow down.",
    )
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
    # 60/min/user — open-flags list for the caller.
    enforce_user_rate_limit(
        user.id,
        scope="condura_migration_flags",
        limit=60,
        window_seconds=60,
        message="Too many migration-flag reads. Please slow down.",
    )
    return {"flags": list_open_flags_for_user(db, user.id)}


@router.get("/migration-flags/summary")
async def get_migration_flags_summary(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Cheaper sibling of /migration-flags — aggregate counts only.

    Useful for a status badge ('3 flags pending') in the UI header
    without paying the cost of fetching every row. Returns:
      - total_open: total open flags for the caller
      - by_kind: {kind_label: count}
      - by_capability: {affected_capability: count}

    Open flags only — resolved flags don't show up here. If the user
    wants the full history (open + resolved) we'd add an
    include_resolved query param to /migration-flags.
    """
    # 120/min/user — cheap aggregate; status badge in UI hits this often.
    enforce_user_rate_limit(
        user.id,
        scope="condura_migration_flags_summary",
        limit=120,
        window_seconds=60,
        message="Too many migration-flag summary reads. Please slow down.",
    )
    return summarize_flags_for_user(db, user.id)


@router.post("/migration-flags/{flag_id}/resolve")
async def resolve_migration_flag(
    flag_id: int,
    body: ResolveMigrationBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    # 30/min/user — write; cheap to spam if uncapped (just an UPDATE).
    enforce_user_rate_limit(
        user.id,
        scope="condura_migration_flag_resolve",
        limit=30,
        window_seconds=60,
        message="Too many migration-flag resolve attempts. Please slow down.",
    )
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
    # Cheap counter writes — still bound so a client cannot flood metrics.
    enforce_user_rate_limit(
        user.id,
        scope="condura_probe_telemetry",
        limit=120,
        window_seconds=3600,
        message="Too many Condura probe telemetry events. Please try again later.",
    )
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
    require_admin_email(user.email)
    return JSONResponse(content=admin_metrics_payload())


@router.get("/metrics/prom", response_class=PlainTextResponse)
async def get_condura_metrics_prom(
    user: UserResponse = Depends(get_current_user_required),
):
    """Prometheus text-format snapshot of the in-process counters.

    Same admin gate as /api/condura/metrics — the operator scraper
    needs a bearer token, and the email must match ADMIN_EMAIL.
    Returns ``text/plain; version=0.0.4`` so Prometheus servers accept
    the response without a content-type override.
    """
    require_admin_email(user.email)
    body = render_prometheus()
    return PlainTextResponse(content=body, media_type="text/plain; version=0.0.4")
