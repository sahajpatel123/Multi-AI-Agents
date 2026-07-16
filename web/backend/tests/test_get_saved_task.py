"""Integration tests for GET /api/agent/saved/{task_id}."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AgentTask, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed(session, *, user_id: int, task_id: str, with_answer: bool = True):
    row = AgentTask(
        user_id=user_id,
        task_id=task_id,
        task_text="Saved task question?",
        final_answer="This is the final answer text." if with_answer else None,
        final_score=85 if with_answer else None,
        final_confidence=78 if with_answer else None,
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.asyncio
async def test_get_saved_returns_full_task_dict(app_client, make_user, db_session):
    user = make_user(email="saved-get@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="saved-1")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/saved/saved-1",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    # core persistence fields
    assert body.get("task_id") == "saved-1"
    assert body.get("task") == "Saved task question?"
    assert body.get("final_answer") == "This is the final answer text."
    assert body.get("final_score") == 85
    assert body.get("final_confidence") == 78


@pytest.mark.asyncio
async def test_get_saved_for_task_without_answer(app_client, make_user, db_session):
    """In-flight tasks (final_answer=null) still load so the user can pick up where they left off."""
    user = make_user(email="saved-mid@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="saved-mid", with_answer=False)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/saved/saved-mid",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("task_id") == "saved-mid"
    assert body.get("final_answer") is None
    assert body.get("final_score") is None


@pytest.mark.asyncio
async def test_get_saved_404_for_other_users_task(app_client, make_user, db_session):
    alice = make_user(email="saved-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="saved-bob@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=bob.id, task_id="bob-saved")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/saved/bob-saved",
        headers=_pro_headers(alice),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_saved_404_for_missing_task(app_client, make_user):
    user = make_user(email="saved-missing@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/saved/missing",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_saved_403_for_free_tier(app_client, make_user, db_session):
    user = make_user(email="saved-free@test.com", tier=UserTier.FREE)
    _seed(db_session, user_id=user.id, task_id="saved-free")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/saved/saved-free",
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_get_saved_requires_auth(app_client, make_user, db_session):
    user = make_user(email="saved-anon@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="saved-anon")
    db_session.commit()

    res = await app_client.get("/api/agent/saved/saved-anon")
    assert res.status_code == 401
