"""Integration tests for live updates read + mark-read endpoints."""

from __future__ import annotations

import json

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AgentTask, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_task(session, *, user_id: int, live_updates: list | None = None):
    row = AgentTask(
        user_id=user_id,
        task_id=f"lu-{user_id}-task",
        task_text="Watch this space.",
        live_updates=json.dumps(live_updates or []),
        is_live=True,
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.asyncio
async def test_get_updates_returns_seeded_payload(app_client, make_user, db_session):
    user = make_user(email="lu-get@test.com", tier=UserTier.PRO)
    updates = [
        {"snippet": "First update", "found_at": "2026-07-16T10:00:00Z"},
        {"snippet": "Second update", "found_at": "2026-07-16T14:00:00Z"},
    ]
    _seed_task(db_session, user_id=user.id, live_updates=updates)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/tasks/lu-1-task/updates",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["live_updates"] == updates


@pytest.mark.asyncio
async def test_get_updates_empty_array_when_no_updates(app_client, make_user, db_session):
    user = make_user(email="lu-empty@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=user.id, live_updates=[])
    db_session.commit()

    res = await app_client.get(
        "/api/agent/tasks/lu-1-task/updates",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.json()["live_updates"] == []


@pytest.mark.asyncio
async def test_get_updates_404_for_other_users_task(app_client, make_user, db_session):
    alice = make_user(email="lu-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="lu-bob@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=bob.id, live_updates=[])
    db_session.commit()

    res = await app_client.get(
        "/api/agent/tasks/lu-2-task/updates",
        headers=_pro_headers(alice),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_updates_404_for_missing_task(app_client, make_user):
    user = make_user(email="lu-missing@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/tasks/missing/updates",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_updates_403_for_free_tier(app_client, make_user, db_session):
    user = make_user(email="lu-free@test.com", tier=UserTier.FREE)
    _seed_task(db_session, user_id=user.id, live_updates=[])
    db_session.commit()

    res = await app_client.get(
        "/api/agent/tasks/lu-3-task/updates",
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_get_updates_requires_auth(app_client):
    res = await app_client.get("/api/agent/tasks/anything/updates")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_mark_read_clears_unread_flags(app_client, make_user, db_session):
    user = make_user(email="lu-mark@test.com", tier=UserTier.PRO)
    updates = [
        {"id": "u1", "snippet": "Old", "found_at": "2026-07-10T10:00:00Z", "status": "new"},
        {"id": "u2", "snippet": "Recent", "found_at": "2026-07-16T14:00:00Z", "status": "new"},
    ]
    _seed_task(db_session, user_id=user.id, live_updates=updates)
    db_session.commit()

    res = await app_client.post(
        f"/api/agent/tasks/lu-{user.id}-task/live-updates/mark-read",
        headers=_pro_headers(user),
        json={"update_id": "u1"},
    )
    assert res.status_code == 200
    body = res.json()
    after = body["live_updates"]
    by_id = {u["id"]: u for u in after}
    assert by_id["u1"].get("status") == "read"
    assert by_id["u2"].get("status") == "new"


@pytest.mark.asyncio
async def test_mark_read_with_empty_id_marks_all(app_client, make_user, db_session):
    """An empty update_id in the body marks every entry read in one call."""
    user = make_user(email="lu-mark-all@test.com", tier=UserTier.PRO)
    updates = [
        {"id": "u1", "snippet": "A", "found_at": "2026-07-16T10:00:00Z", "status": "new"},
        {"id": "u2", "snippet": "B", "found_at": "2026-07-16T11:00:00Z", "status": "new"},
    ]
    _seed_task(db_session, user_id=user.id, live_updates=updates)
    db_session.commit()

    res = await app_client.post(
        f"/api/agent/tasks/lu-{user.id}-task/live-updates/mark-read",
        headers=_pro_headers(user),
        json={"update_id": ""},
    )
    assert res.status_code == 200
    after = res.json()["live_updates"]
    assert all(u.get("status") == "read" for u in after), after


@pytest.mark.asyncio
async def test_mark_read_404_for_other_users_task(app_client, make_user, db_session):
    alice = make_user(email="lu-mark-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="lu-mark-bob@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=bob.id, live_updates=[])
    db_session.commit()

    res = await app_client.post(
        f"/api/agent/tasks/lu-{bob.id}-task/live-updates/mark-read",
        headers=_pro_headers(alice),
        json={"update_id": ""},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_mark_read_404_for_other_users_task(app_client, make_user, db_session):
    alice = make_user(email="lu-mark-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="lu-mark-bob@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=bob.id, live_updates=[])
    db_session.commit()

    res = await app_client.post(
        "/api/agent/tasks/lu-6-task/live-updates/mark-read",
        headers=_pro_headers(alice),
        json={"before": "2026-07-15T00:00:00Z"},
    )
    assert res.status_code == 404
