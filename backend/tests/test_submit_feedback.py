"""Integration tests for POST /api/agent/feedback."""

from __future__ import annotations

import pytest

from arena.db_models import AgentTask, UserTier



def _seed_task(session, *, user_id: int, task_id: str = "fb-task"):
    row = AgentTask(
        user_id=user_id,
        task_id=task_id,
        task_text="Tell me about X.",
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.asyncio
async def test_submit_feedback_sets_user_feedback(app_client, make_user, db_session):
    user = make_user(email="fb-submit@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.post(
        "/api/agent/feedback",
        headers=_pro_headers(user),
        json={"task_id": "fb-task", "feedback": "accurate"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("status") == "saved"
    assert body.get("feedback") == "accurate"
    assert body.get("task_id") == "fb-task"

    db_session.expire_all()
    row = (
        db_session.query(AgentTask)
        .filter(AgentTask.task_id == "fb-task", AgentTask.user_id == user.id)
        .first()
    )
    assert row.user_feedback == "accurate"


@pytest.mark.asyncio
async def test_submit_feedback_accepts_partial(app_client, make_user, db_session):
    user = make_user(email="fb-partial@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.post(
        "/api/agent/feedback",
        headers=_pro_headers(user),
        json={"task_id": "fb-task", "feedback": "partial", "note": "Close but off"},
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_submit_feedback_accepts_inaccurate(app_client, make_user, db_session):
    user = make_user(email="fb-inaccurate@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.post(
        "/api/agent/feedback",
        headers=_pro_headers(user),
        json={"task_id": "fb-task", "feedback": "inaccurate", "note": "Hallucinated"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("feedback") == "inaccurate"


@pytest.mark.asyncio
async def test_submit_feedback_rejects_invalid_value(app_client, make_user, db_session):
    user = make_user(email="fb-bad@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.post(
        "/api/agent/feedback",
        headers=_pro_headers(user),
        json={"task_id": "fb-task", "feedback": "correct"},  # not in valid set
    )
    assert res.status_code == 400
    assert "Invalid" in res.text


@pytest.mark.asyncio
async def test_submit_feedback_404_for_other_users_task(app_client, make_user, db_session):
    alice = make_user(email="fb-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="fb-bob@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=bob.id, task_id="bob-fb-task")
    db_session.commit()

    res = await app_client.post(
        "/api/agent/feedback",
        headers=_pro_headers(alice),
        json={"task_id": "bob-fb-task", "feedback": "accurate"},
    )
    assert res.status_code == 404
    # Bob's task is untouched.
    db_session.expire_all()
    bob_row = db_session.query(AgentTask).filter(AgentTask.task_id == "bob-fb-task").first()
    assert bob_row.user_feedback is None


@pytest.mark.asyncio
async def test_submit_feedback_404_for_missing_task(app_client, make_user):
    user = make_user(email="fb-missing@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/agent/feedback",
        headers=_pro_headers(user),
        json={"task_id": "does-not-exist", "feedback": "accurate"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_submit_feedback_403_for_free_tier(app_client, make_user, db_session):
    user = make_user(email="fb-free@test.com", tier=UserTier.FREE)
    _seed_task(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.post(
        "/api/agent/feedback",
        headers=_pro_headers(user),
        json={"task_id": "fb-task", "feedback": "accurate"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_submit_feedback_requires_auth(app_client, make_user, db_session):
    user = make_user(email="fb-anon@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.post(
        "/api/agent/feedback",
        json={"task_id": "fb-task", "feedback": "accurate"},
    )
    assert res.status_code == 401
