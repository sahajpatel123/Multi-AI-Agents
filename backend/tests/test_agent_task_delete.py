"""Integration tests for DELETE /api/agent/tasks/{task_id}."""

from __future__ import annotations

import pytest

from arena.db_models import AgentTask, UserTier



def _seed(session, *, user_id: int, task_id: str):
    row = AgentTask(
        user_id=user_id,
        task_id=task_id,
        task_text="Question to delete.",
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.asyncio
async def test_delete_removes_task(app_client, make_user, db_session):
    user = make_user(email="del-ok@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="del-1")
    db_session.commit()

    res = await app_client.delete(
        "/api/agent/tasks/del-1",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.json().get("success") is True

    db_session.expire_all()
    row = (
        db_session.query(AgentTask)
        .filter(AgentTask.task_id == "del-1", AgentTask.user_id == user.id)
        .first()
    )
    assert row is None


@pytest.mark.asyncio
async def test_delete_404_for_other_users_task(app_client, make_user, db_session):
    alice = make_user(email="del-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="del-bob@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=bob.id, task_id="bob-del")
    db_session.commit()

    res = await app_client.delete(
        "/api/agent/tasks/bob-del",
        headers=_pro_headers(alice),
    )
    assert res.status_code == 404
    # Bob's task is untouched.
    db_session.expire_all()
    bob_row = db_session.query(AgentTask).filter(AgentTask.task_id == "bob-del").first()
    assert bob_row is not None


@pytest.mark.asyncio
async def test_delete_404_for_missing_task(app_client, make_user):
    user = make_user(email="del-missing@test.com", tier=UserTier.PRO)
    res = await app_client.delete(
        "/api/agent/tasks/missing",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_403_for_free_tier(app_client, make_user, db_session):
    user = make_user(email="del-free@test.com", tier=UserTier.FREE)
    _seed(db_session, user_id=user.id, task_id="del-free")
    db_session.commit()

    res = await app_client.delete(
        "/api/agent/tasks/del-free",
        headers=_pro_headers(user),
    )
    assert res.status_code == 403
    # Task is still there.
    db_session.expire_all()
    row = db_session.query(AgentTask).filter(AgentTask.task_id == "del-free").first()
    assert row is not None


@pytest.mark.asyncio
async def test_delete_requires_auth(app_client, make_user, db_session):
    user = make_user(email="del-anon@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="del-anon")
    db_session.commit()

    res = await app_client.delete("/api/agent/tasks/del-anon")
    assert res.status_code == 401
