"""Integration tests for POST /api/agent/tasks/{task_id}/live."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AgentTask, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_task(
    session,
    *,
    user_id: int,
    is_live: bool = False,
    task_text: str = "Tell me about X",
    task_id: str | None = None,
):
    import uuid

    row = AgentTask(
        user_id=user_id,
        task_id=task_id or f"live-{user_id}-{uuid.uuid4().hex[:12]}",
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
async def test_toggle_enforces_max_active_live(app_client, make_user, db_session):
    """Cannot enable more than LIVE_MAX_ACTIVE concurrent live threads."""
    from arena.routes.agent import LIVE_MAX_ACTIVE

    user = make_user(email="live-cap@test.com", tier=UserTier.PRO)
    # Fill the live quota.
    for i in range(LIVE_MAX_ACTIVE):
        _seed_task(
            session=db_session,
            user_id=user.id,
            is_live=True,
            task_text=f"Live seed {i}",
        )
    extra = _seed_task(
        session=db_session,
        user_id=user.id,
        is_live=False,
        task_text="One more live attempt",
    )
    db_session.commit()

    res = await app_client.post(
        f"/api/agent/tasks/{extra.task_id}/live",
        headers=_pro_headers(user),
        json={"is_live": True},
    )
    assert res.status_code == 400, res.text
    detail = res.json().get("detail") or res.json()
    if isinstance(detail, dict):
        assert detail.get("error") == "live_limit_reached"
    db_session.refresh(extra)
    assert extra.is_live is False


@pytest.mark.asyncio
async def test_toggle_off_allowed_at_cap(app_client, make_user, db_session):
    """Turning live off must still work when already at the cap."""
    from arena.routes.agent import LIVE_MAX_ACTIVE

    user = make_user(email="live-off-cap@test.com", tier=UserTier.PRO)
    live_ids = []
    for i in range(LIVE_MAX_ACTIVE):
        row = _seed_task(
            session=db_session,
            user_id=user.id,
            is_live=True,
            task_text=f"Live off seed {i}",
        )
        live_ids.append(row.task_id)
    db_session.commit()

    res = await app_client.post(
        f"/api/agent/tasks/{live_ids[0]}/live",
        headers=_pro_headers(user),
        json={"is_live": False},
    )
    assert res.status_code == 200, res.text
    assert res.json()["task"]["is_live"] is False


@pytest.mark.asyncio
async def test_toggle_is_rate_limited(app_client, make_user, db_session, monkeypatch):
    from arena.core import rate_limits

    hits = {"n": 0}
    real_hit = rate_limits.rate_limiter.hit

    def limited_hit(key, *, limit, window_seconds, message):
        if "user:agent_live_toggle:" in key:
            hits["n"] += 1
            if hits["n"] > 0:
                from fastapi import HTTPException, status

                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "error": "rate_limit_exceeded",
                        "message": message,
                        "retry_after": 1,
                    },
                )
            return
        return real_hit(key, limit=limit, window_seconds=window_seconds, message=message)

    monkeypatch.setattr(rate_limits.rate_limiter, "hit", limited_hit)

    user = make_user(email="live-rl@test.com", tier=UserTier.PRO)
    item = _seed_task(session=db_session, user_id=user.id, is_live=False)
    db_session.commit()

    res = await app_client.post(
        f"/api/agent/tasks/{item.task_id}/live",
        headers=_pro_headers(user),
        json={"is_live": True},
    )
    assert res.status_code == 429, res.text


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
