import pytest
from datetime import timedelta
from arena.core.datetime_utils import utcnow_naive
from arena.core.auth import create_access_token
from arena.db_models import AgentTask, UserTier, WatchlistItem


def _make_pro(make_user):
    return make_user(email="pro_stats@example.com", tier=UserTier.PRO)


def _pro_headers(user):
    """Build the Authorization header for a pro-tier user."""
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_watch(db_session, user_id, question="Is Bitcoin trending up?", is_active=True):
    item = WatchlistItem(
        user_id=user_id,
        question=question,
        interval_hours=24,
        expertise_level="curious",
        expertise_domain="",
        is_active=is_active,
        next_run_at=utcnow_naive() + timedelta(hours=24),
    )
    db_session.add(item)
    db_session.flush()
    return item


def _seed_task(
    db_session, user_id, watch_item_id, score=85, answer="Bitcoin remains bullish", confidence=0.95
):
    task = AgentTask(
        user_id=user_id,
        task_id=f"t-{watch_item_id[:8]}-{score}",
        task_text="Is Bitcoin trending up?",
        title="Bitcoin Analysis",
        final_score=score,
        final_confidence=confidence,
        final_answer=answer,
        watchlist_item_id=watch_item_id,
        created_at=utcnow_naive(),
    )
    db_session.add(task)
    db_session.flush()
    return task


@pytest.mark.asyncio
async def test_watchlist_statistics_empty(app_client, make_user, db_session):
    """Test statistics when user has no watchlist items."""
    user = _make_pro(make_user)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/watchlist/statistics",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["total_items"] == 0
    assert data["active_items"] == 0
    assert data["total_runs"] == 0
    assert data["scored_runs"] == 0
    assert data["avg_score"] is None
    assert data["per_item_stats"] == {}


@pytest.mark.asyncio
async def test_watchlist_statistics_single_item(app_client, make_user, db_session):
    """Test statistics with one watchlist item and multiple runs."""
    user = _make_pro(make_user)
    db_session.commit()  # Need to commit user first
    item = _seed_watch(db_session, user.id)
    _seed_task(db_session, user.id, item.id, score=90)
    _seed_task(db_session, user.id, item.id, score=85)
    _seed_task(db_session, user.id, item.id, score=88)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/watchlist/statistics",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["total_items"] == 1
    assert data["active_items"] == 1
    assert data["total_runs"] == 3
    assert data["scored_runs"] == 3
    assert data["avg_score"] == 87.7  # (90 + 85 + 88) / 3 = 87.666... -> 87.7
    assert data["min_score"] == 85
    assert data["max_score"] == 90
    # All 3 runs are scored, so success_rate = 100%
    assert data["success_rate"] == 100.0
    assert len(data["per_item_stats"]) == 1
    assert data["per_item_stats"][item.id]["run_count"] == 3
    assert data["per_item_stats"][item.id]["avg_score"] == 87.7


@pytest.mark.asyncio
async def test_watchlist_statistics_multiple_items(app_client, make_user, db_session):
    """Test statistics with multiple watchlist items."""
    user = _make_pro(make_user)
    db_session.commit()  # Need to commit user first
    item1 = _seed_watch(db_session, user.id, question="Bitcoin question")
    item2 = _seed_watch(db_session, user.id, question="Ethereum question")
    item3 = _seed_watch(db_session, user.id, question="Inactive question", is_active=False)
    
    _seed_task(db_session, user.id, item1.id, score=90)
    _seed_task(db_session, user.id, item1.id, score=85)
    _seed_task(db_session, user.id, item2.id, score=75)
    _seed_task(db_session, user.id, item3.id, score=60)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/watchlist/statistics",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["total_items"] == 3
    assert data["active_items"] == 2
    assert data["total_runs"] == 4
    assert data["scored_runs"] == 4
    # (90 + 85 + 75 + 60) / 4 = 77.5
    assert data["avg_score"] == 77.5
    assert data["min_score"] == 60
    assert data["max_score"] == 90
    # All 4 runs are scored, so success_rate = 100%
    assert data["success_rate"] == 100.0
    assert len(data["per_item_stats"]) == 3


@pytest.mark.asyncio
async def test_watchlist_statistics_unscored_tasks(app_client, make_user, db_session):
    """Test statistics with some unscored tasks."""
    user = _make_pro(make_user)
    db_session.commit()  # Need to commit user first
    item = _seed_watch(db_session, user.id)
    _seed_task(db_session, user.id, item.id, score=90)
    _seed_task(db_session, user.id, item.id, score=None)
    _seed_task(db_session, user.id, item.id, score=85)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/watchlist/statistics",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["total_runs"] == 3
    assert data["scored_runs"] == 2
    # Only 2 scored: (90 + 85) / 2 = 87.5
    assert data["avg_score"] == 87.5
    assert data["min_score"] == 85
    assert data["max_score"] == 90


@pytest.mark.asyncio
async def test_watchlist_statistics_403_for_guest(app_client, make_user, db_session):
    """Test that guest users without access get 403."""
    from arena.db_models import UserTier as DBUserTier
    user = make_user(email="guest_stats@example.com", tier=DBUserTier.GUEST)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/watchlist/statistics",
        headers=_pro_headers(user),
    )
    # Guest users should get 403 (Forbidden) or 401 (Unauthorized)
    # The endpoint checks for watchlist access which requires Plus/Pro
    assert res.status_code in [403, 401]
