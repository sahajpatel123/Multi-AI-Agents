"""MCP integrations: manual token connect, list, search, disconnect."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from arena.core.auth import get_current_user_required
from arena.core.input_validation import sanitize_model_html, sanitize_model_text
from arena.core.mcp_runtime import search_integration_api
from arena.core.token_crypto import encrypt_token, get_fernet
from arena.database import get_db
from arena.db_models import MCPIntegration
from arena.models.schemas import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_SERVICES = frozenset({"notion", "google_drive", "github"})


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
    access_token: str = Field(..., min_length=8)
    display_name: str = Field(..., min_length=1, max_length=128)

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        return sanitize_model_html(v, max_length=100, field_name="display_name")


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
):
    rows = (
        db.query(MCPIntegration)
        .filter(MCPIntegration.user_id == user.id, MCPIntegration.is_active.is_(True))
        .order_by(MCPIntegration.connected_at.desc())
        .all()
    )
    return {"integrations": [_integration_public(r) for r in rows]}


@router.post("/connect/manual")
async def connect_manual(
    body: ManualConnectBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    _ensure_encryption()
    svc = body.service.strip().lower()
    if svc not in ALLOWED_SERVICES:
        raise HTTPException(status_code=400, detail="Invalid service")

    enc = encrypt_token(body.access_token.strip())

    existing = (
        db.query(MCPIntegration)
        .filter(MCPIntegration.user_id == user.id, MCPIntegration.service == svc)
        .first()
    )
    now = datetime.now(timezone.utc).replace(tzinfo=None)
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
