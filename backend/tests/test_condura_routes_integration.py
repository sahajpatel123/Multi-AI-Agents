"""Real integration tests for Condura handoff events route.

These exercise the actual FastAPI route with TestClient — not just the
helper functions. They exist to verify the defense-in-depth allow-list
actually returns 400, and to ensure the route behaves correctly under
real request flow.
"""

from __future__ import annotations

import os
import sys

import pytest

_BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

os.environ.setdefault("SECRET_KEY", "x" * 40)
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")


def test_handoff_events_route_rejects_unknown_event_kind(isolated_db):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from arena.core.dependencies import get_current_user_required
    from arena.database import get_db
    from arena.db_models import HandoffRecord, User, UserTier
    from arena.routes.condura import router as condura_router

    SessionLocal = isolated_db
    db = SessionLocal()
    try:
        u = User(
            email="route@test.com",
            password_hash="x",
            tier=UserTier.PRO,
            name="Route",
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        h = HandoffRecord(
            user_id=u.id,
            capability="agent.long_research",
            execution_env="hybrid_delegate",
            status="dispatch_pending",
        )
        db.add(h)
        db.commit()
        db.refresh(h)
        handoff_id = h.id
        user_id = u.id
    finally:
        db.close()

    app = FastAPI()
    app.include_router(condura_router, prefix="/api/condura")

    def _override_user():
        class _U:
            id = user_id
            email = "route@test.com"
            tier = UserTier.PRO
        return _U()

    app.dependency_overrides[get_current_user_required] = _override_user
    app.dependency_overrides[get_db] = lambda: SessionLocal()

    client = TestClient(app)

    # Invalid event_kind — must be rejected by the allow-list guard.
    r = client.post(
        f"/api/condura/handoff/{handoff_id}/events",
        json={"event_kind": "totally_unknown_kind", "payload": {}},
    )
    assert r.status_code == 400, (
        f"expected 400 for unknown event_kind, got {r.status_code}: {r.text}"
    )
    body = r.json()
    assert "invalid_event_kind" in str(body)

    # Valid streaming event_kind — must succeed and persist status='streaming'.
    r2 = client.post(
        f"/api/condura/handoff/{handoff_id}/events",
        json={"event_kind": "started", "payload": {}},
    )
    assert r2.status_code == 200, f"expected 200 for 'started', got {r2.status_code}: {r2.text}"
    assert r2.json()["status"] == "streaming"

    # Valid terminal event_kind — must succeed and persist status='complete'.
    r3 = client.post(
        f"/api/condura/handoff/{handoff_id}/events",
        json={"event_kind": "complete", "payload": {"result": "ok"}},
    )
    assert r3.status_code == 200, f"expected 200 for 'complete', got {r3.status_code}: {r3.text}"
    assert r3.json()["status"] == "complete"


def test_handoff_events_route_404_for_other_user(isolated_db):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from arena.core.dependencies import get_current_user_required
    from arena.database import get_db
    from arena.db_models import HandoffRecord, User, UserTier
    from arena.routes.condura import router as condura_router

    SessionLocal = isolated_db
    db = SessionLocal()
    try:
        u1 = User(email="a@test.com", password_hash="x", tier=UserTier.PRO, name="A")
        u2 = User(email="b@test.com", password_hash="x", tier=UserTier.PRO, name="B")
        db.add_all([u1, u2])
        db.commit()
        db.refresh(u1)
        db.refresh(u2)
        # Handoff belonging to u2.
        h = HandoffRecord(
            user_id=u2.id,
            capability="agent.long_research",
            execution_env="hybrid_delegate",
            status="dispatch_pending",
        )
        db.add(h)
        db.commit()
        db.refresh(h)
        handoff_id = h.id
        attacker_id = u1.id
    finally:
        db.close()

    app = FastAPI()
    app.include_router(condura_router, prefix="/api/condura")

    def _override_user():
        class _U:
            id = attacker_id
            email = "a@test.com"
            tier = UserTier.PRO
        return _U()

    app.dependency_overrides[get_current_user_required] = _override_user
    app.dependency_overrides[get_db] = lambda: SessionLocal()

    client = TestClient(app)
    # u1 attempting to write events to u2's handoff → 404 (ownership gate).
    r = client.post(
        f"/api/condura/handoff/{handoff_id}/events",
        json={"event_kind": "complete"},
    )
    assert r.status_code == 404, f"expected 404 for cross-user access, got {r.status_code}"


def test_db_models_default_handoff_status_matches_constant():
    """db_models.py default='dispatch_pending' must equal
    handoff_status.DISPATCH_PENDING. We don't import the constant at the
    model (early-load circular risk), so this test catches drift manually."""
    from arena.core.handoff_status import DISPATCH_PENDING
    from arena.db_models import HandoffRecord

    # Reach into the column default.
    col = HandoffRecord.__table__.c.status
    default = col.default
    # Column default is a scalar; literal value is in .arg
    val = getattr(default, "arg", default)
    assert val == DISPATCH_PENDING, (
        f"db_models default '{val}' drifted from handoff_status.DISPATCH_PENDING='{DISPATCH_PENDING}'"
    )