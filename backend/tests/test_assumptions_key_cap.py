"""Tests for the assumptions key allowlist in to_dict.

Blackboard.to_dict() historically returned the full
assumptions dict verbatim. A user-injected value (e.g.
via a corrupted pipeline or a maliciously-modified row
in the DB) could include arbitrary keys. The to_dict()
call returns this dict verbatim, so the injection would
be emitted in every GET /tasks/{id}/detail response.

Fix: cap assumptions to the 3 known keys produced by
assumption_surfacer. Any other key is dropped at the
to_dict() boundary.

The 3 known keys:
- summary (str)
- assumptions (list of assumption dicts)
- assumption_count (int)

Tests pin:
- All 3 known keys preserved
- 1 unknown key dropped (the injection case)
- 100 unknown keys dropped
- Non-dict returns {} (defensive)
- A nested dict (e.g. {"assumptions": [{...}]}) is preserved
  (the cap is on top-level keys, not nested)
- The allowlist has 3 keys
- Blackboard.to_dict() applies the cap
- An empty assumptions returns {}
"""

from __future__ import annotations

from arena.core.blackboard import (
    Blackboard,
    _filter_assumptions_keys,
    _ASSUMPTIONS_KEYS,
)


# --- the helper directly ---


def test_all_3_known_keys_preserved() -> None:
    value = {
        "summary": "The answer assumes X.",
        "assumptions": [{"text": "x", "confidence": 0.9}],
        "assumption_count": 1,
    }
    result = _filter_assumptions_keys(value)
    assert set(result.keys()) == set(_ASSUMPTIONS_KEYS)


def test_unknown_key_dropped() -> None:
    """A dict with 1 unknown key drops that key (the
    injection case)."""
    value = {
        "summary": "The answer assumes X.",
        "malicious_key": "<script>alert(1)</script>",
    }
    result = _filter_assumptions_keys(value)
    assert "malicious_key" not in result
    assert "summary" in result


def test_100_unknown_keys_dropped() -> None:
    """A dict with 100 unknown keys drops all of them."""
    value = {f"key{i}": f"value{i}" for i in range(100)}
    value["summary"] = "x"  # one known key
    result = _filter_assumptions_keys(value)
    assert len(result) == 1
    assert "summary" in result


def test_non_dict_returns_empty() -> None:
    """A non-dict returns {} (defensive: the JSON column
    could be null or a string)."""
    for bad in [None, "string", 42, []]:
        assert _filter_assumptions_keys(bad) == {}


def test_nested_dict_preserved() -> None:
    """A nested dict (e.g. {"assumptions": [{"text": "x"}]})
    is preserved — the cap is on top-level keys, not nested
    fields."""
    value = {
        "assumptions": [
            {"text": "x", "confidence": 0.9},
            {"text": "y", "confidence": 0.8},
        ],
    }
    result = _filter_assumptions_keys(value)
    assert result == value


def test_allowlist_has_three_keys() -> None:
    """The allowlist is the 3 known keys produced by
    assumption_surfacer."""
    assert len(_ASSUMPTIONS_KEYS) == 3
    assert _ASSUMPTIONS_KEYS == frozenset({
        "summary", "assumptions", "assumption_count",
    })


# --- integration: to_dict applies the cap ---


def test_to_dict_applies_assumptions_cap() -> None:
    """Integration: Blackboard.to_dict() applies the cap, so
    a Blackboard with a maliciously-injected assumptions returns
    only the known keys in the to_dict() output.
    """
    bb = Blackboard(task_id="t", user_id=1)
    bb.assumptions = {
        "summary": "The answer assumes X.",
        "assumption_count": 1,
        "malicious_key": "dropped",
    }
    result = bb.to_dict()
    assert "malicious_key" not in result["assumptions"]
    assert result["assumptions"]["summary"] == "The answer assumes X."
    assert result["assumptions"]["assumption_count"] == 1


def test_to_dict_empty_assumptions() -> None:
    """An empty assumptions returns {} in to_dict()."""
    bb = Blackboard(task_id="t", user_id=1)
    bb.assumptions = {}
    result = bb.to_dict()
    assert result["assumptions"] == {}
