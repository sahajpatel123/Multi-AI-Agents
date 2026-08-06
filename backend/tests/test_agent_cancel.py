"""Tests for cooperative cancellation of in-flight Agent Mode tasks.

Agent runs execute as background pipelines. Before this feature the only
Stop path was client-side: the frontend abandoned its poll loop while the
backend kept running every remaining stage and spending token budget.
``POST /api/agent/tasks/{task_id}/cancel`` flips a flag on the in-memory
blackboard and the pipeline stops at the next stage boundary.
"""

from __future__ import annotations

import pytest

from arena.core.agent_pipeline import run_agent_pipeline_on_blackboard
from arena.core.blackboard import (
    AgentStatus,
    create_blackboard,
    get_blackboard,
    remove_blackboard,
)
from arena.db_models import UserTier


def _seed_active_task(user_id: int) -> str:
    bb = create_blackboard(user_id=user_id, task="cancel me")
    bb.status = AgentStatus.RUNNING
    return bb.task_id


@pytest.mark.asyncio
async def test_cancel_endpoint_marks_active_task(app_client, make_user):
    user = make_user(email="cancel-owner@test.com", tier=UserTier.PRO)
    task_id = _seed_active_task(user.id)
    try:
        res = await app_client.post(
            f"/api/agent/tasks/{task_id}/cancel",
            headers=_pro_headers(user),
        )
        assert res.status_code == 200
        body = res.json()
        assert body["task_id"] == task_id
        assert body["status"] == "cancelling"

        bb = get_blackboard(task_id)
        assert bb is not None
        assert bb.cancel_requested is True
    finally:
        remove_blackboard(task_id)


@pytest.mark.asyncio
async def test_cancel_endpoint_is_idempotent(app_client, make_user):
    user = make_user(email="cancel-idempotent@test.com", tier=UserTier.PRO)
    task_id = _seed_active_task(user.id)
    try:
        first = await app_client.post(
            f"/api/agent/tasks/{task_id}/cancel",
            headers=_pro_headers(user),
        )
        second = await app_client.post(
            f"/api/agent/tasks/{task_id}/cancel",
            headers=_pro_headers(user),
        )
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json()["status"] == "cancelling"
    finally:
        remove_blackboard(task_id)


@pytest.mark.asyncio
async def test_cancel_endpoint_404_for_unknown_task(app_client, make_user):
    user = make_user(email="cancel-missing@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/agent/tasks/never-existed/cancel",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404
    detail = res.json().get("detail", res.json())
    assert detail.get("error") == "not_found"


@pytest.mark.asyncio
async def test_cancel_endpoint_hides_other_users_task(app_client, make_user):
    alice = make_user(email="cancel-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="cancel-bob@test.com", tier=UserTier.PRO)
    task_id = _seed_active_task(alice.id)
    try:
        res = await app_client.post(
            f"/api/agent/tasks/{task_id}/cancel",
            headers=_pro_headers(bob),
        )
        assert res.status_code == 404
        bb = get_blackboard(task_id)
        assert bb is not None
        # Ownership must be checked before the flag is flipped — Bob's
        # cancel attempt must never interrupt Alice's run.
        assert bb.cancel_requested is False
    finally:
        remove_blackboard(task_id)


@pytest.mark.asyncio
async def test_cancel_endpoint_403_for_free_tier(app_client, make_user):
    user = make_user(email="cancel-free@test.com", tier=UserTier.FREE)
    res = await app_client.post(
        "/api/agent/tasks/anything/cancel",
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_cancel_endpoint_requires_auth(app_client):
    res = await app_client.post("/api/agent/tasks/anything/cancel")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_cancel_endpoint_friendly_reply_for_persisted_task(
    app_client, make_user, db_session
):
    from arena.core.datetime_utils import utcnow_naive
    from arena.db_models import AgentTask

    user = make_user(email="cancel-done@test.com", tier=UserTier.PRO)
    row = AgentTask(
        user_id=user.id,
        task_id="already-completed",
        task_text="done",
        final_answer="answer",
        created_at=utcnow_naive(),
    )
    db_session.add(row)
    db_session.commit()

    res = await app_client.post(
        "/api/agent/tasks/already-completed/cancel",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["task_id"] == "already-completed"
    assert body["status"] == "complete"


@pytest.mark.asyncio
async def test_pipeline_stops_before_start_when_cancel_requested():
    bb = create_blackboard(user_id=1, task="cancel before start")
    bb.cancel_requested = True
    try:
        out = await run_agent_pipeline_on_blackboard(bb)
        assert out.status == AgentStatus.CANCELLED
        assert out.error == "Task cancelled by user"
        assert out.completed_at is not None
    finally:
        remove_blackboard(bb.task_id)


@pytest.mark.asyncio
async def test_pipeline_stops_at_next_stage_boundary(monkeypatch):
    """A cancel arriving during a stage stops the remaining stages."""
    bb = create_blackboard(user_id=1, task="cancel mid-run")
    try:
        async def _cancel_after_planner(bb, memory_context=None):
            bb.cancel_requested = True
            return bb

        monkeypatch.setattr(
            "arena.core.agent_pipeline.run_planner",
            _cancel_after_planner,
        )
        out = await run_agent_pipeline_on_blackboard(bb)
        assert out.status == AgentStatus.CANCELLED
        assert out.error == "Task cancelled by user"
    finally:
        remove_blackboard(bb.task_id)
