"""Live thread reschedule cadence: per-task override + clamped default."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

from datetime import datetime, timedelta, timezone

import pytest

from arena.core import live_thread_checker
from arena.db_models import AgentTask, User, UserTier


def _task(*, live_reschedule_hours=None) -> AgentTask:
    t = AgentTask()
    t.user_id = 1
    t.task_id = "task-1"
    t.task_text = "Research topic"
    t.final_answer = "old"
    if live_reschedule_hours is not None:
        t.live_reschedule_hours = live_reschedule_hours
    return t


def test_reschedule_hours_default_is_24h():
    assert live_thread_checker._reschedule_hours(_task()) == 24


def test_reschedule_hours_clamps_to_min_one_hour():
    t = _task(live_reschedule_hours=0)
    assert live_thread_checker._reschedule_hours(t) == 1
    t = _task(live_reschedule_hours=-99)
    assert live_thread_checker._reschedule_hours(t) == 1


def test_reschedule_hours_clamps_to_max_one_week():
    t = _task(live_reschedule_hours=24 * 30)
    assert live_thread_checker._reschedule_hours(t) == 24 * 7


@pytest.mark.asyncio
async def test_check_live_task_advances_next_check_by_custom_cadence(
    isolated_db, monkeypatch
):
    """When live_reschedule_hours is set, next_check must advance by that
    many hours, not the hard-coded 24h default."""
    from arena.core import live_thread_checker as ltc

    SessionLocal = isolated_db
    db = SessionLocal()
    try:
        u = User(
            email="cadence@test.com",
            password_hash="x",
            tier=UserTier.PRO,
            name="C",
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        now = utcnow_naive()
        task = AgentTask(
            user_id=u.id,
            task_id="task-cadence-1",
            task_text="Research quarterly AI regulation changes",
            final_answer="prior",
            is_live=True,
            live_reschedule_hours=6,
            live_next_check=now - timedelta(minutes=1),
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        task_id = task.id

        # Force honest rejection path so we don't need a working researcher
        # — we only care that next_check advances by live_reschedule_hours.
        monkeypatch.setattr(
            ltc, "_gate_live_task_text", lambda text: {
                "capability_id": "agent.research",
                "decision": "reject",
                "env": type("E", (), {"value": "web"})(),
                "error_body": {},
            }
        )
    finally:
        db.close()

    db = SessionLocal()
    try:
        row = db.query(AgentTask).filter(AgentTask.id == task_id).first()
        result = await ltc.check_live_task(row, db)
        assert result is False
        # The next-check must be ~6 hours out, not the 24h default.
        now = utcnow_naive()
        delta_hours = (row.live_next_check - now).total_seconds() / 3600
        assert 5.9 < delta_hours < 6.1, f"expected ~6h, got {delta_hours}"
    finally:
        db.close()


def test_reschedule_hours_handles_missing_attribute():
    class _NoAttr:
        pass

    assert live_thread_checker._reschedule_hours(_NoAttr()) == 24