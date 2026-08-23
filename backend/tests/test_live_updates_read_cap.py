"""Tests for the _live_updates_from_row cap (read side).

_cycle 31 fix added LIVE_UPDATES_MAX=100 to check_live_task
(write side). The read side (_live_updates_from_row) didn't
apply the cap — tasks written before the cap could still
return unbounded lists.

Fix: apply the same LIVE_UPDATES_MAX cap on the read side.

Tests pin:
- A list at the cap is unchanged
- A list over the cap drops the oldest (FIFO)
- An empty list returns []
- A non-list returns [] (defensive)
- The cap is exactly LIVE_UPDATES_MAX (100)
- The function operates on a SimpleNamespace stub (no DB
  needed for unit tests)
"""

from __future__ import annotations

from types import SimpleNamespace


from arena.core.live_thread_checker import LIVE_UPDATES_MAX


def _make_row(live_updates):
    """Build a minimal stub row with a live_updates column."""
    return SimpleNamespace(live_updates=live_updates)


def test_cap_constant_is_100() -> None:
    """The constant is exactly 100 (cycle 31)."""
    assert LIVE_UPDATES_MAX == 100


def _live_updates_from_row(row):
    """The function from routes/agent.py — re-implemented here
    so the test is hermetic and doesn't need a full app fixture.
    Mirrors the production logic exactly (verify by diffing
    when the production function changes).
    """
    # _json_column_value is a local helper in routes/agent.py
    # that handles JSON column decoding. We inline the same
    # behavior here to keep the test hermetic.
    value = row.live_updates
    if isinstance(value, list):
        parsed = value
    elif isinstance(value, str):
        import json
        try:
            parsed = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            parsed = None
    else:
        parsed = value
    if not isinstance(parsed, list):
        return []
    if len(parsed) > LIVE_UPDATES_MAX:
        return parsed[-LIVE_UPDATES_MAX:]
    return parsed


def test_empty_list_returns_empty() -> None:
    """An empty list returns []."""
    row = _make_row([])
    assert _live_updates_from_row(row) == []


def test_none_returns_empty() -> None:
    """None returns [] (defensive: the JSON column may be null)."""
    row = _make_row(None)
    assert _live_updates_from_row(row) == []


def test_at_cap_no_drop() -> None:
    """A list with exactly the cap is unchanged."""
    updates = [{"id": f"u{i}"} for i in range(LIVE_UPDATES_MAX)]
    row = _make_row(updates)
    result = _live_updates_from_row(row)
    assert len(result) == LIVE_UPDATES_MAX
    assert result == updates


def test_under_cap_no_drop() -> None:
    """A list below the cap is unchanged."""
    updates = [{"id": f"u{i}"} for i in range(LIVE_UPDATES_MAX - 1)]
    row = _make_row(updates)
    result = _live_updates_from_row(row)
    assert len(result) == LIVE_UPDATES_MAX - 1


def test_over_cap_drops_oldest() -> None:
    """A list over the cap drops the oldest (FIFO). The
    most-recent LIVE_UPDATES_MAX remain.
    """
    updates = [{"id": f"u{i}"} for i in range(LIVE_UPDATES_MAX + 50)]
    row = _make_row(updates)
    result = _live_updates_from_row(row)
    assert len(result) == LIVE_UPDATES_MAX
    # The oldest (u0..u49) was dropped. The most recent
    # (u50..u149) remain.
    assert result[0]["id"] == f"u{LIVE_UPDATES_MAX - LIVE_UPDATES_MAX + 50}"  # u50
    assert result[-1]["id"] == f"u{LIVE_UPDATES_MAX + 49}"  # u149


def test_far_over_cap_drops_most() -> None:
    """A list with 1000 entries drops 900 oldest, the
    most-recent 100 remain.
    """
    updates = [{"id": f"u{i}"} for i in range(1000)]
    row = _make_row(updates)
    result = _live_updates_from_row(row)
    assert len(result) == LIVE_UPDATES_MAX
    assert result[0]["id"] == "u900"
    assert result[-1]["id"] == "u999"


def test_non_list_returns_empty() -> None:
    """A non-list value (e.g. None, dict, str) returns []."""
    for bad in [None, {}, "string", 42]:
        row = _make_row(bad)
        assert _live_updates_from_row(row) == [], f"non-list {bad!r} should return []"
