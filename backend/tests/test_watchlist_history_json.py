import pytest
from datetime import timedelta
from arena.core.datetime_utils import utcnow_naive
from arena.core.auth import create_access_token
from arena.db_models import AgentTask, UserTier, WatchlistItem


def _make_pro(make_user):
    return make_user(email="pro_json@example.com", tier=UserTier.PRO)


def _auth_headers(user):
    token = create_access_token(user.id, user.email)
    return {"Authorization": f"Bearer {token}"}


def _seed_watch(db_session, user_id):
    item = WatchlistItem(
        user_id=user_id,
        question="Is Bitcoin trending up?",
        interval_hours=24,
        expertise_level="curious",
        expertise_domain="",
        is_active=True,
        next_run_at=utcnow_naive() + timedelta(hours=24),
    )
    db_session.add(item)
    db_session.flush()
    return item


def _seed_task(db_session, user_id, watch_item_id, score=85, answer="Bitcoin remains bullish"):
    task = AgentTask(
        user_id=user_id,
        task_id=f"t-{watch_item_id[:8]}-{score}",
        task_text="Is Bitcoin trending up?",
        intelligence_score=score,
        final_answer=answer,
        final_score=score,
        final_confidence=0.8,
        watchlist_item_id=watch_item_id,
        created_at=utcnow_naive(),
    )
    db_session.add(task)
    db_session.flush()
    return task


@pytest.mark.asyncio
async def test_watchlist_history_json_success(app_client, make_user, db_session):
    user = _make_pro(make_user)
    item = _seed_watch(db_session, user.id)
    _seed_task(db_session, user.id, item.id, score=90, answer="Line 1\nLine 2")
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history/export.json",
        headers=_auth_headers(user),
    )
    assert res.status_code == 200
    assert "application/json" in res.headers["content-type"]
    payload = res.json()
    assert payload["success"] is True
    assert payload["question"] == "Is Bitcoin trending up?"
    assert payload["item_id"] == item.id
    assert payload["exported_at"]
    assert len(payload["items"]) == 1
    assert payload["items"][0]["task_id"] == f"t-{item.id[:8]}-90"
    assert payload["items"][0]["final_score"] == 90
    assert payload["items"][0]["final_confidence"] == 0.8
    assert payload["items"][0]["final_answer"] == "Line 1\nLine 2"
    assert payload["stats"] == {
        "count": 1,
        "scored_count": 1,
        "avg_score": 90.0,
        "min_score": 90,
        "max_score": 90,
    }
    assert "content-disposition" in res.headers
    assert ".json" in res.headers["content-disposition"]


@pytest.mark.asyncio
async def test_watchlist_history_json_empty(app_client, make_user, db_session):
    user = _make_pro(make_user)
    item = _seed_watch(db_session, user.id)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history/export.json",
        headers=_auth_headers(user),
    )
    assert res.status_code == 200
    payload = res.json()
    assert payload["items"] == []
    assert payload["stats"]["count"] == 0
    assert payload["stats"]["scored_count"] == 0
    assert payload["stats"]["avg_score"] is None


@pytest.mark.asyncio
async def test_watchlist_history_json_404_for_other_user(app_client, make_user, db_session):
    user1 = _make_pro(make_user)
    user2 = make_user(email="other_json@example.com", tier=UserTier.PRO)
    item = _seed_watch(db_session, user1.id)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history/export.json",
        headers=_auth_headers(user2),
    )
    assert res.status_code == 404
