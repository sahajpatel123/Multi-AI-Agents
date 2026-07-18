"""Integration tests for Watchlist CRUD routes (POST/PATCH/DELETE)."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

from datetime import datetime, timezone

import pytest

from arena.db_models import UserTier, WatchlistItem



@pytest.mark.asyncio
async def test_create_watchlist_returns_full_api_dict(
    app_client, make_user, db_session
):
    user = make_user(email="wl-create@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/agent/watchlist",
        headers=_pro_headers(user),
        json={
            "question": "Quantum computing trends this week?",
            "interval_hours": 24,
            "expertise_level": "curious",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "id" in body
    assert body["question"] == "Quantum computing trends this week?"
    assert body["interval_hours"] == 24
    assert body["expertise_level"] == "curious"
    assert body["is_active"] is True
    assert body["run_count"] == 0
    assert body["next_run_at"]


@pytest.mark.asyncio
async def test_create_rejects_invalid_interval(app_client, make_user):
    user = make_user(email="wl-bad-int@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/agent/watchlist",
        headers=_pro_headers(user),
        json={"question": "Why?", "interval_hours": 12},
    )
    assert res.status_code == 400
    assert "interval_hours" in res.text


@pytest.mark.asyncio
async def test_create_enforces_max_active(app_client, make_user, db_session):
    """The cap is 10 active watches per user."""
    user = make_user(email="wl-cap@test.com", tier=UserTier.PRO)
    now = utcnow_naive()
    for i in range(10):
        db_session.add(
            WatchlistItem(
                user_id=user.id,
                question=f"Question {i}",
                interval_hours=24,
                expertise_level="curious",
                expertise_domain="",
                is_active=True,
                next_run_at=now,
                run_count=0,
            )
        )
    db_session.commit()

    res = await app_client.post(
        "/api/agent/watchlist",
        headers=_pro_headers(user),
        json={"question": "One more?", "interval_hours": 24},
    )
    assert res.status_code == 400
    assert "limit" in res.text.lower()


@pytest.mark.asyncio
async def test_create_403_for_free_tier(app_client, make_user):
    user = make_user(email="wl-free@test.com", tier=UserTier.FREE)
    res = await app_client.post(
        "/api/agent/watchlist",
        headers=_pro_headers(user),
        json={"question": "Why?", "interval_hours": 24},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_create_requires_auth(app_client):
    res = await app_client.post(
        "/api/agent/watchlist",
        json={"question": "Why?", "interval_hours": 24},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_patch_updates_interval(app_client, make_user, db_session):
    user = make_user(email="wl-patch-int@test.com", tier=UserTier.PRO)
    item = WatchlistItem(
        user_id=user.id,
        question="Quantum?",
        interval_hours=24,
        expertise_level="curious",
        expertise_domain="",
        is_active=True,
        next_run_at=utcnow_naive(),
        run_count=0,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    res = await app_client.patch(
        f"/api/agent/watchlist/{item.id}",
        headers=_pro_headers(user),
        json={"interval_hours": 72},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["interval_hours"] == 72


@pytest.mark.asyncio
async def test_patch_pauses_and_resumes(app_client, make_user, db_session):
    """Toggling is_active drives the pause switch in the UI."""
    user = make_user(email="wl-pause@test.com", tier=UserTier.PRO)
    now = utcnow_naive()
    item = WatchlistItem(
        user_id=user.id,
        question="Pause test",
        interval_hours=24,
        expertise_level="curious",
        expertise_domain="",
        is_active=True,
        next_run_at=now,
        run_count=0,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    pause = await app_client.patch(
        f"/api/agent/watchlist/{item.id}",
        headers=_pro_headers(user),
        json={"is_active": False},
    )
    assert pause.status_code == 200
    assert pause.json()["is_active"] is False

    resume = await app_client.patch(
        f"/api/agent/watchlist/{item.id}",
        headers=_pro_headers(user),
        json={"is_active": True},
    )
    assert resume.status_code == 200
    assert resume.json()["is_active"] is True


@pytest.mark.asyncio
async def test_patch_rejects_invalid_interval(app_client, make_user, db_session):
    user = make_user(email="wl-patch-bad@test.com", tier=UserTier.PRO)
    item = WatchlistItem(
        user_id=user.id,
        question="Bad int",
        interval_hours=24,
        expertise_level="curious",
        expertise_domain="",
        is_active=True,
        next_run_at=utcnow_naive(),
        run_count=0,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    res = await app_client.patch(
        f"/api/agent/watchlist/{item.id}",
        headers=_pro_headers(user),
        json={"interval_hours": 12},
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_patch_404_for_other_users_watch(app_client, make_user, db_session):
    alice = make_user(email="wl-patch-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="wl-patch-bob@test.com", tier=UserTier.PRO)
    bob_item = WatchlistItem(
        user_id=bob.id,
        question="Bob's question",
        interval_hours=24,
        expertise_level="curious",
        expertise_domain="",
        is_active=True,
        next_run_at=utcnow_naive(),
        run_count=0,
    )
    db_session.add(bob_item)
    db_session.commit()
    db_session.refresh(bob_item)

    res = await app_client.patch(
        f"/api/agent/watchlist/{bob_item.id}",
        headers=_pro_headers(alice),
        json={"interval_hours": 72},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_removes_item(app_client, make_user, db_session):
    user = make_user(email="wl-del@test.com", tier=UserTier.PRO)
    item = WatchlistItem(
        user_id=user.id,
        question="Delete me",
        interval_hours=24,
        expertise_level="curious",
        expertise_domain="",
        is_active=True,
        next_run_at=utcnow_naive(),
        run_count=0,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    res = await app_client.delete(
        f"/api/agent/watchlist/{item.id}",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.json()["success"] is True
    assert db_session.query(WatchlistItem).filter(WatchlistItem.id == item.id).first() is None


@pytest.mark.asyncio
async def test_delete_404_for_other_users_watch(app_client, make_user, db_session):
    alice = make_user(email="wl-del-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="wl-del-bob@test.com", tier=UserTier.PRO)
    bob_item = WatchlistItem(
        user_id=bob.id,
        question="Bob keeps this",
        interval_hours=24,
        expertise_level="curious",
        expertise_domain="",
        is_active=True,
        next_run_at=utcnow_naive(),
        run_count=0,
    )
    db_session.add(bob_item)
    db_session.commit()
    db_session.refresh(bob_item)

    res = await app_client.delete(
        f"/api/agent/watchlist/{bob_item.id}",
        headers=_pro_headers(alice),
    )
    assert res.status_code == 404
    # Bob's item is still there.
    assert db_session.query(WatchlistItem).filter(WatchlistItem.id == bob_item.id).first() is not None


@pytest.mark.asyncio
async def test_delete_404_for_missing_item(app_client, make_user):
    user = make_user(email="wl-del-missing@test.com", tier=UserTier.PRO)
    res = await app_client.delete(
        "/api/agent/watchlist/does-not-exist",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_403_for_free_tier(app_client, make_user, db_session):
    user = make_user(email="wl-del-free@test.com", tier=UserTier.FREE)
    item = WatchlistItem(
        user_id=user.id,
        question="Free user's watch",
        interval_hours=24,
        expertise_level="curious",
        expertise_domain="",
        is_active=True,
        next_run_at=utcnow_naive(),
        run_count=0,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    res = await app_client.delete(
        f"/api/agent/watchlist/{item.id}",
        headers=_pro_headers(user),
    )
    assert res.status_code == 403
