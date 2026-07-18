"""Agent feedback daily summary endpoint and aggregator contract."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from arena.core.agent_metrics import compute_user_feedback_summary
from arena.core.auth import create_access_token
from arena.db_models import AgentTask, AnswerFeedback, UserTier


def _make_feedback(*, user_id, suffix, verdict, days_ago=0):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return AnswerFeedback(
        user_id=user_id,
        task_id=f"task-fb-{suffix}",
        verdict=verdict,
        note=f"note-{suffix}",
        created_at=now - timedelta(days=days_ago),
    )


def test_feedback_summary_zero_state_for_new_user(db_session, make_user):
    user = make_user(email="fb-sum-zero@test.com", tier=UserTier.PRO)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    payload = compute_user_feedback_summary(db=db_session, user=user)
    assert payload["total"] == 0
    assert payload["verdicts"] == {"correct": 0, "partial": 0, "wrong": 0}
    assert payload["rate"] == 0
    assert payload["window_days"] == 30
    assert len(payload["daily_trend"]) == 30
    assert sum(entry["count"] for entry in payload["daily_trend"]) == 0


def test_feedback_summary_tallies_verdicts(db_session, make_user):
    user = make_user(email="fb-sum-tally@test.com", tier=UserTier.PRO)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    for verdict, count in [("correct", 3), ("partial", 2), ("wrong", 1)]:
        for i in range(count):
            db_session.add(
                _make_feedback(
                    user_id=user.id,
                    suffix=f"{verdict}-{i}",
                    verdict=verdict,
                    days_ago=i,
                )
            )
    db_session.commit()

    payload = compute_user_feedback_summary(db=db_session, user=user)
    assert payload["total"] == 6
    assert payload["verdicts"] == {"correct": 3, "partial": 2, "wrong": 1}
    assert payload["rate"] == 1.0


def test_feedback_summary_daily_trend_pads_to_window(db_session, make_user):
    user = make_user(email="fb-sum-trend@test.com", tier=UserTier.PRO)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    db_session.add(_make_feedback(user_id=user.id, suffix="today", verdict="correct", days_ago=0))
    db_session.add(_make_feedback(user_id=user.id, suffix="yesterday", verdict="wrong", days_ago=1))
    db_session.commit()

    payload = compute_user_feedback_summary(
        db=db_session, user=user, window_days=7
    )
    assert len(payload["daily_trend"]) == 7
    days = [entry["date"] for entry in payload["daily_trend"]]
    assert days == sorted(days)
    counts = [entry["count"] for entry in payload["daily_trend"]]
    assert sum(counts) == 2


def test_feedback_summary_ignores_other_users_data(db_session, make_user):
    a = make_user(email="fb-sum-scope-a@test.com", tier=UserTier.PRO)
    b = make_user(email="fb-sum-scope-b@test.com", tier=UserTier.PRO)
    db_session.add_all([a, b])
    db_session.commit()
    db_session.refresh(a)
    db_session.refresh(b)

    for i in range(4):
        db_session.add(_make_feedback(user_id=a.id, suffix=f"a-{i}", verdict="correct"))
    for i in range(2):
        db_session.add(_make_feedback(user_id=b.id, suffix=f"b-{i}", verdict="wrong"))
    db_session.commit()

    payload = compute_user_feedback_summary(db=db_session, user=a)
    assert payload["total"] == 4
    assert payload["verdicts"] == {"correct": 4, "partial": 0, "wrong": 0}


@pytest.mark.asyncio
async def test_feedback_summary_endpoint_returns_payload(app_client, make_user, db_session):
    user = make_user(email="fb-sum-endpoint@test.com", tier=UserTier.PRO)
    for i in range(3):
        db_session.add(
            _make_feedback(user_id=user.id, suffix=f"e-{i}", verdict="correct")
        )
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/agent/feedback/summary", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3
    assert body["verdicts"]["correct"] == 3
    assert body["window_days"] == 30
    assert len(body["daily_trend"]) == 30


@pytest.mark.asyncio
async def test_feedback_summary_endpoint_requires_auth(app_client):
    res = await app_client.get("/api/agent/feedback/summary")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_feedback_summary_endpoint_window_is_clamped(app_client, make_user):
    user = make_user(email="fb-sum-cap@test.com", tier=UserTier.PRO)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/feedback/summary?window_days=365", headers=headers
    )
    assert res.status_code == 422  # capped at 90
    res = await app_client.get(
        "/api/agent/feedback/summary?window_days=14", headers=headers
    )
    assert res.status_code == 200
    assert len(res.json()["daily_trend"]) == 14