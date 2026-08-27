"""Bulk Agent history deletion: bounds, ownership, and cleanup."""

from __future__ import annotations

from collections import deque
import time

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import AgentContradiction, AgentTask, UserTier


def _seed_task(db_session, *, user_id: int, task_id: str) -> AgentTask:
    row = AgentTask(
        user_id=user_id,
        task_id=task_id,
        task_text=f"Question for {task_id}",
        created_at=utcnow_naive(),
    )
    db_session.add(row)
    db_session.flush()
    return row


@pytest.mark.asyncio
async def test_bulk_delete_removes_owned_tasks_and_reports_skips(
    app_client, make_user, db_session
):
    alice = make_user(email="agent-bulk-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="agent-bulk-bob@test.com", tier=UserTier.PRO)
    drop_one = _seed_task(db_session, user_id=alice.id, task_id="agent-drop-1")
    drop_two = _seed_task(db_session, user_id=alice.id, task_id="agent-drop-2")
    keep = _seed_task(db_session, user_id=alice.id, task_id="agent-keep")
    foreign = _seed_task(db_session, user_id=bob.id, task_id="agent-foreign")
    drop_one_id = drop_one.task_id
    drop_two_id = drop_two.task_id
    keep_id = keep.task_id
    foreign_id = foreign.task_id
    db_session.add_all(
        [
            AgentContradiction(
                user_id=alice.id,
                new_task_id=drop_one.task_id,
                old_task_id=keep.task_id,
                contradiction_summary="remove new side",
            ),
            AgentContradiction(
                user_id=alice.id,
                new_task_id=keep.task_id,
                old_task_id=drop_two.task_id,
                contradiction_summary="remove old side",
            ),
            AgentContradiction(
                user_id=alice.id,
                new_task_id=keep.task_id,
                old_task_id="unrelated-task",
                contradiction_summary="keep this",
            ),
        ]
    )
    db_session.commit()

    response = await app_client.request(
        "DELETE",
        "/api/agent/tasks/bulk",
        headers=_pro_headers(alice),
        json={
            "ids": [drop_one_id, drop_two_id, drop_one_id, foreign_id, "missing"],
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["success"] is True
    assert body["requested"] == 4
    assert body["deleted"] == 2
    assert set(body["deleted_ids"]) == {drop_one_id, drop_two_id}
    assert set(body["skipped_ids"]) == {foreign_id, "missing"}

    db_session.expire_all()
    assert db_session.query(AgentTask).filter(AgentTask.task_id == drop_one_id).first() is None
    assert db_session.query(AgentTask).filter(AgentTask.task_id == drop_two_id).first() is None
    assert db_session.query(AgentTask).filter(AgentTask.task_id == keep_id).first() is not None
    assert db_session.query(AgentTask).filter(AgentTask.task_id == foreign_id).first() is not None
    contradictions = db_session.query(AgentContradiction).filter(AgentContradiction.user_id == alice.id).all()
    assert len(contradictions) == 1
    assert contradictions[0].contradiction_summary == "keep this"


@pytest.mark.asyncio
async def test_bulk_delete_deduplicates_and_rejects_invalid_lists(app_client, make_user):
    user = make_user(email="agent-bulk-bounds@test.com", tier=UserTier.PRO)

    response = await app_client.request(
        "DELETE",
        "/api/agent/tasks/bulk",
        headers=_pro_headers(user),
        json={"ids": []},
    )
    assert response.status_code == 422

    response = await app_client.request(
        "DELETE",
        "/api/agent/tasks/bulk",
        headers=_pro_headers(user),
        json={"ids": [f"task-{i}" for i in range(51)]},
    )
    assert response.status_code == 422

    response = await app_client.request(
        "DELETE",
        "/api/agent/tasks/bulk",
        headers={"Authorization": "Bearer invalid"},
        json={"ids": ["task-1"]},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_bulk_delete_requires_agent_access(app_client, make_user):
    user = make_user(email="agent-bulk-free@test.com", tier=UserTier.FREE)
    response = await app_client.request(
        "DELETE",
        "/api/agent/tasks/bulk",
        headers=_pro_headers(user),
        json={"ids": ["task-1"]},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_bulk_delete_has_its_own_rate_limit(app_client, make_user):
    user = make_user(email="agent-bulk-rate@test.com", tier=UserTier.PRO)
    from arena.core import rate_limits

    rate_limits.rate_limiter._events[f"user:agent_task_bulk_delete:{user.id}"] = deque(
        [time.time()] * 15
    )
    response = await app_client.request(
        "DELETE",
        "/api/agent/tasks/bulk",
        headers=_pro_headers(user),
        json={"ids": ["task-1"]},
    )
    assert response.status_code == 429, response.text[:300]
    assert response.json().get("detail", {}).get("error") == "rate_limit_exceeded"
