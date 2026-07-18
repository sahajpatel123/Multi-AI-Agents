"""Unit tests for feedback distribution + calibration math (no HTTP)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from arena.core.feedback_calibrator import (
    get_answer_feedback_distribution,
    get_feedback_calibration,
)


class _Q:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *a, **k):
        return self

    def all(self):
        return list(self._rows)


def _db(rows):
    db = MagicMock()
    db.query.return_value = _Q(rows)
    return db


def test_distribution_empty():
    out = get_answer_feedback_distribution(1, _db([]))
    assert out == {
        "total": 0,
        "correct_pct": 0,
        "partial_pct": 0,
        "wrong_pct": 0,
    }


def test_distribution_percentages():
    rows = [
        SimpleNamespace(verdict="correct"),
        SimpleNamespace(verdict="correct"),
        SimpleNamespace(verdict="partial"),
        SimpleNamespace(verdict="wrong"),
    ]
    out = get_answer_feedback_distribution(1, _db(rows))
    assert out["total"] == 4
    assert out["correct_pct"] == 50
    assert out["partial_pct"] == 25
    assert out["wrong_pct"] == 25


def test_calibration_unreliable_under_five():
    rows = [SimpleNamespace(verdict="wrong") for _ in range(4)]
    out = get_feedback_calibration(1, _db(rows))
    assert out["reliable"] is False
    assert out["adjustment"] == 0
    assert out["total_feedback"] == 4


def test_calibration_adjustment_and_reliable_flag():
    # 10 rows: 4 wrong, 2 partial, 4 correct
    rows = (
        [SimpleNamespace(verdict="wrong")] * 4
        + [SimpleNamespace(verdict="partial")] * 2
        + [SimpleNamespace(verdict="correct")] * 4
    )
    out = get_feedback_calibration(1, _db(rows))
    assert out["total_feedback"] == 10
    assert out["reliable"] is True
    # wrong_rate=0.4 → -6; partial_rate=0.2 → -1.4 → round(-7.4) = -7
    assert out["adjustment"] == -7
    assert out["wrong_rate"] == 40
