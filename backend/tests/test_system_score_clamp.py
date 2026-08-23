"""Tests for the _system_score_from_task clamp.

The function reads `total_score` from the intelligence_score
dict (or `final_score` from the AgentTask row). Without a
clamp, a maliciously-injected value (e.g. via a corrupted
row in the DB) outside [0, 100] would amplify the delta
returned to the user (delta = system_score - user_rating*20,
which could be a huge value) and skew the calibration score
math downstream.

Fix: clamp system_score to [0, 100] before returning.

Tests pin:
- total_score=0 → system_score=0 (boundary, min)
- total_score=100 → system_score=100 (boundary, max)
- total_score=80 → system_score=80 (typical)
- total_score=999 → system_score=100 (clamped, injection)
- total_score=-50 → system_score=0 (clamped, negative)
- total_score=None → system_score=0 (default)
- final_score=200 → system_score=100 (clamped)
- final_score=-10 → system_score=0 (clamped)
"""

from __future__ import annotations

import json
from types import SimpleNamespace


# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.calibration import _system_score_from_task


def _make_row(intelligence_score=None, final_score=None):
    """Build a minimal stub AgentTask row with intelligence_score
    and final_score columns."""
    return SimpleNamespace(
        intelligence_score=intelligence_score,
        final_score=final_score,
    )


# --- total_score path ---


def test_total_score_zero_accepted() -> None:
    """total_score=0 is the boundary (minimum)."""
    row = _make_row(intelligence_score={"total_score": 0})
    assert _system_score_from_task(row) == 0


def test_total_score_hundred_accepted() -> None:
    """total_score=100 is the boundary (maximum)."""
    row = _make_row(intelligence_score={"total_score": 100})
    assert _system_score_from_task(row) == 100


def test_total_score_typical_accepted() -> None:
    """total_score=80 is the typical score."""
    row = _make_row(intelligence_score={"total_score": 80})
    assert _system_score_from_task(row) == 80


def test_total_score_999_clamped() -> None:
    """total_score=999 is clamped to 100 (the injection case)."""
    row = _make_row(intelligence_score={"total_score": 999})
    assert _system_score_from_task(row) == 100


def test_total_score_negative_clamped() -> None:
    """total_score=-50 is clamped to 0."""
    row = _make_row(intelligence_score={"total_score": -50})
    assert _system_score_from_task(row) == 0


def test_total_score_none_default() -> None:
    """total_score=None is the default (empty intelligence_score)."""
    row = _make_row(intelligence_score={"total_score": None})
    assert _system_score_from_task(row) == 0


# --- JSON-string path ---


def test_total_score_json_string_huge_clamped() -> None:
    """total_score=999999999 in a JSON string is clamped."""
    row = _make_row(intelligence_score=json.dumps({"total_score": 999999999}))
    assert _system_score_from_task(row) == 100


def test_total_score_json_string_negative_clamped() -> None:
    """total_score=-100 in a JSON string is clamped to 0."""
    row = _make_row(intelligence_score=json.dumps({"total_score": -100}))
    assert _system_score_from_task(row) == 0


def test_total_score_json_string_typical() -> None:
    """total_score=50 in a JSON string returns 50."""
    row = _make_row(intelligence_score=json.dumps({"total_score": 50}))
    assert _system_score_from_task(row) == 50


# --- final_score fallback path ---


def test_final_score_200_clamped() -> None:
    """final_score=200 (no intelligence_score) is clamped to 100."""
    row = _make_row(intelligence_score=None, final_score=200)
    assert _system_score_from_task(row) == 100


def test_final_score_negative_clamped() -> None:
    """final_score=-10 (no intelligence_score) is clamped to 0."""
    row = _make_row(intelligence_score=None, final_score=-10)
    assert _system_score_from_task(row) == 0


def test_final_score_typical() -> None:
    """final_score=80 (no intelligence_score) returns 80."""
    row = _make_row(intelligence_score=None, final_score=80)
    assert _system_score_from_task(row) == 80


# --- empty / None intelligence_score ---


def test_empty_intelligence_score_returns_zero() -> None:
    """Empty intelligence_score returns 0 (no total_score
    key, no final_score fallback)."""
    row = _make_row(intelligence_score={}, final_score=None)
    assert _system_score_from_task(row) == 0


def test_none_intelligence_score_falls_back_to_final_score() -> None:
    """None intelligence_score falls back to final_score."""
    row = _make_row(intelligence_score=None, final_score=80)
    assert _system_score_from_task(row) == 80
