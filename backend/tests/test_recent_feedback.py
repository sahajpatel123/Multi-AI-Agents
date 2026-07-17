"""Tests for arena.core.feedback_calibrator.get_recent_feedback."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

from arena.core.feedback_calibrator import get_recent_feedback


def _make_session(rows):
    """Stub a SQLAlchemy Session that returns ``rows`` from .query()."""
    session = MagicMock()
    query = MagicMock()
    session.query.return_value = query
    query.outerjoin.return_value = query
    query.filter.return_value = query
    query.order_by.return_value = query
    query.limit.return_value = query
    query.all.return_value = rows
    return session


def _fb(task_id, verdict, note=None, created_at=None):
    return SimpleNamespace(
        task_id=task_id,
        verdict=verdict,
        note=note,
        created_at=created_at or datetime(2026, 7, 16, 12, 0, tzinfo=timezone.utc),
    )


def _task(task_id, title="Some research", task_text="Some prompt text" * 20):
    return SimpleNamespace(
        task_id=task_id,
        title=title,
        task_text=task_text,
    )


def test_returns_empty_list_when_no_feedback():
    session = _make_session([])
    assert get_recent_feedback(user_id=1, db=session, limit=10) == []


def test_joins_task_for_title_and_snippet():
    rows = [
        (_fb("t1", "accurate", note="helpful"), _task("t1", title="Quantum intro")),
    ]
    session = _make_session(rows)
    items = get_recent_feedback(user_id=1, db=session, limit=10)
    assert len(items) == 1
    assert items[0]["task_id"] == "t1"
    assert items[0]["verdict"] == "accurate"
    assert items[0]["note"] == "helpful"
    assert items[0]["title"] == "Quantum intro"
    assert items[0]["task_text"].startswith("Some prompt text")
    assert items[0]["created_at"] == "2026-07-16T12:00:00+00:00"


def test_handles_missing_task_for_outerjoin():
    """Task deleted (cascade) → join returns None; row still surfaces with title=None."""
    rows = [
        (_fb("orphan", "inaccurate"), None),
    ]
    session = _make_session(rows)
    items = get_recent_feedback(user_id=1, db=session, limit=10)
    assert items == [
        {
            "task_id": "orphan",
            "verdict": "inaccurate",
            "note": None,
            "created_at": "2026-07-16T12:00:00+00:00",
            "title": None,
            "task_text": None,
        }
    ]


def test_limit_is_clamped_to_safe_range():
    session = _make_session([])
    get_recent_feedback(user_id=1, db=session, limit=0)  # floor → 1
    get_recent_feedback(user_id=1, db=session, limit=10_000)  # ceiling → 100
    last = session.query.return_value.limit
    # The two clamp calls should have requested limit=1 and limit=100.
    assert last.call_args_list[0].args == (1,)
    assert last.call_args_list[1].args == (100,)


def test_limit_is_cast_to_int():
    session = _make_session([])
    get_recent_feedback(user_id=1, db=session, limit=12.7)
    last = session.query.return_value.limit
    assert last.call_args.args == (12,)  # int(12.7) == 12


def test_orders_by_created_at_desc():
    """Defensive: SQL is order_by(created_at.desc()) — verify the call."""
    session = _make_session([])
    get_recent_feedback(user_id=1, db=session, limit=5)
    order = session.query.return_value.order_by
    assert order.called
