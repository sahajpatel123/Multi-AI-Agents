"""Integration tests for the manual watchlist "run now" endpoint."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest

from arena.core.blackboard import AgentStatus, create_blackboard, remove_blackboard
from arena.core.datetime_utils import utcnow_naive
from arena.db_models import UserTier, WatchlistItem


def _add_watch(db_session, user_id, question, *, active=True, hours=24):
    item = WatchlistItem(
        user_id=user_id,
        question=question,
        interval_hours=hours,
        expertise_level="expert",
        expertise_domain="finance",
        is_active=active,
        next_run_at=utcnow_naive() - timedelta(hours=1),
        run_count=2,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)
    return item


@pytest.mark.asyncio
async def test_run_now_starts_pipeline_and_advances_schedule(
    app_client, make_user, db_session
):
    user = make_user(email="wl-run@test.com", tier=UserTier.PRO)
    item = _add_watch(db_session, user.id, "How is the Indian IPO market evolving?")
    old_next = item.next_run_at

    with patch(
        "arena.routes.agent.run_agent_pipeline_background",
        new_callable=AsyncMock,
    ) as run_pipeline:
        res = await app_client.post(
            f"/api/agent/watchlist/{item.id}/run",
            headers=_pro_headers(user),
        )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["success"] is True
    assert body["task_id"]
    assert body["message"] == "Watch re-check started"
    assert body["item"]["run_count"] == 3
    assert body["item"]["latest_task_id"] == body["task_id"]
    assert body["item"]["is_active"] is True

    run_pipeline.assert_awaited_once()
    called = run_pipeline.await_args
    assert called is not None
    args = called.args
    assert args[0] == body["task_id"]
    assert args[1] == user.id
    assert args[2] == "How is the Indian IPO market evolving?"
    assert args[3] == "expert"
    assert args[4] == "finance"
    assert args[5] is None
    assert args[6] == item.id

    db_session.refresh(item)
    assert item.run_count == 3
    assert item.latest_task_id == body["task_id"]
    assert item.last_run_at is not None
    assert item.next_run_at > old_next


@pytest.mark.asyncio
async def test_run_now_works_for_paused_watch_without_resuming(
    app_client, make_user, db_session
):
    user = make_user(email="wl-run-paused@test.com", tier=UserTier.PRO)
    item = _add_watch(db_session, user.id, "Paused but worth checking", active=False)

    with patch(
        "arena.routes.agent.run_agent_pipeline_background",
        new_callable=AsyncMock,
    ):
        res = await app_client.post(
            f"/api/agent/watchlist/{item.id}/run",
            headers=_pro_headers(user),
        )

    assert res.status_code == 200, res.text
    assert res.json()["item"]["is_active"] is False
    db_session.refresh(item)
    assert item.is_active is False
    assert item.run_count == 3


@pytest.mark.asyncio
async def test_run_now_rejects_while_latest_task_is_still_running(
    app_client, make_user, db_session
):
    user = make_user(email="wl-run-busy@test.com", tier=UserTier.PRO)
    item = _add_watch(db_session, user.id, "Already being re-checked")
    bb = create_blackboard(user_id=user.id, task=item.question)
    bb.status = AgentStatus.RUNNING
    item.latest_task_id = bb.task_id
    db_session.commit()
    db_session.refresh(item)
    old_next = item.next_run_at
    old_run_count = item.run_count

    try:
        with patch(
            "arena.routes.agent.run_agent_pipeline_background",
            new_callable=AsyncMock,
        ) as run_pipeline:
            res = await app_client.post(
                f"/api/agent/watchlist/{item.id}/run",
                headers=_pro_headers(user),
            )

        assert res.status_code == 409, res.text
        detail = res.json().get("detail", res.json())
        assert detail["error"] == "watchlist_run_in_progress"
        assert detail["task_id"] == bb.task_id
        run_pipeline.assert_not_awaited()

        db_session.refresh(item)
        assert item.run_count == old_run_count
        assert item.latest_task_id == bb.task_id
        assert item.next_run_at == old_next
    finally:
        remove_blackboard(bb.task_id)


@pytest.mark.asyncio
async def test_run_now_requires_plus_tier(app_client, make_user, db_session):
    user = make_user(email="wl-run-free@test.com", tier=UserTier.FREE)
    item = _add_watch(db_session, user.id, "Free tier watch")

    res = await app_client.post(
        f"/api/agent/watchlist/{item.id}/run",
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_run_now_requires_auth(app_client, db_session):
    item = _add_watch(db_session, 1, "No auth watch")
    res = await app_client.post(f"/api/agent/watchlist/{item.id}/run")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_run_now_404_for_other_users_watch(app_client, make_user, db_session):
    alice = make_user(email="wl-run-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="wl-run-bob@test.com", tier=UserTier.PRO)
    bob_item = _add_watch(db_session, bob.id, "Bob's watch")

    res = await app_client.post(
        f"/api/agent/watchlist/{bob_item.id}/run",
        headers=_pro_headers(alice),
    )
    assert res.status_code == 404
