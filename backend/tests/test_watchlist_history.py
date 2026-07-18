"""Integration tests for GET /api/agent/watchlist/{item_id}/history."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

from datetime import datetime, timedelta, timezone

import pytest

from arena.db_models import AgentTask, UserTier, WatchlistItem


def _make_pro(make_user):
    return make_user(email="wh-pro@test.com", tier=UserTier.PRO)



def _seed_watch(session, *, user_id: str, question: str = "Quantum trends?") -> WatchlistItem:
    item = WatchlistItem(
        user_id=user_id,
        question=question,
        interval_hours=24,
        expertise_level="curious",
        expertise_domain="",
        is_active=True,
        next_run_at=utcnow_naive() + timedelta(hours=24),
    )
    session.add(item)
    session.flush()
    return item


def _seed_run(
    session,
    *,
    user_id: int,
    watchlist_item_id: str,
    score: int | None,
    confidence: float | None = None,
    title: str | None = None,
    days_ago: int = 0,
    feedback: str | None = None,
) -> AgentTask:
    created_at = utcnow_naive() - timedelta(days=days_ago)
    row = AgentTask(
        user_id=user_id,
        task_id=f"t-{watchlist_item_id[:8]}-{days_ago}-{score}",
        title=title or f"Run {score}",
        task_text="Explain quantum computing trends this week.",
        final_score=score,
        final_confidence=confidence,
        user_feedback=feedback,
        watchlist_item_id=watchlist_item_id,
        created_at=created_at,
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.asyncio
async def test_history_returns_runs_newest_first_with_stats(
    app_client, make_user, db_session
):
    user = _make_pro(make_user)
    item = _seed_watch(db_session, user_id=user.id)
    _seed_run(db_session, user_id=user.id, watchlist_item_id=item.id, score=60, days_ago=2)
    _seed_run(db_session, user_id=user.id, watchlist_item_id=item.id, score=80, days_ago=1)
    _seed_run(db_session, user_id=user.id, watchlist_item_id=item.id, score=70, days_ago=0)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    items = body["items"]
    assert len(items) == 3
    # Newest first.
    assert items[0]["final_score"] == 70
    assert items[1]["final_score"] == 80
    assert items[2]["final_score"] == 60
    stats = body["stats"]
    assert stats["count"] == 3
    assert stats["scored_count"] == 3
    assert stats["avg_score"] == 70.0
    assert stats["min_score"] == 60
    assert stats["max_score"] == 80


@pytest.mark.asyncio
async def test_history_excludes_unscored_rows_from_min_avg_max(
    app_client, make_user, db_session
):
    user = _make_pro(make_user)
    item = _seed_watch(db_session, user_id=user.id)
    _seed_run(db_session, user_id=user.id, watchlist_item_id=item.id, score=80, days_ago=1)
    _seed_run(db_session, user_id=user.id, watchlist_item_id=item.id, score=None, days_ago=0)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    # All runs show up in the items list and total count,
    # but avg/min/max only consider scored rows.
    assert body["stats"]["count"] == 2
    assert body["stats"]["scored_count"] == 1
    assert body["stats"]["avg_score"] == 80.0
    assert body["stats"]["min_score"] == 80
    assert body["stats"]["max_score"] == 80


@pytest.mark.asyncio
async def test_history_empty_when_watch_has_no_runs(
    app_client, make_user, db_session
):
    user = _make_pro(make_user)
    item = _seed_watch(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["items"] == []
    assert body["stats"]["count"] == 0
    assert body["stats"]["scored_count"] == 0
    assert body["stats"]["avg_score"] is None


@pytest.mark.asyncio
async def test_history_does_not_leak_other_users_runs(
    app_client, make_user, db_session
):
    """Bob's runs on a different watchlist_item_id don't bleed into Alice's response."""
    alice = make_user(email="wh-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="wh-bob@test.com", tier=UserTier.PRO)
    alice_item = _seed_watch(db_session, user_id=alice.id, question="Alice's question")
    _seed_run(db_session, user_id=alice.id, watchlist_item_id=alice_item.id, score=80)
    bob_item = _seed_watch(db_session, user_id=bob.id, question="Bob's question")
    _seed_run(db_session, user_id=bob.id, watchlist_item_id=bob_item.id, score=10)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/watchlist/{alice_item.id}/history",
        headers=_pro_headers(alice),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["stats"]["count"] == 1
    assert body["items"][0]["final_score"] == 80


@pytest.mark.asyncio
async def test_history_404_for_other_users_watch(app_client, make_user, db_session):
    alice = make_user(email="wh-alice2@test.com", tier=UserTier.PRO)
    bob = make_user(email="wh-bob2@test.com", tier=UserTier.PRO)
    bob_item = _seed_watch(db_session, user_id=bob.id)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/watchlist/{bob_item.id}/history",
        headers=_pro_headers(alice),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_history_404_for_missing_watch(app_client, make_user):
    user = _make_pro(make_user)
    res = await app_client.get(
        "/api/agent/watchlist/does-not-exist/history",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_history_403_for_tier_without_watchlist_access(app_client, make_user):
    user = make_user(email="wh-free@test.com", tier=UserTier.FREE)
    res = await app_client.get(
        "/api/agent/watchlist/any-id/history",
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_history_requires_auth(app_client):
    res = await app_client.get("/api/agent/watchlist/any-id/history")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_history_clamps_limit(app_client, make_user, db_session):
    user = _make_pro(make_user)
    item = _seed_watch(db_session, user_id=user.id)
    db_session.commit()

    # limit=9999 → clamps internally; route should still 200
    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history?limit=9999",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
