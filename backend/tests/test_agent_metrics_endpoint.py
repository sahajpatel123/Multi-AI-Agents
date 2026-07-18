"""Agent Mode metrics endpoint and aggregator."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from arena.core.agent_metrics import compute_user_agent_metrics
from arena.db_models import AgentTask, Orchestration, User, UserTier


def _make_user(email="metrics-bob@test.com", tier=UserTier.PRO):
    u = User(
        email=email,
        password_hash="x",
        tier=tier,
        name="M",
    )
    return u


def _make_task(user_id, *, days_ago=0, topics=None, feedback=None, is_live=False, suffix=""):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return AgentTask(
        user_id=user_id,
        task_id=f"task-{user_id}-{days_ago}-{topics}-{suffix}",
        task_text="Research topic",
        final_answer="answer",
        topics=json.dumps(topics or []),
        user_feedback=feedback,
        is_live=is_live,
        created_at=now - timedelta(days=days_ago),
    )


def _make_orchestration(user_id):
    return Orchestration(
        id="orch-1",
        user_id=user_id,
        task_ids=["t1", "t2"],
    )


def test_aggregator_reports_zero_state_for_new_user(db_session, make_user):
    user = make_user()
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    payload = compute_user_agent_metrics(db=db_session, user=user)
    assert payload["total_tasks"] == 0
    assert payload["live_tasks"] == 0
    assert payload["orchestrations"] == 0
    assert payload["feedback"]["total"] == 0
    assert payload["feedback"]["rate"] == 0
    assert payload["top_topics"] == []
    assert len(payload["daily_trend"]) == 30
    assert sum(entry["count"] for entry in payload["daily_trend"]) == 0


def test_aggregator_tallies_total_live_orchestrations_and_feedback(db_session, make_user):
    user = make_user()
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tasks = [
        _make_task(user.id, days_ago=0, topics=["ai"], feedback="positive", is_live=True),
        _make_task(user.id, days_ago=1, topics=["ai", "ml"], feedback="negative"),
        _make_task(user.id, days_ago=2, topics=["policy"], feedback="positive"),
        _make_task(user.id, days_ago=3, is_live=True),
    ]
    db_session.add_all(tasks)
    db_session.add(_make_orchestration(user.id))
    db_session.commit()

    payload = compute_user_agent_metrics(db=db_session, user=user)
    assert payload["total_tasks"] == 4
    assert payload["live_tasks"] == 2
    assert payload["orchestrations"] == 1
    assert payload["feedback"]["total"] == 3
    assert payload["feedback"]["positive"] == 2
    assert payload["feedback"]["negative"] == 1
    assert payload["feedback"]["rate"] == round(3 / 4, 4)


def test_aggregator_pads_daily_trend_to_window(db_session, make_user):
    user = make_user()
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    db_session.add(_make_task(user.id, days_ago=0, topics=["x"]))
    db_session.commit()

    payload = compute_user_agent_metrics(
        db=db_session, user=user, window_days=30
    )
    days = [entry["date"] for entry in payload["daily_trend"]]
    assert len(days) == 30
    assert days == sorted(days)
    counts = [entry["count"] for entry in payload["daily_trend"]]
    assert sum(counts) == 1


def test_aggregator_skips_other_users_data(db_session, make_user):
    a = _make_user(email="metrics-a@test.com")
    b = _make_user(email="metrics-b@test.com")
    db_session.add_all([a, b])
    db_session.commit()
    db_session.refresh(a)
    db_session.refresh(b)

    for idx in range(3):
        db_session.add(_make_task(a.id, days_ago=0, topics=["only-a"], suffix=idx))
    for idx in range(5):
        db_session.add(_make_task(b.id, days_ago=0, topics=["only-b"], suffix=idx))
    db_session.commit()

    payload = compute_user_agent_metrics(db=db_session, user=a)
    assert payload["total_tasks"] == 3
    assert payload["top_topics"] == [{"topic": "only-a", "count": 3}]


@pytest.mark.asyncio
async def test_metrics_endpoint_requires_auth(app_client):
    res = await app_client.get("/api/agent/metrics")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_metrics_endpoint_returns_user_payload(app_client, make_user):
    user = make_user(email="metrics-endpoint@test.com", tier=UserTier.PRO)

    from arena.core.auth import create_access_token

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/agent/metrics", headers=headers)
    assert res.status_code == 200
    body = res.json()
    for required in (
        "total_tasks",
        "live_tasks",
        "orchestrations",
        "feedback",
        "daily_trend",
        "top_topics",
    ):
        assert required in body, f"missing {required!r} in metrics payload"


@pytest.mark.asyncio
async def test_metrics_endpoint_window_is_clamped(app_client, make_user):
    user = make_user(email="metrics-window@test.com", tier=UserTier.PRO)
    from arena.core.auth import create_access_token

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/metrics?window_days=365", headers=headers
    )
    assert res.status_code == 422  # exceeds the Query ge=1, le=90 cap
    res = await app_client.get(
        "/api/agent/metrics?window_days=7", headers=headers
    )
    assert res.status_code == 200
    assert len(res.json()["daily_trend"]) == 7