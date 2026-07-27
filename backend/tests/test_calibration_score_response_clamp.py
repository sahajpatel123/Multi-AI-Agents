"""Tests for the calibration read-side system_score/delta clamp.

The column types in the DB are unbounded int. The
_system_score_from_task helper reads unbounded data (per
the cycle 49 revert at the user's request). The
read-side clamp bounds the response:
- system_score: clamped to [0, 100]
- delta: clamped to [-100, 100]

Tests pin:
- system_score=80 (typical) accepted
- system_score=999 clamped to 100 (the injection case)
- system_score=-50 clamped to 0
- system_score=None clamped to 0 (default)
- delta=80 (typical) accepted
- delta=999 clamped to 100
- delta=-999 clamped to -100
- delta=None clamped to 0
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.calibration import _serialize_rating


def _make_row(system_score=None, delta=None):
    """Build a minimal stub ConfidenceRating row with all the
    fields the serializer accesses.
    """
    return SimpleNamespace(
        id=1,
        task_id="task-abc-123",
        user_rating=4,
        system_score=system_score,
        delta=delta,
        created_at=None,
    )


# --- system_score clamping ---


def test_system_score_typical_accepted() -> None:
    """system_score=80 (the typical value) is accepted."""
    row = _make_row(system_score=80, delta=0)
    result = _serialize_rating(row)
    assert result["system_score"] == 80


def test_system_score_999_clamped_to_100() -> None:
    """system_score=999 is clamped to 100 (the injection case)."""
    row = _make_row(system_score=999, delta=0)
    result = _serialize_rating(row)
    assert result["system_score"] == 100


def test_system_score_negative_clamped_to_0() -> None:
    """system_score=-50 is clamped to 0."""
    row = _make_row(system_score=-50, delta=0)
    result = _serialize_rating(row)
    assert result["system_score"] == 0


def test_system_score_none_clamped_to_0() -> None:
    """system_score=None is clamped to 0 (the default)."""
    row = _make_row(system_score=None, delta=0)
    result = _serialize_rating(row)
    assert result["system_score"] == 0


# --- delta clamping ---


def test_delta_typical_accepted() -> None:
    """delta=80 (the typical value) is accepted."""
    row = _make_row(system_score=0, delta=80)
    result = _serialize_rating(row)
    assert result["delta"] == 80


def test_delta_999_clamped_to_100() -> None:
    """delta=999 is clamped to 100."""
    row = _make_row(system_score=0, delta=999)
    result = _serialize_rating(row)
    assert result["delta"] == 100


def test_delta_negative_999_clamped_to_minus_100() -> None:
    """delta=-999 is clamped to -100."""
    row = _make_row(system_score=0, delta=-999)
    result = _serialize_rating(row)
    assert result["delta"] == -100


def test_delta_none_clamped_to_0() -> None:
    """delta=None is clamped to 0."""
    row = _make_row(system_score=0, delta=None)
    result = _serialize_rating(row)
    assert result["delta"] == 0


# --- verdict function uses the clamped delta ---


def test_verdict_uses_clamped_delta() -> None:
    """The verdict is computed from the clamped delta, so
    a huge delta is classified correctly. A delta=999 is
    clamped to 100, which is > 10, so the verdict is 'You
    underestimated this answer'."""
    row = _make_row(system_score=0, delta=999)
    result = _serialize_rating(row)
    assert result["delta"] == 100
    assert result["verdict"] == "You underestimated this answer"


def test_verdict_uses_clamped_delta_negative() -> None:
    """A delta=-999 is clamped to -100, which is < -10, so
    the verdict is 'You overestimated this answer'."""
    row = _make_row(system_score=0, delta=-999)
    result = _serialize_rating(row)
    assert result["delta"] == -100
    assert result["verdict"] == "You overestimated this answer"
