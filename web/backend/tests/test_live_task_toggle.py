"""Integration tests for POST /api/agent/tasks/{task_id}/live."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AgentTask, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_task(session, *, user_id: int, is_live: bool = False, task_text: str = "Tell me about X"):
    row = AgentTask(
        user_id=user_id,
        task_id=f"live-{user_id}-{is_live}-{task_text[:10]}",
        task_text=task_text,
        is_live=is_live,
    )
    session.add(row)
    session.flush()
    session.refresh(row)
    return row


@pytest.mark.asyncio
async def test_toggle_flips_is_live_on(app_client, make_user, db_session):
    user = make_user(email="live-toggle@test.com", tier=UserTier.PRO)
    item = _seed_task(session=db_session, user_id=user.id, is_live=False)
    db_session.commit()

    res = await app_client.post(
        f"/api/agent/tasks/{item.task_id}/live",
        headers=_pro_headers(user),
        json={},
    )
    assert res.status_code == 200
    body = res.json()["task"]
    assert body.get("is_live") is True
    # live_next_check set ~24h in the future when toggled on
    assert body.get("live_next_check")


@pytest.mark.asyncio
async def test_toggle_explicit_false_clears_live_next_check(
    app_client, make_user, db_session
):
    user = make_user(email="live-off@test.com", tier=UserTier.PRO)
    item = _seed_task(session=db_session, user_id=user.id, is_live=True)
    db_session.commit()

    res = await app_client.post(
        f"/api/agent/tasks/{item.task_id}/live",
        headers=_pro_headers(user),
        json={"is_live": False},
    )
    assert res.status_code == 200
    body = res.json()["task"]
    assert body.get("is_live") is False
    # live_next_check cleared when toggled off
    assert body.get("live_next_check") is None


@pytest.mark.asyncio
async def test_toggle_404_for_other_users_task(app_client, make_user, db_session):
    alice = make_user(email="live-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="live-bob@test.com", tier=UserTier.PRO)
    bob_item = _seed_task(session=db_session, user_id=bob.id, is_live=False)
    db_session.commit()

    res = await app_client.post(
        f"/api/agent/tasks/{bob_item.task_id}/live",
        headers=_pro_headers(alice),
        json={"is_live": True},
    )
    assert res.status_code == 404
    # Bob's task is untouched.
    db_session.refresh(bob_item)
    assert bob_item.is_live is False


@pytest.mark.asyncio
async def test_toggle_404_for_missing_task(app_client, make_user):
    user = make_user(email="live-missing@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/agent/tasks/does-not-exist/live",
        headers=_pro_headers(user),
        json={"is_live": True},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_toggle_403_for_free_tier(app_client, make_user, db_session):
    user = make_user(email="live-free@test.com", tier=UserTier.FREE)
    item = _seed_task(session=db_session, user_id=user.id, is_live=False)
    db_session.commit()

    res = await app_client.post(
        f"/api/agent/tasks/{item.task_id}/live",
        headers=_pro_headers(user),
        json={"is_live": True},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_toggle_requires_auth(app_client, make_user, db_session):
    user = make_user(email="live-anon@test.com", tier=UserTier.PRO)
    item = _seed_task(session=db_session, user_id=user.id, is_live=False)
    db_session.commit()

    res = await app_client.post(
        f"/api/agent/tasks/{item.task_id}/live",
        json={"is_live": True},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_toggle_keeps_creation_timestamp(app_client, make_user, db_session):
    """Toggling must not mutate created_at — it's a research history anchor."""
    user = make_user(email="live-ts@test.com", tier=UserTier.PRO)
    created = datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc).replace(tzinfo=None)
    row = AgentTask(
        user_id=user.id,
        task_id="live-ts-task",
        task_text="When was the moon landing?",
        is_live=False,
        created_at=created,
    )
    db_session.add(row)
    db_session.commit()

    res = await app_client.post(
        "/api/agent/tasks/live-ts-task/live",
        headers=_pro_headers(user),
        json={"is_live": True},
    )
    assert res.status_code == 200
    db_session.refresh(row)
    assert row.created_at == created
