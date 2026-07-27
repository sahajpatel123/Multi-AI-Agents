"""Tests for the sources, flags, caveats list cap in to_dict.

Blackboard.sources, .flags, .caveats are lists that grow
via the agent pipeline. A buggy LLM (or a malicious user
submitting a crafted agent task) could cause unbounded
growth on any of these lists. The to_dict() cap bounds the
per-list response size to a fixed maximum (100 entries).

The cap is the first 100 entries; excess items are silently
dropped at the to_dict() boundary. The write side is
unbounded (the pipeline appends freely) — this is the
read-side cap that bounds the response size.

Tests pin:
- An empty list returns []
- A list with 50 items is unchanged
- A list with 100 items is unchanged (boundary)
- A list with 1000 items is capped to 100 (the first 100)
- A non-list returns [] (defensive)
- All 3 list fields (sources, flags, caveats) are capped
  via to_dict()
- The cap preserves order (FIFO)
"""

from __future__ import annotations

from arena.core.blackboard import (
    Blackboard,
    _cap_list,
    _LIST_MAX_ITEMS,
)


# --- the helper directly ---


def test_list_max_items_constant() -> None:
    """The list cap constant is 100 (matches the live_updates
    cap from cycle 31/40)."""
    assert _LIST_MAX_ITEMS == 100


def test_empty_list_returns_empty() -> None:
    assert _cap_list([]) == []


def test_under_max_unchanged() -> None:
    """A list with 50 items is unchanged."""
    items = list(range(50))
    assert _cap_list(items) == items


def test_at_max_unchanged() -> None:
    """A list with 100 items is unchanged (boundary)."""
    items = list(range(100))
    assert _cap_list(items) == items
    assert len(_cap_list(items)) == 100


def test_over_max_capped_to_max() -> None:
    """A list with 1000 items is capped to 100 (the first 100)."""
    items = list(range(1000))
    result = _cap_list(items)
    assert len(result) == 100
    # FIFO: the first 100 items are preserved
    assert result == list(range(100))


def test_non_list_returns_empty() -> None:
    """A non-list returns [] (defensive: the JSON column
    could be null or a string)."""
    for bad in [None, "string", 42, {}]:
        assert _cap_list(bad) == []


def test_max_items_override() -> None:
    """The max_items parameter can be overridden (e.g., to
    use a smaller cap for a specific field)."""
    items = list(range(50))
    result = _cap_list(items, max_items=10)
    assert len(result) == 10


# --- integration: to_dict applies the cap to all 3 fields ---


def test_to_dict_applies_cap_to_sources() -> None:
    bb = Blackboard(task_id="t", user_id=1)
    bb.sources = [f"source {i}" for i in range(500)]
    result = bb.to_dict()
    assert len(result["sources"]) == 100
    # FIFO: the first 100 items are preserved
    assert result["sources"][0] == "source 0"
    assert result["sources"][-1] == "source 99"


def test_to_dict_applies_cap_to_flags() -> None:
    bb = Blackboard(task_id="t", user_id=1)
    bb.flags = [f"flag {i}" for i in range(500)]
    result = bb.to_dict()
    assert len(result["flags"]) == 100


def test_to_dict_applies_cap_to_caveats() -> None:
    bb = Blackboard(task_id="t", user_id=1)
    bb.caveats = [f"caveat {i}" for i in range(500)]
    result = bb.to_dict()
    assert len(result["caveats"]) == 100
