"""Bulk watchlist delete: ownership scoping, honest partial reporting, limits."""

from __future__ import annotations

from collections import deque
import time

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import AgentTask, UserTier, WatchlistItem


def _make_item(db_session, user_id: int, question: str, *, active: bool = True) -> WatchlistItem:
    item = WatchlistItem(
        user_id=user_id,
        question=question,
        interval_hours=24,
        expertise_level="curious",
        expertise_domain="",
        is_active=active,
        next_run_at=utcnow_naive(),
        run_count=0,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)
    return item


@pytest.mark.asyncio
async def test_bulk_delete_removes_owned_items_and_reports_counts(
    app_client, make_user, db_session
):
    user = make_user(email="wl-bulk-del@test.com", tier=UserTier.PRO)
    keep = _make_item(db_session, user.id, "Keep me")
    drop_one = _make_item(db_session, user.id, "Drop one")
    drop_two = _make_item(db_session, user.id, "Drop two")

    res = await app_client.request(
        "DELETE",
        "/api/agent/watchlist/bulk",
        headers=_pro_headers(user),
        json={"ids": [drop_one.id, drop_two.id]},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["success"] is True
    assert body["requested"] == 2
    assert body["deleted"] == 2
    assert set(body["deleted_ids"]) == {drop_one.id, drop_two.id}
    assert body["skipped_ids"] == []
    # Counters ride back on the delete response (post-delete, post-commit)
    # so the client never needs a second list round-trip to re-sync.
    assert body["total"] == 1
    assert body["active_count"] == 1

    remaining = {
        row_id
        for (row_id,) in db_session.query(WatchlistItem.id)
        .filter(WatchlistItem.user_id == user.id)
        .all()
    }
    assert remaining == {keep.id}


@pytest.mark.asyncio
async def test_bulk_delete_scopes_to_owner_and_reports_skips(
    app_client, make_user, db_session
):
    alice = make_user(email="wl-bulk-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="wl-bulk-bob@test.com", tier=UserTier.PRO)
    alice_item = _make_item(db_session, alice.id, "Alice keeps this")
    bob_item = _make_item(db_session, bob.id, "Bob keeps this")

    res = await app_client.request(
        "DELETE",
        "/api/agent/watchlist/bulk",
        headers=_pro_headers(alice),
        json={"ids": [alice_item.id, bob_item.id, "does-not-exist"]},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["requested"] == 3
    assert body["deleted"] == 1
    assert body["deleted_ids"] == [alice_item.id]
    assert set(body["skipped_ids"]) == {bob_item.id, "does-not-exist"}
    assert body["total"] == 0
    assert body["active_count"] == 0

    # Foreign and missing rows are untouched.
    assert (
        db_session.query(WatchlistItem).filter(WatchlistItem.id == bob_item.id).first()
        is not None
    )
    assert (
        db_session.query(WatchlistItem).filter(WatchlistItem.id == alice_item.id).first()
        is None
    )


@pytest.mark.asyncio
async def test_bulk_delete_deduplicates_within_request(app_client, make_user, db_session):
    user = make_user(email="wl-bulk-dedupe@test.com", tier=UserTier.PRO)
    item = _make_item(db_session, user.id, "Dedupe me")

    res = await app_client.request(
        "DELETE",
        "/api/agent/watchlist/bulk",
        headers=_pro_headers(user),
        json={"ids": [item.id, item.id]},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    # A double-fired id must not double-count in the response.
    assert body["requested"] == 1
    assert body["deleted"] == 1


@pytest.mark.asyncio
async def test_bulk_delete_rejects_empty_or_blank_ids(app_client, make_user):
    user = make_user(email="wl-bulk-empty@test.com", tier=UserTier.PRO)
    for payload in ({"ids": []}, {"ids": ["   "]}):
        res = await app_client.request(
            "DELETE",
            "/api/agent/watchlist/bulk",
            headers=_pro_headers(user),
            json=payload,
        )
        assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_bulk_delete_rejects_more_than_50_ids(app_client, make_user):
    user = make_user(email="wl-bulk-cap@test.com", tier=UserTier.PRO)
    res = await app_client.request(
        "DELETE",
        "/api/agent/watchlist/bulk",
        headers=_pro_headers(user),
        json={"ids": [f"id-{i}" for i in range(51)]},
    )
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_bulk_delete_requires_auth(app_client):
    res = await app_client.request(
        "DELETE",
        "/api/agent/watchlist/bulk",
        json={"ids": ["any-id"]},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_bulk_delete_403_for_free_tier(app_client, make_user, db_session):
    user = make_user(email="wl-bulk-free@test.com", tier=UserTier.FREE)
    item = _make_item(db_session, user.id, "Free watch")

    res = await app_client.request(
        "DELETE",
        "/api/agent/watchlist/bulk",
        headers=_pro_headers(user),
        json={"ids": [item.id]},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_bulk_delete_rate_limited(app_client, make_user):
    from arena.core import rate_limits as _rl

    user = make_user(email="wl-bulk-rl@test.com", tier=UserTier.PRO)
    if hasattr(_rl.rate_limiter, "_events"):
        _rl.rate_limiter._events.clear()
    _rl.rate_limiter._events[f"user:watchlist_bulk_delete:{user.id}"] = deque(
        [time.time()] * 15
    )
    try:
        res = await app_client.request(
            "DELETE",
            "/api/agent/watchlist/bulk",
            headers=_pro_headers(user),
            json={"ids": ["any-id"]},
        )
        assert res.status_code == 429, res.text
        assert res.json().get("detail", {}).get("error") == "rate_limit_exceeded"
    finally:
        if hasattr(_rl.rate_limiter, "_events"):
            _rl.rate_limiter._events.clear()


@pytest.mark.asyncio
async def test_bulk_delete_preserves_spawned_task_history(
    app_client, make_user, db_session
):
    """Removing a watch must nullify, not delete, its spawned research tasks."""
    user = make_user(email="wl-bulk-task@test.com", tier=UserTier.PRO)
    item = _make_item(db_session, user.id, "Watch with history")
    task = AgentTask(
        user_id=user.id,
        watchlist_item_id=item.id,
        task_id="wl-bulk-task-1",
        task_text=item.question,
        final_answer="Prior research result",
        created_at=utcnow_naive(),
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    res = await app_client.request(
        "DELETE",
        "/api/agent/watchlist/bulk",
        headers=_pro_headers(user),
        json={"ids": [item.id]},
    )
    assert res.status_code == 200, res.text

    # The API flushes through its own request-scoped session; expire the
    # fixture session so the assertion re-reads the nullified FK from the DB
    # instead of the stale in-memory copy created before the delete.
    db_session.expire_all()
    kept = db_session.query(AgentTask).filter(AgentTask.id == task.id).first()
    assert kept is not None
    assert kept.watchlist_item_id is None
