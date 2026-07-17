"""Integration tests for GET /api/agent/result/{task_id}."""

from __future__ import annotations

import json

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AgentTask, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed(session, *, user_id: int, task_id: str, with_answer: bool = True):
    row = AgentTask(
        user_id=user_id,
        task_id=task_id,
        task_text="Result question.",
        final_answer="The answer is X." if with_answer else None,
        final_score=85 if with_answer else None,
        final_confidence=72 if with_answer else None,
        sources_used=json.dumps(["source-a", "source-b"]) if with_answer else None,
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.asyncio
async def test_result_returns_dict_for_persisted_task(app_client, make_user, db_session):
    user = make_user(email="result-ok@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="result-1")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/result/result-1",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("task_id") == "result-1"
    assert body.get("final_answer") == "The answer is X."


@pytest.mark.asyncio
async def test_result_404_for_other_users_task(app_client, make_user, db_session):
    alice = make_user(email="result-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="result-bob@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=bob.id, task_id="bob-result")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/result/bob-result",
        headers=_pro_headers(alice),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_result_404_for_missing_task(app_client, make_user):
    user = make_user(email="result-missing@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/result/missing",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_result_403_for_free_tier(app_client, make_user, db_session):
    user = make_user(email="result-free@test.com", tier=UserTier.FREE)
    _seed(db_session, user_id=user.id, task_id="result-free")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/result/result-free",
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_result_requires_auth(app_client, make_user, db_session):
    user = make_user(email="result-anon@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="result-anon")
    db_session.commit()

    res = await app_client.get("/api/agent/result/result-anon")
    assert res.status_code == 401
