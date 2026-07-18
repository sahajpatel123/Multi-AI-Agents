"""Recent answer-feedback endpoint contract."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

import json
from datetime import datetime, timedelta, timezone

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AgentTask, AnswerFeedback, UserTier


def _task(*, suffix, user_id, verdict="correct"):
    now = utcnow_naive()
    task = AgentTask(
        user_id=user_id,
        task_id=f"task-fb-{suffix}",
        task_text=f"Research topic {suffix}",
        final_answer="ok",
    )
    feedback = AnswerFeedback(
        user_id=user_id,
        task_id=task.task_id,
        verdict=verdict,
        note=f"Note for {suffix}",
        created_at=now - timedelta(minutes=int(suffix)),
    )
    return task, feedback


@pytest.mark.asyncio
async def test_recent_feedback_returns_newest_first(app_client, db_session, make_user):
    user = make_user(email="recent-fb@test.com", tier=UserTier.PRO)
    task1, fb1 = _task(suffix=1, user_id=user.id, verdict="correct")
    task2, fb2 = _task(suffix=2, user_id=user.id, verdict="partial")
    task3, fb3 = _task(suffix=3, user_id=user.id, verdict="wrong")
    db_session.add_all([task1, task2, task3, fb1, fb2, fb3])
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/agent/feedback/recent", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["count"] == 3
    verdicts = [item["verdict"] for item in body["items"]]
    # suffix=1 means 1 minute ago (oldest), suffix=3 means 3 minutes ago
    # (newest). Newest first.
    assert verdicts == ["correct", "partial", "wrong"]


@pytest.mark.asyncio
async def test_recent_feedback_verdict_filter(app_client, db_session, make_user):
    user = make_user(email="recent-fb-filter@test.com", tier=UserTier.PRO)
    task1, fb1 = _task(suffix=10, user_id=user.id, verdict="correct")
    task2, fb2 = _task(suffix=11, user_id=user.id, verdict="partial")
    db_session.add_all([task1, task2, fb1, fb2])
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/feedback/recent?verdict=correct", headers=headers
    )
    body = res.json()
    assert all(item["verdict"] == "correct" for item in body["items"])
    assert len(body["items"]) == 1


@pytest.mark.asyncio
async def test_recent_feedback_unknown_verdict_returns_empty(
    app_client, db_session, make_user
):
    user = make_user(email="recent-fb-unknown@test.com", tier=UserTier.PRO)
    task1, fb1 = _task(suffix=20, user_id=user.id, verdict="correct")
    db_session.add_all([task1, fb1])
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/feedback/recent?verdict=banana", headers=headers
    )
    body = res.json()
    assert body["items"] == []


@pytest.mark.asyncio
async def test_recent_feedback_limit_caps_at_200(app_client, db_session, make_user):
    """The contract caps the per-call result at 200 even when the
    caller asks for more — protects the server from a UI that scrolls
    forever."""
    user = make_user(email="recent-fb-cap@test.com", tier=UserTier.PRO)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/feedback/recent?limit=200", headers=headers
    )
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True


@pytest.mark.asyncio
async def test_recent_feedback_orphan_row_is_returned_without_title(
    app_client, db_session, make_user
):
    """A feedback row whose AgentTask was deleted (cascaded) should
    still appear in the result with title=None so the UI can render a
    tombstone rather than 500 on the join."""
    user = make_user(email="recent-fb-orphan@test.com", tier=UserTier.PRO)
    # Insert only the feedback — the matching task was deleted before
    # the user submitted feedback (race or admin cleanup).
    now = utcnow_naive()
    orphan = AnswerFeedback(
        user_id=user.id,
        task_id="task-fb-orphan",
        verdict="correct",
        note="orphan row",
        created_at=now,
    )
    db_session.add(orphan)
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/agent/feedback/recent", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["task_id"] == "task-fb-orphan"
    assert item["title"] is None
    assert item["task_text"] is None
    assert item["note"] == "orphan row"


@pytest.mark.asyncio
async def test_recent_feedback_requires_auth(app_client):
    res = await app_client.get("/api/agent/feedback/recent")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_recent_feedback_limit_rejects_above_ceiling(app_client, make_user):
    user = make_user(email="recent-fb-ceil@test.com", tier=UserTier.PRO)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/agent/feedback/recent?limit=500", headers=headers)
    assert res.status_code == 422  # capped at 200


@pytest.mark.asyncio
async def test_recent_feedback_is_scoped_to_caller(app_client, db_session, make_user):
    a = make_user(email="fb-scope-a@test.com", tier=UserTier.PRO)
    b = make_user(email="fb-scope-b@test.com", tier=UserTier.PRO)
    task_a, fb_a = _task(suffix=40, user_id=a.id, verdict="correct")
    task_b, fb_b = _task(suffix=41, user_id=b.id, verdict="correct")
    db_session.add_all([task_a, task_b, fb_a, fb_b])
    db_session.commit()

    headers_a = {"Authorization": f"Bearer {create_access_token(a.id, a.email)}"}
    body = (await app_client.get("/api/agent/feedback/recent", headers=headers_a)).json()
    ids = [item["task_id"] for item in body["items"]]
    assert ids == ["task-fb-40"]