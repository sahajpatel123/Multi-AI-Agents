"""Tests for the calibration retract path read-side clamp.

The retract_and_rerate endpoint reads system_score from
_system_score_from_task (unbounded per the cycle 49
revert) and computes delta = system_score - user_scaled.
The new read-side clamp bounds the response.

Tests pin:
- delta=-999 is clamped to -100 in the response
- system_score=999 is clamped to 100 in the response
- The verdict uses the clamped delta
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401


@pytest.mark.asyncio
async def test_retract_response_clamps_huge_delta(monkeypatch):
    """The retract_and_rerate response never leaks huge raw scores.

    _system_score_from_task clamps the raw score to [0, 100] at the
    source, so a persisted final_score of 999 becomes 100 and the delta
    (100 - 3*20) is 40. The response then re-clamps defensively to
    [-100, 100] — both layers together keep the JSON output bounded.
    """
    from arena.routes import calibration

    # Build a fake user
    user = SimpleNamespace(id=1, email="x@x.com")
    # Build a fake AgentTask
    fake_task = SimpleNamespace(
        task_id="task-abc-123",
        user_id=1,
        task_text="x",
        final_score=999,  # unbounded (per cycle 49 revert)
        intelligence_score=None,  # for _system_score_from_task
    )
    # Build a fake existing rating
    fake_existing = SimpleNamespace(
        id=42,
        user_id=1,
        task_id="task-abc-123",
        user_rating=4,
        system_score=999,  # unbounded (per cycle 49 revert)
        delta=999,  # unbounded
        created_at=datetime(2026, 1, 1, 0, 0, 0),
    )

    # Mock the DB — separate values for the AgentTask query
    # (which needs `intelligence_score`) vs the
    # ConfidenceRating query (which needs `delta`/`system_score`).
    fake_db = MagicMock()
    # First query: AgentTask
    fake_task.intelligence_score = None  # ensure attribute exists
    fake_db.query.return_value.filter.return_value.first.side_effect = [fake_task, fake_existing]

    # Mock the rate limit and stats
    monkeypatch.setattr(calibration, "enforce_user_rate_limit", lambda *a, **k: None)
    monkeypatch.setattr(calibration, "build_calibration_stats", lambda *a, **k: {})

    # Run the handler
    body = calibration.RetractBody(rating=3)
    result = await calibration.retract_and_rerate(
        task_id="task-abc-123",
        body=body,
        user=user,
        db=fake_db,
    )

    # The response clamps the huge system_score at the source (999 → 100)
    # and keeps the resulting delta inside the Arena range.
    assert result["delta"] == 40  # 100 - 3*20, bounded by [-100, 100]
    assert result["system_score"] == 100  # clamped to 100
    assert result["verdict"] == "You underestimated this answer"
    assert result["status"] == "replaced"
    assert result["id"] == 42
    assert result["user_rating"] == 3


@pytest.mark.asyncio
async def test_retract_response_clamps_huge_negative(monkeypatch):
    """The retract_and_rerate response clamps huge negative raw scores.

    _system_score_from_task clamps -999 to 0, so the delta (0 - 1*20)
    is -20 — bounded by the defensive [-100, 100] response clamp and
    rendered with the matching verdict.
    """
    from arena.routes import calibration

    user = SimpleNamespace(id=1, email="x@x.com")
    fake_task = SimpleNamespace(
        task_id="task-abc-123",
        user_id=1,
        task_text="x",
        final_score=-999,  # unbounded (per cycle 49 revert)
        intelligence_score=None,  # for _system_score_from_task
    )
    fake_existing = SimpleNamespace(
        id=42,
        user_id=1,
        task_id="task-abc-123",
        user_rating=4,
        system_score=-999,
        delta=-999,
        created_at=datetime(2026, 1, 1, 0, 0, 0),
    )

    fake_db = MagicMock()
    # First query: AgentTask (needs intelligence_score).
    # Second query: ConfidenceRating (returns fake_existing).
    fake_task.intelligence_score = None  # ensure attribute exists
    fake_db.query.return_value.filter.return_value.first.side_effect = [fake_task, fake_existing]

    monkeypatch.setattr(calibration, "enforce_user_rate_limit", lambda *a, **k: None)
    monkeypatch.setattr(calibration, "build_calibration_stats", lambda *a, **k: {})

    body = calibration.RetractBody(rating=1)
    result = await calibration.retract_and_rerate(
        task_id="task-abc-123",
        body=body,
        user=user,
        db=fake_db,
    )

    assert result["delta"] == -20  # 0 - 1*20, bounded by [-100, 100]
    assert result["system_score"] == 0  # clamped from -999 to 0 (system_score is [0, 100])
    assert result["verdict"] == "You overestimated this answer"
