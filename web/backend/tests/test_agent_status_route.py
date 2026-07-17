"""Integration tests for GET /api/agent/status/{task_id}."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AgentTask, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed(session, *, user_id: int, task_id: str):
    row = AgentTask(
        user_id=user_id,
        task_id=task_id,
        task_text="Status question.",
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.asyncio
async def test_status_returns_complete_when_task_persisted(app_client, make_user, db_session):
    """When no in-memory blackboard exists, the route falls back to the
    DB and reports every stage as 'complete'."""
    user = make_user(email="status-ok@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="status-1")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/status/status-1",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["task_id"] == "status-1"
    assert body["status"] == "complete"
    assert body["current_stage"] == "done"
    # All 7 stages must be marked complete.
    assert body["stages"]["planner"]["status"] == "complete"
    assert body["stages"]["judge"]["status"] == "complete"


@pytest.mark.asyncio
async def test_status_404_when_no_blackboard_and_no_db_row(app_client, make_user):
    user = make_user(email="status-missing@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/status/never-existed",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_status_404_for_other_users_task(app_client, make_user, db_session):
    alice = make_user(email="status-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="status-bob@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=bob.id, task_id="bob-status")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/status/bob-status",
        headers=_pro_headers(alice),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_status_403_for_free_tier(app_client, make_user, db_session):
    user = make_user(email="status-free@test.com", tier=UserTier.FREE)
    _seed(db_session, user_id=user.id, task_id="status-free")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/status/status-free",
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_status_requires_auth(app_client, make_user, db_session):
    user = make_user(email="status-anon@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="status-anon")
    db_session.commit()

    res = await app_client.get("/api/agent/status/status-anon")
    assert res.status_code == 401
