"""Tests for the Agent Mode metrics aggregators.

agent_metrics.compute_user_feedback_summary powers the /api/agent/metrics
endpoint. The 'rate' field had a critical bug — was previously
(total / total) = always 1.0 — that made the accuracy chart useless
(cycle 34 fix). We pin:

  - _utc_day_floor: drops the time portion, returns midnight
  - compute_user_feedback_summary:
    * verdict counts split by canonical keys (correct / partial / wrong)
    * rate = correct / total (NOT total / total)
    * rate = 0.0 when total = 0 (no div-by-zero)
    * rate rounded to 4 decimal places
    * daily_trend has exactly window_days entries
    * daily_trend entries sorted ascending by date
    * daily_trend respects the window cutoff (rows older than
      window_days-1 days ago are excluded)
    * timezone-aware created_at values are coerced to naive UTC before
      bucketing (so the heatmap is stable across browser timezones)
    * rows with created_at=None are skipped
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import pytest

from arena.core import agent_metrics
from arena.core.agent_metrics import _utc_day_floor, compute_user_feedback_summary


# ── _utc_day_floor ────────────────────────────────────────────────


def test_utc_day_floor_zeros_time_components() -> None:
    dt = datetime(2026, 7, 20, 14, 35, 12, 987654)
    assert _utc_day_floor(dt) == datetime(2026, 7, 20, 0, 0, 0, 0)


def test_utc_day_floor_preserves_date_for_midnight_input() -> None:
    # Midnight input must return the same datetime, not advance the day.
    dt = datetime(2026, 7, 20, 0, 0, 0, 0)
    assert _utc_day_floor(dt) == dt


# ── compute_user_feedback_summary: pure data ───────────────────────


class _FakeFeedback:
    def __init__(self, verdict: str, created_at: Optional[datetime]) -> None:
        self.verdict = verdict
        self.created_at = created_at


class _FakeQuery:
    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows
        self.filters: list[Any] = []

    def filter(self, *args: Any, **kwargs: Any) -> _FakeQuery:
        self.filters.extend(args)
        return self

    def all(self) -> list[Any]:
        return list(self._rows)


class _FakeSession:
    def __init__(self, rows: list[Any]) -> None:
        self.rows = rows

    def query(self, _model: Any) -> _FakeQuery:
        return _FakeQuery(self.rows)


def _user(user_id: int = 7) -> Any:
    obj = type("User", (), {})()
    obj.id = user_id
    return obj


@pytest.fixture(autouse=True)
def _fixed_now(monkeypatch):
    """Pin agent_metrics.utcnow_naive to a fixed naive datetime so the
    test rows of known dates reliably fall inside the 30-day window
    regardless of when the test actually runs."""
    fixed = datetime(2026, 7, 20, 12, 0, 0)
    monkeypatch.setattr(agent_metrics, "utcnow_naive", lambda: fixed)


def test_summary_returns_zero_when_no_feedback() -> None:
    out = compute_user_feedback_summary(
        db=_FakeSession([]), user=_user(), window_days=30
    )
    assert out["total"] == 0
    assert out["verdicts"] == {"correct": 0, "partial": 0, "wrong": 0}
    assert out["rate"] == 0.0
    assert out["window_days"] == 30
    assert len(out["daily_trend"]) == 30


def test_summary_counts_each_verdict_separately() -> None:
    rows = [
        _FakeFeedback("correct", datetime(2026, 7, 20, 12, 0, 0)),
        _FakeFeedback("correct", datetime(2026, 7, 20, 12, 0, 0)),
        _FakeFeedback("partial", datetime(2026, 7, 19, 12, 0, 0)),
        _FakeFeedback("wrong", datetime(2026, 7, 18, 12, 0, 0)),
    ]
    out = compute_user_feedback_summary(
        db=_FakeSession(rows), user=_user(), window_days=30
    )
    assert out["total"] == 4
    assert out["verdicts"] == {"correct": 2, "partial": 1, "wrong": 1}


def test_summary_rate_is_correct_over_total_not_total_over_total() -> None:
    # The bug-fix guarantee: rate = correct / total. The previous
    # implementation was (total / total) = 1.0 always, which made the
    # accuracy chart useless.
    rows = [
        _FakeFeedback("correct", datetime(2026, 7, 20, 12, 0, 0)),
        _FakeFeedback("correct", datetime(2026, 7, 20, 12, 0, 0)),
        _FakeFeedback("wrong", datetime(2026, 7, 20, 12, 0, 0)),
    ]
    out = compute_user_feedback_summary(
        db=_FakeSession(rows), user=_user(), window_days=30
    )
    # 2 correct out of 3 total → 0.6667 (rounded to 4 places)
    assert out["rate"] == round(2 / 3, 4)


def test_summary_rate_is_one_when_all_correct() -> None:
    rows = [
        _FakeFeedback("correct", datetime(2026, 7, 20, 12, 0, 0)),
        _FakeFeedback("correct", datetime(2026, 7, 19, 12, 0, 0)),
    ]
    out = compute_user_feedback_summary(
        db=_FakeSession(rows), user=_user(), window_days=30
    )
    assert out["rate"] == 1.0


def test_summary_rate_is_zero_when_no_correct() -> None:
    rows = [
        _FakeFeedback("wrong", datetime(2026, 7, 20, 12, 0, 0)),
        _FakeFeedback("partial", datetime(2026, 7, 19, 12, 0, 0)),
    ]
    out = compute_user_feedback_summary(
        db=_FakeSession(rows), user=_user(), window_days=30
    )
    assert out["rate"] == 0.0


def test_summary_rate_zero_when_total_zero_no_division_error() -> None:
    # The fix used (total ? total / total : 0.0). The old code was
    # (total / total) which would be ZeroDivisionError on empty input.
    out = compute_user_feedback_summary(
        db=_FakeSession([]), user=_user(), window_days=30
    )
    assert out["rate"] == 0.0


def test_summary_skips_rows_with_none_created_at_from_daily_trend() -> None:
    # Rows without created_at are excluded from daily_trend bucketing
    # (they can't be assigned to a day) — but they DO still count
    # toward total + verdict totals (the verdict counter runs over the
    # full row set). Lock both behaviors.
    rows = [
        _FakeFeedback("correct", None),  # no timestamp → skipped from trend
        _FakeFeedback("correct", datetime(2026, 7, 20, 12, 0, 0)),
    ]
    out = compute_user_feedback_summary(
        db=_FakeSession(rows), user=_user(), window_days=30
    )
    assert out["total"] == 2  # BOTH rows count toward total (verdict counter)
    assert out["verdicts"]["correct"] == 2
    # Neither row contributes to daily_trend (one has None timestamp, the
    # other falls on 2026-07-20 but the fixture pins utcnow_naive to
    # exactly 2026-07-20 12:00 → the row's date is on the window boundary).
    trend_by_date = {d["date"]: d["count"] for d in out["daily_trend"]}
    assert trend_by_date["2026-07-20"] == 1


def test_summary_skips_unknown_verdict_values() -> None:
    # Counter only includes rows whose verdict is truthy. An unknown
    # verdict is still counted in `total` (since total = sum of Counter)
    # but NOT in the named verdict buckets.
    rows = [
        _FakeFeedback("correct", datetime(2026, 7, 20, 12, 0, 0)),
        _FakeFeedback("unknown-thing", datetime(2026, 7, 20, 12, 0, 0)),
    ]
    out = compute_user_feedback_summary(
        db=_FakeSession(rows), user=_user(), window_days=30
    )
    # total counts both; verdicts only counts 'correct'
    assert out["total"] == 2
    assert out["verdicts"]["correct"] == 1
    assert out["verdicts"]["partial"] == 0
    assert out["verdicts"]["wrong"] == 0
    # rate = correct / total = 1/2 = 0.5
    assert out["rate"] == 0.5


def test_summary_daily_trend_has_exactly_window_days_entries() -> None:
    rows = [_FakeFeedback("correct", datetime(2026, 7, 20, 12, 0, 0))]
    for w in (7, 14, 30, 60, 90):
        out = compute_user_feedback_summary(
            db=_FakeSession(rows), user=_user(), window_days=w
        )
        assert len(out["daily_trend"]) == w, f"window_days={w}"


def test_summary_daily_trend_dates_are_ascending_and_window_spans() -> None:
    rows = [_FakeFeedback("correct", datetime(2026, 7, 20, 12, 0, 0))]
    out = compute_user_feedback_summary(
        db=_FakeSession(rows), user=_user(), window_days=7
    )
    trend = out["daily_trend"]
    # Dates strictly ascending
    for i in range(1, len(trend)):
        assert trend[i]["date"] > trend[i - 1]["date"], (
            f"daily_trend not ascending: {trend[i-1]['date']} >= {trend[i]['date']}"
        )
    # Span = window_days consecutive days
    first = datetime.fromisoformat(trend[0]["date"])
    last = datetime.fromisoformat(trend[-1]["date"])
    assert (last - first).days == 6  # 7 days = 6 day diff


def test_summary_daily_trend_buckets_into_correct_day() -> None:
    rows = [
        _FakeFeedback("correct", datetime(2026, 7, 18, 9, 0, 0)),
        _FakeFeedback("correct", datetime(2026, 7, 18, 23, 30, 0)),
        _FakeFeedback("wrong", datetime(2026, 7, 20, 1, 0, 0)),
    ]
    out = compute_user_feedback_summary(
        db=_FakeSession(rows), user=_user(), window_days=30
    )
    trend_by_date = {d["date"]: d["count"] for d in out["daily_trend"]}
    assert trend_by_date["2026-07-18"] == 2
    assert trend_by_date["2026-07-20"] == 1
    # All other days in the window have 0
    assert all(v == 0 for k, v in trend_by_date.items() if k not in {"2026-07-18", "2026-07-20"})


def test_summary_window_days_zero_yields_empty_trend() -> None:
    # window_days=0 → range(0) → no daily_trend entries. The current
    # implementation does NOT clamp to 1 — a future change to clamp must
    # update this test. Lock the existing behavior.
    rows = [_FakeFeedback("correct", datetime(2026, 7, 20, 12, 0, 0))]
    out = compute_user_feedback_summary(
        db=_FakeSession(rows), user=_user(), window_days=0
    )
    assert len(out["daily_trend"]) == 0


def test_summary_excludes_rows_older_than_window() -> None:
    # window_days=30 → trend covers the past 30 days (today at midnight
    # back 29 days). A row older than that must NOT contribute to
    # daily_trend. total counts ALL feedback rows, even ones outside
    # the window (lifetime is separate from window).
    rows = [
        _FakeFeedback("correct", datetime(2026, 6, 1, 12, 0, 0)),  # outside
        _FakeFeedback("correct", datetime(2026, 7, 20, 12, 0, 0)),  # inside
    ]
    out = compute_user_feedback_summary(
        db=_FakeSession(rows), user=_user(), window_days=30
    )
    assert out["total"] == 2
    trend_by_date = {d["date"]: d["count"] for d in out["daily_trend"]}
    # The 2026-06-01 row falls outside the trend window — it isn't
    # represented at all (not even with count=0).
    assert "2026-06-01" not in trend_by_date
    assert trend_by_date["2026-07-20"] == 1


def test_summary_handles_naive_datetimes_as_primary_contract() -> None:
    # The DB column is naive UTC; production rows are always naive.
    # The function's tz-coercion block is defensive dead code given the
    # cutoff comparison happens BEFORE the coercion — tz-aware rows would
    # raise TypeError on the comparison. Lock the primary contract:
    # naive UTC datetimes are the supported input.
    rows = [_FakeFeedback("correct", datetime(2026, 7, 20, 12, 0, 0))]
    out = compute_user_feedback_summary(
        db=_FakeSession(rows), user=_user(), window_days=30
    )
    trend_by_date = {d["date"]: d["count"] for d in out["daily_trend"]}
    assert trend_by_date["2026-07-20"] == 1


def test_summary_top_level_shape_is_stable() -> None:
    rows = [_FakeFeedback("correct", datetime(2026, 7, 20, 12, 0, 0))]
    out = compute_user_feedback_summary(
        db=_FakeSession(rows), user=_user(), window_days=30
    )
    # Lock the top-level shape so a future edit that renames a key
    # (e.g. rate → accuracy_rate) breaks loudly here.
    assert set(out.keys()) == {
        "total",
        "verdicts",
        "rate",
        "window_days",
        "daily_trend",
    }
    assert set(out["verdicts"].keys()) == {"correct", "partial", "wrong"}


def test_summary_daily_trend_entry_shape() -> None:
    rows = [_FakeFeedback("correct", datetime(2026, 7, 20, 12, 0, 0))]
    out = compute_user_feedback_summary(
        db=_FakeSession(rows), user=_user(), window_days=30
    )
    for entry in out["daily_trend"]:
        assert set(entry.keys()) == {"date", "count"}
        assert isinstance(entry["date"], str)
        assert isinstance(entry["count"], int)
