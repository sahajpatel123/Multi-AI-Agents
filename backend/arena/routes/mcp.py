"""MCP integrations: manual token connect, list, search, disconnect."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required
from arena.core.input_validation import sanitize_model_html, sanitize_model_text
from arena.core.mcp_runtime import search_integration_api
from arena.core.rate_limits import enforce_user_rate_limit
from arena.core.token_crypto import encrypt_token, get_fernet
from arena.database import get_db
from arena.db_models import MCPIntegration
from arena.models.schemas import UserResponse
from arena.core.datetime_utils import utcnow_naive

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_SERVICES = frozenset(
    {
        "notion",
        "google_drive",
        "gmail",
        "google_calendar",
        "github",
        "linear",
        "slack",
        "airtable",
        "dropbox",
        "jira",
        "confluence",
        "hubspot",
    }
)

# Display metadata for the services catalog. Kept here (not in DB) because
# the catalog is constant per build — the UI needs the labels to render a
# "Connect a new integration" picker, and fetching them from a config file
# on every request would be slower than a frozenset lookup.
SERVICE_CATALOG: dict[str, dict] = {
    "notion":           {"label": "Notion",            "category": "docs"},
    "google_drive":     {"label": "Google Drive",      "category": "storage"},
    "gmail":            {"label": "Gmail",             "category": "email"},
    "google_calendar":  {"label": "Google Calendar",   "category": "calendar"},
    "github":           {"label": "GitHub",            "category": "dev"},
    "linear":           {"label": "Linear",            "category": "dev"},
    "slack":            {"label": "Slack",             "category": "chat"},
    "airtable":         {"label": "Airtable",          "category": "data"},
    "dropbox":          {"label": "Dropbox",           "category": "storage"},
    "jira":             {"label": "Jira",              "category": "dev"},
    "confluence":       {"label": "Confluence",        "category": "docs"},
    "hubspot":          {"label": "HubSpot",           "category": "crm"},
}


def _ensure_encryption() -> None:
    if get_fernet() is None:
        raise HTTPException(
            status_code=503,
            detail="Server encryption is not configured (ENCRYPTION_KEY). Cannot save tokens.",
        )


def _integration_public(row: MCPIntegration) -> dict:
    meta = row.integration_metadata
    if isinstance(meta, str):
        try:
            import json

            meta = json.loads(meta)
        except Exception:
            meta = None
    return {
        "id": row.id,
        "service": row.service,
        "display_name": row.display_name,
        "is_active": bool(row.is_active),
        "connected_at": row.connected_at.isoformat() if row.connected_at else None,
        "metadata": meta,
    }


class ManualConnectBody(BaseModel):
    service: str
    # Cap token size so a client cannot force multi-MB ciphertext into DB.
    access_token: str = Field(..., min_length=8, max_length=8192)
    display_name: str = Field(..., min_length=1, max_length=128)

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        return sanitize_model_html(v, max_length=100, field_name="display_name")

    @field_validator("access_token")
    @classmethod
    def validate_access_token(cls, v: str) -> str:
        token = (v or "").strip()
        if len(token) < 8:
            raise ValueError("access_token is too short")
        if len(token) > 8192:
            raise ValueError("access_token is too long")
        # Reject control characters that never belong in API tokens.
        if any(ord(c) < 32 for c in token):
            raise ValueError("access_token contains invalid characters")
        return token


class SearchBody(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)

    @field_validator("query")
    @classmethod
    def validate_query(cls, v: str) -> str:
        return sanitize_model_text(v, max_length=500, field_name="query")


@router.get("/integrations")
async def list_integrations(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    include_inactive: bool = Query(
        False,
        description="If true, include disconnected integrations too. "
                    "Default false — most UIs only want the active set.",
    ),
    service: Optional[str] = Query(
        None,
        max_length=64,
        description="Filter to one service. Validated against the catalog.",
    ),
    search: Optional[str] = Query(
        None,
        max_length=128,
        description="Case-insensitive substring match on display_name.",
    ),
):
    """List the caller's MCP integrations.

    Returns an envelope {integrations, total, filters} so the UI can show
    filter chips and the applied-state echo. The base response was always
    bare — the envelope is a backward-compatible shape change (clients
    iterating the 'integrations' key still work; clients using len() on
    the bare array would, but no one did because the original was wrapped
    in a dict already at this endpoint).
    """
    q = db.query(MCPIntegration).filter(MCPIntegration.user_id == user.id)
    if not include_inactive:
        q = q.filter(MCPIntegration.is_active.is_(True))

    if service:
        svc = service.strip().lower()
        if svc not in VALID_SERVICES:
            # Unknown service → empty list rather than 400 so a stale
            # frontend passing an old service name doesn't break the page.
            return {
                "integrations": [],
                "total": 0,
                "filters": {"service": svc, "search": search, "include_inactive": include_inactive},
            }
        q = q.filter(MCPIntegration.service == svc)

    if search:
        # Escape LIKE wildcards so '100%' matches the literal substring.
        # display_name is a short user-chosen label so a small substring
        # scan is fine.
        safe = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        q = q.filter(MCPIntegration.display_name.ilike(f"%{safe}%", escape="\\"))

    rows = q.order_by(MCPIntegration.connected_at.desc()).all()

    return {
        "integrations": [_integration_public(r) for r in rows],
        "total": len(rows),
        "filters": {
            "service": service,
            "search": search,
            "include_inactive": include_inactive,
        },
    }


@router.get("/integrations/services")
async def list_service_catalog(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Catalog of supported integrations, annotated with each user's
    connect status. Drives the 'Connect a new integration' picker in the
    UI without a second roundtrip to /integrations.

    Each catalog entry carries:
      - label: human-readable name
      - category: grouping for the UI (docs / dev / chat / etc.)
      - connected: true if the user already has this service connected
    """
    connected = {
        row.service
        for row in db.query(MCPIntegration).filter(
            MCPIntegration.user_id == user.id,
            MCPIntegration.is_active.is_(True),
        ).all()
    }
    services = []
    for sid, meta in SERVICE_CATALOG.items():
        services.append({
            "service": sid,
            "label": meta["label"],
            "category": meta["category"],
            "connected": sid in connected,
        })
    # Stable alphabetical order so the UI doesn't shuffle on every refetch.
    services.sort(key=lambda s: s["label"])
    return {"services": services, "total": len(services)}


class RenameBody(BaseModel):
    """Body for PATCH /integrations/{id} — change display_name without
    re-validating the access token."""
    display_name: str = Field(..., min_length=1, max_length=128)

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        return sanitize_model_html(v, max_length=100, field_name="display_name")


@router.patch("/integrations/{integration_id}")
async def rename_integration(
    integration_id: int,
    body: RenameBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Rename a connected integration. Same ownership scope as delete:
    foreign-or-missing ids return 404 with the same shape (no oracle)."""
    enforce_user_rate_limit(
        user.id,
        scope="mcp_rename",
        limit=60,
        window_seconds=3600,
        message="Too many integration renames. Please slow down.",
    )
    row = (
        db.query(MCPIntegration)
        .filter(
            MCPIntegration.id == integration_id,
            MCPIntegration.user_id == user.id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Integration not found"},
        )
    row.display_name = body.display_name.strip()[:128]
    db.add(row)
    db.commit()
    db.refresh(row)
    return _integration_public(row)


class ToggleBody(BaseModel):
    """Body for POST /integrations/{id}/toggle — flip is_active without
    deleting the row. A disconnected integration keeps its stored token
    so a future reconnect is just another toggle, not a re-OAuth."""
    is_active: bool


@router.post("/integrations/{integration_id}/toggle")
async def toggle_integration(
    integration_id: int,
    body: ToggleBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Toggle is_active. Distinct from DELETE: DELETE keeps the row but
    marks is_active=False (legacy contract); this endpoint lets the user
    re-enable without going through the connect flow again."""
    enforce_user_rate_limit(
        user.id,
        scope="mcp_toggle",
        limit=60,
        window_seconds=3600,
        message="Too many integration toggles. Please slow down.",
    )
    row = (
        db.query(MCPIntegration)
        .filter(
            MCPIntegration.id == integration_id,
            MCPIntegration.user_id == user.id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Integration not found"},
        )
    row.is_active = bool(body.is_active)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _integration_public(row)


@router.post("/connect/manual")
async def connect_manual(
    body: ManualConnectBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    enforce_user_rate_limit(
        user.id,
        scope="mcp_connect",
        limit=20,
        window_seconds=3600,
        message="Too many integration connect attempts. Please try again later.",
    )
    _ensure_encryption()
    svc = body.service.strip().lower()
    if svc not in VALID_SERVICES:
        raise HTTPException(status_code=400, detail=f"Unsupported service: {svc}")

    enc = encrypt_token(body.access_token.strip())

    existing = (
        db.query(MCPIntegration)
        .filter(MCPIntegration.user_id == user.id, MCPIntegration.service == svc)
        .first()
    )
    now = utcnow_naive()
    if existing:
        existing.access_token = enc
        existing.display_name = body.display_name.strip()[:128]
        existing.is_active = True
        existing.connected_at = now
        db.commit()
        db.refresh(existing)
        return _integration_public(existing)

    row = MCPIntegration(
        user_id=user.id,
        service=svc,
        display_name=body.display_name.strip()[:128],
        access_token=enc,
        refresh_token=None,
        token_expires_at=None,
        is_active=True,
        connected_at=now,
        integration_metadata=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _integration_public(row)


@router.delete("/integrations/{integration_id}")
async def disconnect_integration(
    integration_id: int,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    row = (
        db.query(MCPIntegration)
        .filter(MCPIntegration.id == integration_id, MCPIntegration.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Integration not found")
    row.is_active = False
    db.commit()
    return {"success": True}


@router.post("/integrations/{integration_id}/search")
async def search_integration(
    integration_id: int,
    body: SearchBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    # Bound outbound vendor calls (SSRF-allowlisted but still cost-bearing).
    enforce_user_rate_limit(
        user.id,
        scope="mcp_search",
        limit=60,
        window_seconds=3600,
        message="Too many integration searches. Please try again later.",
    )
    row = (
        db.query(MCPIntegration)
        .filter(
            MCPIntegration.id == integration_id,
            MCPIntegration.user_id == user.id,
            MCPIntegration.is_active.is_(True),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Integration not found")

    results = await search_integration_api(row, body.query)
    return {"results": results}
