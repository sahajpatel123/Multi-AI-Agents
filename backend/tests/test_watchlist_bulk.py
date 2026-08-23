"""Integration tests for bulk watchlist pause/resume."""

from __future__ import annotations

from datetime import timedelta

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import UserTier, WatchlistItem


def _add_watch(db_session, user_id, question, *, active, hours=24):
    item = WatchlistItem(
        user_id=user_id,
        question=question,
        interval_hours=hours,
        expertise_level="curious",
        expertise_domain="",
        is_active=active,
        next_run_at=utcnow_naive() - timedelta(hours=1),
        run_count=0,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)
    return item


@pytest.mark.asyncio
async def test_pause_all_pauses_only_own_active_watches(
    app_client, make_user, db_session
):
    user = make_user(email="wl-bulk-pause@test.com", tier=UserTier.PRO)
    other = make_user(email="wl-bulk-pause-other@test.com", tier=UserTier.PRO)
    _add_watch(db_session, user.id, "Mine 1", active=True)
    _add_watch(db_session, user.id, "Mine 2", active=True)
    _add_watch(db_session, user.id, "Mine paused", active=False)
    _add_watch(db_session, other.id, "Theirs", active=True)

    res = await app_client.patch(
        "/api/agent/watchlist/bulk",
        headers=_pro_headers(user),
        json={"action": "pause_all"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["action"] == "pause_all"
    assert body["applied"] == 2
    assert body["active_count"] == 0
    assert body["paused_count"] == 3
    assert db_session.query(WatchlistItem).filter(
        WatchlistItem.user_id == other.id, WatchlistItem.is_active.is_(True)
    ).count() == 1


@pytest.mark.asyncio
async def test_resume_all_respects_active_cap(
    app_client, make_user, db_session
):
    user = make_user(email="wl-bulk-resume@test.com", tier=UserTier.PRO)
    for i in range(12):
        _add_watch(db_session, user.id, f"Paused {i}", active=False, hours=24 if i % 2 == 0 else 72)
    _add_watch(db_session, user.id, "Already active", active=True)

    res = await app_client.patch(
        "/api/agent/watchlist/bulk",
        headers=_pro_headers(user),
        json={"action": "resume_all"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["applied"] == 9
    assert body["skipped"] == 3
    assert body["active_count"] == 10
    assert body["paused_count"] == 3
    assert body["active_cap"] == 10
    resumed = (
        db_session.query(WatchlistItem)
        .filter(WatchlistItem.user_id == user.id, WatchlistItem.is_active.is_(True))
        .all()
    )
    assert len(resumed) == 10
    newly_resumed = [item for item in resumed if item.question.startswith("Paused")]
    assert len(newly_resumed) == 9
    # Resume must reschedule, not merely reactivate: every resumed watch
    # lands at least its full interval (>= 24h here) in the future. The
    # weaker `> utcnow_naive()` form once failed in CI on a sub-second
    # comparison; this version fails only when resume genuinely forgets
    # to push next_run_at forward.
    assert all(
        item.next_run_at >= utcnow_naive() + timedelta(hours=23)
        for item in newly_resumed
    )


@pytest.mark.asyncio
async def test_resume_all_is_noop_when_cap_is_full(app_client, make_user, db_session):
    user = make_user(email="wl-bulk-full@test.com", tier=UserTier.PRO)
    for i in range(10):
        _add_watch(db_session, user.id, f"Active {i}", active=True)
    _add_watch(db_session, user.id, "Paused", active=False)

    res = await app_client.patch(
        "/api/agent/watchlist/bulk",
        headers=_pro_headers(user),
        json={"action": "resume_all"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["applied"] == 0
    assert body["skipped"] == 1
    assert body["active_count"] == 10


@pytest.mark.asyncio
async def test_bulk_requires_plus_tier(app_client, make_user):
    user = make_user(email="wl-bulk-free@test.com", tier=UserTier.FREE)
    res = await app_client.patch(
        "/api/agent/watchlist/bulk",
        headers=_pro_headers(user),
        json={"action": "pause_all"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_bulk_requires_auth(app_client):
    res = await app_client.patch(
        "/api/agent/watchlist/bulk",
        json={"action": "pause_all"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_bulk_rejects_unknown_action(app_client, make_user):
    user = make_user(email="wl-bulk-bad@test.com", tier=UserTier.PRO)
    res = await app_client.patch(
        "/api/agent/watchlist/bulk",
        headers=_pro_headers(user),
        json={"action": "delete_all"},
    )
    assert res.status_code == 422
