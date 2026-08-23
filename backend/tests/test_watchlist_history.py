"""Integration tests for GET /api/agent/watchlist/{item_id}/history."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

from datetime import timedelta

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

    # limit=9999 → exceeds Query(le=200); FastAPI rejects with 422
    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history?limit=9999",
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_history_paginates_with_offset_and_has_more(
    app_client, make_user, db_session
):
    """offset pages older runs while total/has_more stay coherent and stats
    describe the full history rather than just the current page."""
    user = _make_pro(make_user)
    item = _seed_watch(db_session, user_id=user.id)
    for days_ago, score in ((4, 10), (3, 20), (2, 30), (1, 40), (0, 50)):
        _seed_run(
            db_session,
            user_id=user.id,
            watchlist_item_id=item.id,
            score=score,
            days_ago=days_ago,
        )
    db_session.commit()

    first = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history?limit=2&offset=0",
        headers=_pro_headers(user),
    )
    assert first.status_code == 200
    first_body = first.json()
    assert [row["final_score"] for row in first_body["items"]] == [50, 40]
    assert first_body["total"] == 5
    assert first_body["has_more"] is True
    assert first_body["stats"] == {
        "count": 5,
        "scored_count": 5,
        "avg_score": 30.0,
        "min_score": 10,
        "max_score": 50,
    }

    middle = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history?limit=2&offset=2",
        headers=_pro_headers(user),
    )
    assert middle.status_code == 200
    middle_body = middle.json()
    assert [row["final_score"] for row in middle_body["items"]] == [30, 20]
    assert middle_body["total"] == 5
    assert middle_body["has_more"] is True
    assert middle_body["stats"]["count"] == 5

    last = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history?limit=2&offset=4",
        headers=_pro_headers(user),
    )
    assert last.status_code == 200
    last_body = last.json()
    assert [row["final_score"] for row in last_body["items"]] == [10]
    assert last_body["total"] == 5
    assert last_body["has_more"] is False
    assert last_body["stats"]["count"] == 5

    beyond = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history?limit=2&offset=99",
        headers=_pro_headers(user),
    )
    assert beyond.status_code == 200
    beyond_body = beyond.json()
    assert beyond_body["items"] == []
    assert beyond_body["total"] == 5
    assert beyond_body["has_more"] is False


@pytest.mark.asyncio
async def test_history_rejects_negative_offset(app_client, make_user, db_session):
    user = _make_pro(make_user)
    item = _seed_watch(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history?offset=-1",
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_history_cursor_pages_strictly_older_runs_across_concurrent_inserts(
    app_client, make_user, db_session
):
    """A cursor page must not repeat or skip rows when a newer run lands
    between page loads, and must stay deterministic when runs share a
    created_at timestamp (task_id tiebreaker)."""
    user = _make_pro(make_user)
    item = _seed_watch(db_session, user_id=user.id)
    for days_ago, score in ((4, 10), (3, 20), (2, 30), (0, 55), (0, 60)):
        _seed_run(
            db_session,
            user_id=user.id,
            watchlist_item_id=item.id,
            score=score,
            days_ago=days_ago,
        )
    db_session.commit()

    first = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history?limit=2",
        headers=_pro_headers(user),
    )
    assert first.status_code == 200
    first_rows = first.json()["items"]
    # Newest first; equal timestamps are tie-broken by task_id descending.
    assert [row["final_score"] for row in first_rows] == [60, 55]

    # A brand-new run lands after the first page was fetched.
    _seed_run(
        db_session,
        user_id=user.id,
        watchlist_item_id=item.id,
        score=70,
        days_ago=0,
    )
    db_session.commit()

    cursor = first_rows[-1]["task_id"]
    next_page = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history?limit=2&before_task_id={cursor}",
        headers=_pro_headers(user),
    )
    assert next_page.status_code == 200
    next_body = next_page.json()
    # Strictly older than the cursor: no duplicate of 60/55, no 70, no gap.
    assert [row["final_score"] for row in next_body["items"]] == [30, 20]
    assert next_body["has_more"] is True
    assert next_body["total"] == 6

    last_page = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history?limit=2&before_task_id={next_body['items'][-1]['task_id']}",
        headers=_pro_headers(user),
    )
    assert last_page.status_code == 200
    last_body = last_page.json()
    assert [row["final_score"] for row in last_body["items"]] == [10]
    assert last_body["has_more"] is False


@pytest.mark.asyncio
async def test_history_cursor_falls_back_to_offset_when_row_missing(
    app_client, make_user, db_session
):
    """A stale or foreign cursor must not dead-end the client; the route falls
    back to offset paging and still returns the expected slice."""
    user = _make_pro(make_user)
    item = _seed_watch(db_session, user_id=user.id)
    for days_ago, score in ((4, 10), (3, 20), (2, 30), (1, 40), (0, 50)):
        _seed_run(
            db_session,
            user_id=user.id,
            watchlist_item_id=item.id,
            score=score,
            days_ago=days_ago,
        )

    other_user = make_user(email="wh-pro-2@test.com", tier=UserTier.PRO)
    other_item = _seed_watch(db_session, user_id=other_user.id)
    foreign_run = _seed_run(
        db_session,
        user_id=other_user.id,
        watchlist_item_id=other_item.id,
        score=99,
        days_ago=0,
    )
    db_session.commit()

    # Foreign cursor is ignored (not treated as this item's anchor).
    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history?limit=2&offset=0&before_task_id={foreign_run.task_id}",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert [row["final_score"] for row in body["items"]] == [50, 40]
    assert body["has_more"] is True

    # Unknown cursor falls back to offset paging.
    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history?limit=2&offset=2&before_task_id=missing-cursor",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert [row["final_score"] for row in body["items"]] == [30, 20]
    assert body["has_more"] is True
    assert body["total"] == 5
