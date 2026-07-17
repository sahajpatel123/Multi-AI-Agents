"""Integration tests for GET /api/agent/history/{task_id}/evolution."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AgentTask, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed(session, *, user_id: int, task_id: str, task_text: str = "Tell me about X."):
    row = AgentTask(
        user_id=user_id,
        task_id=task_id,
        task_text=task_text,
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.asyncio
async def test_evolution_returns_dict_for_owned_task(app_client, make_user, db_session):
    user = make_user(email="evo-ok@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="evo-1")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/history/evo-1/evolution",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert isinstance(res.json(), dict)


@pytest.mark.asyncio
async def test_evolution_404_for_other_users_task(app_client, make_user, db_session):
    alice = make_user(email="evo-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="evo-bob@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=bob.id, task_id="bob-evo")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/history/bob-evo/evolution",
        headers=_pro_headers(alice),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_evolution_404_for_missing_task(app_client, make_user):
    user = make_user(email="evo-missing@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/history/missing/evolution",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_evolution_403_for_free_tier(app_client, make_user, db_session):
    user = make_user(email="evo-free@test.com", tier=UserTier.FREE)
    _seed(db_session, user_id=user.id, task_id="evo-free")
    db_session.commit()

    res = await app_client.get(
        "/api/agent/history/evo-free/evolution",
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_evolution_requires_auth(app_client):
    res = await app_client.get("/api/agent/history/anything/evolution")
    assert res.status_code == 401
