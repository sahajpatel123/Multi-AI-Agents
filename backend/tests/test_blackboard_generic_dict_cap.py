"""Tests for the generic dict cap in Blackboard.to_dict().

The remaining dict fields in to_dict() (source_integrity,
contradictions, dissent_report, temporal_profile) don't
have a clear key allowlist in the code. A maliciously-
injected value could include arbitrary keys or over-long
values. The cap bounds the per-field response size.

The cap is a soft bound:
- At most 10 keys (excess keys are dropped)
- Each str value is sliced to at most 100 chars (excess
  is dropped)
- Non-str values (int, list, dict, bool) are kept as-is

Tests pin:
- 1-10 keys preserved (within cap)
- 11+ keys dropped (excess)
- A 1KB string value sliced to 100 chars
- Non-str values (int, list, dict, bool) preserved as-is
- Non-dict returns {} (defensive)
- An empty dict returns {}
- All 4 fields (source_integrity, contradictions,
  dissent_report, temporal_profile) are capped via
  to_dict()
"""

from __future__ import annotations

from arena.core.blackboard import (
    Blackboard,
    _filter_generic_dict_keys,
    _GENERIC_DICT_MAX_KEYS,
    _GENERIC_DICT_MAX_VALUE_CHARS,
)


# --- the helper directly ---


def test_under_max_keys_preserved() -> None:
    value = {f"k{i}": f"v{i}" for i in range(_GENERIC_DICT_MAX_KEYS)}
    result = _filter_generic_dict_keys(value)
    assert len(result) == _GENERIC_DICT_MAX_KEYS
    assert result == value


def test_over_max_keys_dropped() -> None:
    value = {f"k{i}": f"v{i}" for i in range(_GENERIC_DICT_MAX_KEYS + 50)}
    result = _filter_generic_dict_keys(value)
    assert len(result) == _GENERIC_DICT_MAX_KEYS


def test_long_string_value_sliced() -> None:
    """A 1KB string value is sliced to 100 chars."""
    value = {"key": "a" * 1024}
    result = _filter_generic_dict_keys(value)
    assert result["key"] == "a" * _GENERIC_DICT_MAX_VALUE_CHARS
    assert len(result["key"]) == _GENERIC_DICT_MAX_VALUE_CHARS


def test_non_str_value_preserved() -> None:
    """Non-str values (int, list, dict, bool) are kept as-is."""
    value = {
        "int_key": 42,
        "list_key": [1, 2, 3],
        "dict_key": {"nested": "x"},
        "bool_key": True,
    }
    result = _filter_generic_dict_keys(value)
    assert result["int_key"] == 42
    assert result["list_key"] == [1, 2, 3]
    assert result["dict_key"] == {"nested": "x"}
    assert result["bool_key"] is True


def test_non_dict_returns_empty() -> None:
    """A non-dict returns {} (defensive: the JSON column
    could be null or a string)."""
    for bad in [None, "string", 42, []]:
        assert _filter_generic_dict_keys(bad) == {}


def test_empty_dict_returns_empty() -> None:
    assert _filter_generic_dict_keys({}) == {}


def test_mixed_keys_and_values() -> None:
    """A dict with mixed keys/values — keys beyond the cap are
    dropped, str values are sliced, non-str values are kept."""
    value = {
        "int": 42,
        "str_short": "hi",
        "str_long": "a" * 500,
        "list": [1, 2, 3],
    }
    result = _filter_generic_dict_keys(value)
    assert result["int"] == 42
    assert result["str_short"] == "hi"
    assert result["str_long"] == "a" * _GENERIC_DICT_MAX_VALUE_CHARS
    assert result["list"] == [1, 2, 3]


# --- integration: to_dict applies the cap to all 4 fields ---


def test_to_dict_applies_generic_cap_to_source_integrity() -> None:
    bb = Blackboard(task_id="t", user_id=1)
    bb.source_integrity = {f"k{i}": f"v{i}" for i in range(50)}
    result = bb.to_dict()
    assert len(result["source_integrity"]) == _GENERIC_DICT_MAX_KEYS


def test_to_dict_applies_generic_cap_to_contradictions() -> None:
    bb = Blackboard(task_id="t", user_id=1)
    bb.contradictions = {f"k{i}": f"v{i}" for i in range(50)}
    result = bb.to_dict()
    assert len(result["contradictions"]) == _GENERIC_DICT_MAX_KEYS


def test_to_dict_applies_generic_cap_to_dissent_report() -> None:
    bb = Blackboard(task_id="t", user_id=1)
    bb.dissent_report = {"long_key": "a" * 1000}
    result = bb.to_dict()
    assert len(result["dissent_report"]["long_key"]) == _GENERIC_DICT_MAX_VALUE_CHARS


def test_to_dict_applies_generic_cap_to_temporal_profile() -> None:
    bb = Blackboard(task_id="t", user_id=1)
    bb.temporal_profile = {f"k{i}": f"v{i}" for i in range(50)}
    result = bb.to_dict()
    assert len(result["temporal_profile"]) == _GENERIC_DICT_MAX_KEYS
