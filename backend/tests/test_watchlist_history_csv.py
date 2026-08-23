import pytest
from datetime import timedelta
from arena.core.datetime_utils import utcnow_naive
from arena.core.auth import create_access_token
from arena.db_models import AgentTask, UserTier, WatchlistItem

def _make_pro(make_user):
    return make_user(email="pro_csv@example.com", tier=UserTier.PRO)

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
        final_score=score,
        final_answer=answer,
        watchlist_item_id=watch_item_id,
        created_at=utcnow_naive(),
    )
    db_session.add(task)
    db_session.flush()
    return task

@pytest.mark.asyncio
async def test_watchlist_history_csv_success(app_client, make_user, db_session):
    user = _make_pro(make_user)
    item = _seed_watch(db_session, user.id)
    _seed_task(db_session, user.id, item.id, score=90, answer="Line 1\nLine 2")
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history/export.csv",
        headers=_auth_headers(user),
    )
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    text = res.text
    assert "task_id,question,status,created_at,final_score,final_answer_snippet" in text
    assert "Is Bitcoin trending up?" in text
    assert "Line 1 Line 2" in text


@pytest.mark.asyncio
async def test_watchlist_history_csv_exports_final_score_not_intelligence_payload(
    app_client, make_user, db_session
):
    """CSV must carry the numeric final_score shown in the UI, not the
    intelligence_score JSON payload persisted alongside pipeline reports."""
    user = _make_pro(make_user)
    item = _seed_watch(db_session, user.id)
    task = _seed_task(db_session, user.id, item.id, score=88, answer="Still bullish")
    task.intelligence_score = {
        "total_score": 42,
        "breakdown": {"clarity": 40, "insight": 44},
    }
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history/export.csv",
        headers=_auth_headers(user),
    )
    assert res.status_code == 200
    assert "intelligence_score" not in res.text
    assert ",88," in res.text
    # Prove the payload's keys never reach the CSV. A bare "42" scan of the
    # whole document is over-broad: task_id embeds a hex id and created_at is
    # a timestamp, so either can legitimately contain those digits (this
    # flaked in CI when a generated id carried "42").
    assert "total_score" not in res.text
    assert "breakdown" not in res.text

@pytest.mark.asyncio
async def test_watchlist_history_csv_formula_injection_defense(app_client, make_user, db_session):
    user = _make_pro(make_user)
    item = WatchlistItem(
        user_id=user.id,
        question="=cmd|'/c calc'!A1",
        interval_hours=24,
        expertise_level="curious",
        expertise_domain="",
        is_active=True,
        next_run_at=utcnow_naive() + timedelta(hours=24),
    )
    db_session.add(item)
    db_session.flush()
    _seed_task(db_session, user.id, item.id, answer="+300 credits")
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history/export.csv",
        headers=_auth_headers(user),
    )
    assert res.status_code == 200
    assert "'=cmd|'/c calc'!A1" in res.text
    assert "'+300 credits" in res.text

@pytest.mark.asyncio
async def test_watchlist_history_csv_404_for_other_user(app_client, make_user, db_session):
    user1 = _make_pro(make_user)
    user2 = make_user(email="other_csv@example.com", tier=UserTier.PRO)
    item = _seed_watch(db_session, user1.id)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/watchlist/{item.id}/history/export.csv",
        headers=_auth_headers(user2),
    )
    assert res.status_code == 404
