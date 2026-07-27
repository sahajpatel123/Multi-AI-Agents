"""Schema-level tests for FeedbackCalibrationInfo field bounds.

The previous loop shipped the endpoint without field-level bounds, which
meant a malformed helper or downstream consumer could write absurd values
into the calibration (e.g. adjustment=-999 would silently floor the UI
confidence at 0). These tests pin the Pydantic-level bounds so the
contract holds at the response serializer.

We test the schema directly (no DB, no HTTP) because the bounds belong
to the data shape, not the route.

Note on imports: ``FeedbackCalibrationInfo`` is imported lazily inside
each test rather than at module top. ``arena.models.schemas`` imports
``arena.core.agents`` at module load, and during test collection that
chain can hit a circular import when this file is being collected in
isolation. The lazy import sidesteps it.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError


def _schema():
    """Late-bind the schema to avoid circular-import during collection."""
    from arena.models import FeedbackCalibrationInfo

    return FeedbackCalibrationInfo


# ─── Defaults ──────────────────────────────────────────────────────────────


def test_defaults_match_unreliable_user():
    """A user with no feedback must yield the all-zero defaults."""
    FeedbackCalibrationInfo = _schema()
    obj = FeedbackCalibrationInfo()
    assert obj.adjustment == 0
    assert obj.reliable is False
    assert obj.total_feedback == 0
    assert obj.wrong_rate == 0


# ─── Happy path ────────────────────────────────────────────────────────────


def test_full_range_constructs_cleanly():
    """All canonical helper outputs fit inside the bounds."""
    FeedbackCalibrationInfo = _schema()
    obj = FeedbackCalibrationInfo(
        adjustment=-15,
        reliable=True,
        total_feedback=100,
        wrong_rate=80,
    )
    assert obj.adjustment == -15
    assert obj.reliable is True
    assert obj.total_feedback == 100
    assert obj.wrong_rate == 80


def test_all_correct_user_construction():
    FeedbackCalibrationInfo = _schema()
    obj = FeedbackCalibrationInfo(
        adjustment=0,
        reliable=True,
        total_feedback=200,
        wrong_rate=0,
    )
    assert obj.wrong_rate == 0


# ─── adjustment bounds ─────────────────────────────────────────────────────


@pytest.mark.parametrize("adj", [-15, -10, -7, -3, -1, 0])
def test_valid_adjustment_values_accepted(adj: int):
    FeedbackCalibrationInfo = _schema()
    FeedbackCalibrationInfo(adjustment=adj)


@pytest.mark.parametrize("adj", [-16, -100, -1000, 1, 5, 100])
def test_out_of_range_adjustment_rejected(adj: int):
    FeedbackCalibrationInfo = _schema()
    with pytest.raises(ValidationError):
        FeedbackCalibrationInfo(adjustment=adj)


# ─── wrong_rate bounds ─────────────────────────────────────────────────────


@pytest.mark.parametrize("rate", [0, 25, 50, 75, 100])
def test_valid_wrong_rate_values_accepted(rate: int):
    FeedbackCalibrationInfo = _schema()
    FeedbackCalibrationInfo(wrong_rate=rate)


@pytest.mark.parametrize("rate", [-1, -100, 101, 1000])
def test_out_of_range_wrong_rate_rejected(rate: int):
    FeedbackCalibrationInfo = _schema()
    with pytest.raises(ValidationError):
        FeedbackCalibrationInfo(wrong_rate=rate)


# ─── total_feedback bounds ─────────────────────────────────────────────────


@pytest.mark.parametrize("n", [0, 1, 5, 10, 100, 1000, 10_000])
def test_valid_total_feedback_values_accepted(n: int):
    FeedbackCalibrationInfo = _schema()
    FeedbackCalibrationInfo(total_feedback=n)


@pytest.mark.parametrize("n", [-1, -1000, 10_001, 1_000_000])
def test_out_of_range_total_feedback_rejected(n: int):
    FeedbackCalibrationInfo = _schema()
    with pytest.raises(ValidationError):
        FeedbackCalibrationInfo(total_feedback=n)


# ─── Extra fields silently dropped ─────────────────────────────────────────


def test_extra_fields_are_ignored():
    """Future helper fields must not break older clients.

    extra='ignore' is the deliberate contract — adding a new diagnostic
    metric to the helper should be a backward-compatible change for any
    client that doesn't expect it.
    """
    FeedbackCalibrationInfo = _schema()
    obj = FeedbackCalibrationInfo(
        adjustment=-5,
        reliable=True,
        total_feedback=20,
        wrong_rate=25,
        future_field="ignored",
        another_new_thing=42,
    )
    assert obj.adjustment == -5
    # Pydantic v2 with extra="ignore" does not surface unknown keys.
    assert not hasattr(obj, "future_field")
    assert not hasattr(obj, "another_new_thing")


# ─── Round-trip from the helper's actual return shape ─────────────────────


def test_accepts_helper_return_shape_at_zero():
    """The helper's < 5-row branch returns this exact dict shape."""
    FeedbackCalibrationInfo = _schema()
    raw = {"adjustment": 0, "reliable": False, "total_feedback": 3, "wrong_rate": 0}
    obj = FeedbackCalibrationInfo(**raw)
    assert obj.adjustment == 0
    assert obj.reliable is False


def test_accepts_helper_return_shape_at_full_penalty():
    """The helper's all-wrong branch (5-9 rows) returns this shape."""
    FeedbackCalibrationInfo = _schema()
    raw = {"adjustment": -15, "reliable": False, "total_feedback": 5, "wrong_rate": 100}
    obj = FeedbackCalibrationInfo(**raw)
    assert obj.adjustment == -15
    assert obj.wrong_rate == 100
