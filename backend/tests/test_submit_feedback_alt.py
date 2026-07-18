"""Integration tests for POST /api/agent/feedback (the global feedback submit).

This is the global feedback route (writes AgentTask.user_feedback on
the task row), different from POST /api/agent/tasks/{task_id}/feedback
(writes to the AnswerFeedback table). Both are tested separately
for clarity.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from arena.db_models import AgentTask, UserTier



def _seed_task(session, *, user_id: int, task_id: str = "fb-global"):
    row = AgentTask(
        user_id=user_id,
        task_id=task_id,
        task_text="Global feedback question.",
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.asyncio
async def test_submit_feedback_rejects_invalid_verdict(app_client, make_user, db_session):
    user = make_user(email="fbg-bad@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.post(
        "/api/agent/feedback",
        headers=_pro_headers(user),
        json={"task_id": "fb-global", "feedback": "correct"},  # wrong set
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_submit_feedback_404_for_missing_task(app_client, make_user):
    user = make_user(email="fbg-missing@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/agent/feedback",
        headers=_pro_headers(user),
        json={"task_id": "missing", "feedback": "accurate"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_submit_feedback_403_for_free_tier(app_client, make_user, db_session):
    user = make_user(email="fbg-free@test.com", tier=UserTier.FREE)
    _seed_task(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.post(
        "/api/agent/feedback",
        headers=_pro_headers(user),
        json={"task_id": "fb-global", "feedback": "accurate"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_submit_feedback_requires_auth(app_client, make_user, db_session):
    user = make_user(email="fbg-anon@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.post(
        "/api/agent/feedback",
        json={"task_id": "fb-global", "feedback": "accurate"},
    )
    assert res.status_code == 401
