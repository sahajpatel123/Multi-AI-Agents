"""Admin gate for ops metrics (shared Condura + platform metrics)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException


def test_require_admin_email_503_when_unconfigured(monkeypatch):
    from arena.core import admin_gate

    monkeypatch.setattr(
        "arena.config.get_settings",
        lambda: type("S", (), {"admin_email": ""})(),
    )
    with pytest.raises(HTTPException) as ei:
        admin_gate.require_admin_email("anyone@example.com")
    assert ei.value.status_code == 503
    detail = ei.value.detail
    if isinstance(detail, dict):
        assert detail.get("error") == "admin_not_configured"


def test_require_admin_email_403_for_non_admin(monkeypatch):
    from arena.core import admin_gate

    monkeypatch.setattr(
        "arena.config.get_settings",
        lambda: type("S", (), {"admin_email": "ops@arena.test"})(),
    )
    with pytest.raises(HTTPException) as ei:
        admin_gate.require_admin_email("user@example.com")
    assert ei.value.status_code == 403


def test_require_admin_email_allows_admin(monkeypatch):
    from arena.core import admin_gate

    monkeypatch.setattr(
        "arena.config.get_settings",
        lambda: type("S", (), {"admin_email": "ops@arena.test"})(),
    )
    admin_gate.require_admin_email("ops@arena.test")
    admin_gate.require_admin_email("OPS@Arena.Test")


def test_condura_metrics_route_rejects_non_admin(isolated_db, monkeypatch):
    """Shipped /api/condura/metrics rejects non-admin authenticated users."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from arena.core.auth import create_access_token, hash_password
    from arena.database import get_db
    from arena.db_models import User, UserTier
    from arena.routes.condura import router as condura_router

    monkeypatch.setattr(
        "arena.config.get_settings",
        lambda: type("S", (), {"admin_email": "ops@arena.test"})(),
    )

    SessionLocal = isolated_db
    db = SessionLocal()
    try:
        user = User(
            email="user@example.com",
            password_hash=hash_password("Strong1Pass"),
            tier=UserTier.PRO,
            name="User",
        )
        admin = User(
            email="ops@arena.test",
            password_hash=hash_password("Strong1Pass"),
            tier=UserTier.PRO,
            name="Ops",
        )
        db.add(user)
        db.add(admin)
        db.commit()
        db.refresh(user)
        db.refresh(admin)
        user_id, admin_id = user.id, admin.id
    finally:
        db.close()

    app = FastAPI()
    app.include_router(condura_router, prefix="/api/condura")

    def _override():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _override
    client = TestClient(app)

    user_tok = create_access_token(user_id, "user@example.com")
    admin_tok = create_access_token(admin_id, "ops@arena.test")

    r_user = client.get(
        "/api/condura/metrics",
        headers={"Authorization": f"Bearer {user_tok}"},
    )
    assert r_user.status_code == 403, r_user.text

    r_admin = client.get(
        "/api/condura/metrics",
        headers={"Authorization": f"Bearer {admin_tok}"},
    )
    assert r_admin.status_code == 200, r_admin.text
    assert "counters" in r_admin.json()
