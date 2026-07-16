"""Integration tests for PATCH /api/agent/tasks/{task_id}/rename."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AgentTask, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed(session, *, user_id: int, task_id: str, title: str | None = None):
    row = AgentTask(
        user_id=user_id,
        task_id=task_id,
        task_text="What is X?",
        title=title,
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.asyncio
async def test_rename_sets_title(app_client, make_user, db_session):
    user = make_user(email="rename-set@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="rename-1")
    db_session.commit()

    res = await app_client.patch(
        "/api/agent/tasks/rename-1/rename",
        headers=_pro_headers(user),
        json={"title": "My research"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("success") is True
    assert body.get("title") == "My research"

    db_session.expire_all()
    row = (
        db_session.query(AgentTask)
        .filter(AgentTask.task_id == "rename-1", AgentTask.user_id == user.id)
        .first()
    )
    assert row.title == "My research"


@pytest.mark.asyncio
async def test_rename_overwrites_previous_title(app_client, make_user, db_session):
    user = make_user(email="rename-overwrite@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="rename-2", title="Old title")
    db_session.commit()

    res = await app_client.patch(
        "/api/agent/tasks/rename-2/rename",
        headers=_pro_headers(user),
        json={"title": "New title"},
    )
    assert res.status_code == 200
    assert res.json()["title"] == "New title"


@pytest.mark.asyncio
async def test_rename_404_for_other_users_task(app_client, make_user, db_session):
    alice = make_user(email="rename-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="rename-bob@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=bob.id, task_id="bob-rename")
    db_session.commit()

    res = await app_client.patch(
        "/api/agent/tasks/bob-rename/rename",
        headers=_pro_headers(alice),
        json={"title": "Hacked"},
    )
    assert res.status_code == 404
    db_session.expire_all()
    bob_row = db_session.query(AgentTask).filter(AgentTask.task_id == "bob-rename").first()
    assert bob_row.title is None


@pytest.mark.asyncio
async def test_rename_404_for_missing_task(app_client, make_user):
    user = make_user(email="rename-missing@test.com", tier=UserTier.PRO)
    res = await app_client.patch(
        "/api/agent/tasks/missing/rename",
        headers=_pro_headers(user),
        json={"title": "Anything"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_rename_403_for_free_tier(app_client, make_user, db_session):
    user = make_user(email="rename-free@test.com", tier=UserTier.FREE)
    _seed(db_session, user_id=user.id, task_id="rename-free")
    db_session.commit()

    res = await app_client.patch(
        "/api/agent/tasks/rename-free/rename",
        headers=_pro_headers(user),
        json={"title": "Nope"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_rename_requires_auth(app_client, make_user, db_session):
    user = make_user(email="rename-anon@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="rename-anon")
    db_session.commit()

    res = await app_client.patch(
        "/api/agent/tasks/rename-anon/rename",
        json={"title": "Anonymous"},
    )
    assert res.status_code == 401