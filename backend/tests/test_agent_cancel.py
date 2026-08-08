"""Tests for cooperative cancellation of in-flight Agent Mode tasks.

Agent runs execute as background pipelines. Before this feature the only
Stop path was client-side: the frontend abandoned its poll loop while the
backend kept running every remaining stage and spending token budget.
``POST /api/agent/tasks/{task_id}/cancel`` flips a flag on the in-memory
blackboard and the pipeline stops at the next stage boundary.
"""

from __future__ import annotations

import asyncio

import pytest

from arena.core.agent_pipeline import run_agent_pipeline_on_blackboard
from arena.core.blackboard import (
    AgentStatus,
    create_blackboard,
    get_blackboard,
    is_task_cancelled,
    note_task_cancelled,
    remove_blackboard,
)
from arena.db_models import Orchestration, UserTier


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


# ─── Orchestration-level cancel ────────────────────────────────────────────


def _seed_orchestration(
    db_session,
    orch_id: str,
    user_id: int,
    task_ids: list[str],
    status: str = "running",
) -> None:
    db_session.add(
        Orchestration(
            id=orch_id,
            user_id=user_id,
            task_ids=task_ids,
            status=status,
        )
    )
    db_session.commit()


@pytest.mark.asyncio
async def test_cancel_orchestration_endpoint_cancels_all_children(
    app_client, make_user, db_session
):
    user = make_user(email="cancel-orch@test.com", tier=UserTier.PRO)
    task_ids = [_seed_active_task(user.id), _seed_active_task(user.id)]
    orch_id = "orch-cancel-all"
    _seed_orchestration(db_session, orch_id, user.id, task_ids)
    try:
        res = await app_client.post(
            f"/api/agent/orchestrate/{orch_id}/cancel",
            headers=_pro_headers(user),
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "cancelled"
        assert set(body["cancelled_task_ids"]) == set(task_ids)

        for tid in task_ids:
            bb = get_blackboard(tid)
            assert bb is not None
            assert bb.cancel_requested is True

        orch = (
            db_session.query(Orchestration)
            .filter(Orchestration.id == orch_id)
            .first()
        )
        assert orch is not None
        assert orch.status == "cancelled"
    finally:
        for tid in task_ids:
            remove_blackboard(tid)


@pytest.mark.asyncio
async def test_cancel_orchestration_endpoint_is_idempotent(
    app_client, make_user, db_session
):
    user = make_user(email="cancel-orch-idem@test.com", tier=UserTier.PRO)
    orch_id = "orch-cancel-idem"
    _seed_orchestration(db_session, orch_id, user.id, [], status="cancelled")

    first = await app_client.post(
        f"/api/agent/orchestrate/{orch_id}/cancel",
        headers=_pro_headers(user),
    )
    second = await app_client.post(
        f"/api/agent/orchestrate/{orch_id}/cancel",
        headers=_pro_headers(user),
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_cancel_orchestration_endpoint_404_for_other_users_run(
    app_client, make_user, db_session
):
    alice = make_user(email="cancel-orch-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="cancel-orch-bob@test.com", tier=UserTier.PRO)
    task_ids = [_seed_active_task(alice.id)]
    orch_id = "orch-cancel-alice"
    _seed_orchestration(db_session, orch_id, alice.id, task_ids)
    try:
        res = await app_client.post(
            f"/api/agent/orchestrate/{orch_id}/cancel",
            headers=_pro_headers(bob),
        )
        assert res.status_code == 404
        bb = get_blackboard(task_ids[0])
        assert bb is not None
        # Bob's cancel attempt must never interrupt Alice's run.
        assert bb.cancel_requested is False
    finally:
        remove_blackboard(task_ids[0])


@pytest.mark.asyncio
async def test_cancel_orchestration_endpoint_403_for_free_tier(app_client, make_user):
    user = make_user(email="cancel-orch-free@test.com", tier=UserTier.FREE)
    res = await app_client.post(
        "/api/agent/orchestrate/anything/cancel",
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_cancel_orchestration_endpoint_requires_auth(app_client):
    res = await app_client.post("/api/agent/orchestrate/anything/cancel")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_orchestration_status_reports_cancelled_child(
    app_client, make_user, db_session
):
    user = make_user(email="cancel-orch-status@test.com", tier=UserTier.PRO)
    task_id = _seed_active_task(user.id)
    orch_id = "orch-cancel-status"
    _seed_orchestration(db_session, orch_id, user.id, [task_id])
    try:
        # Child finished as cancelled and its blackboard was dropped; the
        # terminal registry is the only remaining record.
        remove_blackboard(task_id)
        note_task_cancelled(task_id)

        res = await app_client.get(
            f"/api/agent/orchestrate/{orch_id}",
            headers=_pro_headers(user),
        )
        assert res.status_code == 200
        child = res.json()["child_tasks"][0]
        assert child["task_id"] == task_id
        assert child["status"] == "cancelled"
        assert child["current_stage"] == "done"
    finally:
        remove_blackboard(task_id)


@pytest.mark.asyncio
async def test_orchestration_watcher_stops_run_after_cancelled_child(
    monkeypatch, db_session, isolated_db
):
    """A cancelled child stops the whole run instead of burning siblings."""
    user_id = 987654
    task_ids = [_seed_active_task(user_id), _seed_active_task(user_id)]
    orch_id = "orch-watcher-cancel"
    _seed_orchestration(db_session, orch_id, user_id, task_ids)
    # Child 0 stopped as cancelled and its blackboard was dropped; child 1
    # is still warm and must be asked to stop too.
    remove_blackboard(task_ids[0])
    note_task_cancelled(task_ids[0])

    from arena.routes.agent import run_orchestration_watcher

    async def _no_sleep(_seconds):
        return None

    monkeypatch.setattr(asyncio, "sleep", _no_sleep)
    # routes.agent captures SessionLocal at import time, so the isolated DB
    # must be patched on that module rather than arena.database.
    monkeypatch.setattr("arena.routes.agent.SessionLocal", isolated_db)
    try:
        await run_orchestration_watcher(orch_id, user_id, task_ids)
        orch = (
            db_session.query(Orchestration)
            .filter(Orchestration.id == orch_id)
            .first()
        )
        assert orch is not None
        assert orch.status == "cancelled"
        bb1 = get_blackboard(task_ids[1])
        assert bb1 is not None
        assert bb1.cancel_requested is True
    finally:
        for tid in task_ids:
            remove_blackboard(tid)


@pytest.mark.asyncio
async def test_background_runner_records_cancelled_task(monkeypatch, isolated_db):
    """Cancelled pipelines leave a terminal marker after blackboard removal."""
    from arena.routes.agent import run_agent_pipeline_background

    bb = create_blackboard(user_id=1, task="cancel background")

    async def _fake_pipeline(
        bb,
        memory_context=None,
        expertise_level=None,
        expertise_domain=None,
    ):
        bb.status = AgentStatus.CANCELLED
        bb.error = "Task cancelled by user"
        return bb

    monkeypatch.setattr(
        "arena.routes.agent.run_agent_pipeline_on_blackboard",
        _fake_pipeline,
    )
    try:
        await run_agent_pipeline_background(bb.task_id, 1, bb.task)
        assert get_blackboard(bb.task_id) is None
        assert is_task_cancelled(bb.task_id) is True
    finally:
        remove_blackboard(bb.task_id)


@pytest.mark.asyncio
async def test_refinement_runner_records_cancelled_task(monkeypatch, isolated_db):
    from arena.routes.agent import run_refinement_background

    bb = create_blackboard(user_id=1, task="cancel refinement")

    async def _fake_refinement(
        existing_bb,
        user_message,
        user_id,
    ):
        existing_bb.status = AgentStatus.CANCELLED
        existing_bb.error = "Task cancelled by user"
        return existing_bb

    monkeypatch.setattr(
        "arena.routes.agent.run_refinement_pipeline",
        _fake_refinement,
    )
    try:
        await run_refinement_background(bb.task_id, "stop", 1)
        assert get_blackboard(bb.task_id) is None
        assert is_task_cancelled(bb.task_id) is True
    finally:
        remove_blackboard(bb.task_id)


def test_cancel_registry_entries_expire(monkeypatch):
    from arena.core import blackboard

    now = [1000.0]
    monkeypatch.setattr(blackboard.time, "monotonic", lambda: now[0])
    blackboard.note_task_cancelled("expiring-cancel-marker")
    try:
        assert blackboard.is_task_cancelled("expiring-cancel-marker") is True
        now[0] += blackboard._CANCELLED_TASK_TTL_S + 1
        assert blackboard.is_task_cancelled("expiring-cancel-marker") is False
    finally:
        blackboard._cancelled_tasks.pop("expiring-cancel-marker", None)
