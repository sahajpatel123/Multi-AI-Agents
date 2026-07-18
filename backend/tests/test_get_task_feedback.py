"""Integration tests for GET /api/agent/tasks/{task_id}/feedback."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

from datetime import datetime, timezone

import pytest

from arena.db_models import AgentTask, AnswerFeedback, UserTier



def _seed_task(session, *, user_id: int, task_id: str):
    row = AgentTask(
        user_id=user_id,
        task_id=task_id,
        task_text="Tell me about X.",
    )
    session.add(row)
    session.flush()
    return row


def _seed_feedback(session, *, user_id: int, task_id: str, verdict: str = "accurate", note: str | None = None):
    row = AnswerFeedback(
        user_id=user_id,
        task_id=task_id,
        verdict=verdict,
        note=note,
        created_at=utcnow_naive(),
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.asyncio
async def test_get_feedback_returns_seeded_record(app_client, make_user, db_session):
    user = make_user(email="fb-get@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=user.id, task_id="fb-get-1")
    _seed_feedback(
        db_session,
        user_id=user.id,
        task_id="fb-get-1",
        verdict="partial",
        note="Close but missed the second variable.",
    )
    db_session.commit()

    res = await app_client.get(
        "/api/agent/tasks/fb-get-1/feedback",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body is not None
    assert body.get("verdict") == "partial"
    assert body.get("note") == "Close but missed the second variable."


@pytest.mark.asyncio
async def test_get_feedback_returns_null_when_unrated(app_client, make_user, db_session):
    user = make_user(email="fb-unrated@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=user.id, task_id="fb-unrated")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/tasks/fb-unrated/feedback",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    # Null is a valid response (no rating yet).
    assert res.json() is None


@pytest.mark.asyncio
async def test_get_feedback_404_for_other_users_task(app_client, make_user, db_session):
    alice = make_user(email="fb-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="fb-bob@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=bob.id, task_id="bob-fb")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/tasks/bob-fb/feedback",
        headers=_pro_headers(alice),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_feedback_404_for_missing_task(app_client, make_user):
    user = make_user(email="fb-missing@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/tasks/missing/feedback",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_feedback_403_for_free_tier(app_client, make_user, db_session):
    user = make_user(email="fb-free@test.com", tier=UserTier.FREE)
    _seed_task(db_session, user_id=user.id, task_id="fb-free")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/tasks/fb-free/feedback",
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_get_feedback_requires_auth(app_client, make_user, db_session):
    user = make_user(email="fb-anon@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=user.id, task_id="fb-anon")
    db_session.commit()

    res = await app_client.get("/api/agent/tasks/fb-anon/feedback")
    assert res.status_code == 401
