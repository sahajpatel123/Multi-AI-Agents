"""Unit tests for ``_coerce_persona_panel``.

The helper is the only thing that decides whether a persisted panel is
usable, so a regression here directly corrupts the win-rate denominator.
Indirect coverage through the route misses the failure shapes the helper
sits between (None, JSON string, dict-shaped blobs from upstream bugs,
lists larger than the real 4-slot panel).
"""

from __future__ import annotations

import json

from arena.routes.analytics import _MAX_PANEL_SIZE, _coerce_persona_panel


# ─── Empty / null inputs ────────────────────────────────────────────────────


def test_none_returns_empty_list():
    assert _coerce_persona_panel(None) == []


def test_empty_string_returns_empty_list():
    assert _coerce_persona_panel("") == []


def test_empty_list_returns_empty_list():
    assert _coerce_persona_panel([]) == []


# ─── Happy path ─────────────────────────────────────────────────────────────


def test_list_of_strings_passes_through():
    assert _coerce_persona_panel(["analyst", "philosopher"]) == [
        "analyst",
        "philosopher",
    ]


def test_tuple_is_treated_as_list():
    assert _coerce_persona_panel(("analyst", "philosopher")) == [
        "analyst",
        "philosopher",
    ]


def test_whitespace_around_ids_is_stripped():
    assert _coerce_persona_panel(["  analyst  ", "\tphilosopher\n"]) == [
        "analyst",
        "philosopher",
    ]


def test_empty_and_whitespace_only_entries_are_dropped():
    assert _coerce_persona_panel(["analyst", "", "   ", "philosopher"]) == [
        "analyst",
        "philosopher",
    ]


# ─── JSON-string decode ─────────────────────────────────────────────────────


def test_json_string_list_is_decoded():
    assert _coerce_persona_panel(json.dumps(["analyst", "philosopher"])) == [
        "analyst",
        "philosopher",
    ]


def test_json_string_empty_array_decodes_to_empty_list():
    assert _coerce_persona_panel(json.dumps([])) == []


def test_malformed_json_string_returns_empty_list():
    """A corrupted JSON string must never crash the caller — degrade to []."""
    assert _coerce_persona_panel("[analyst, philosopher") == []


def test_json_string_with_non_array_returns_empty_list():
    """A JSON object/string is not a panel — degrade, don't guess."""
    assert _coerce_persona_panel(json.dumps({"analyst": 1})) == []


# ─── Mixed-shape defensive cases ────────────────────────────────────────────


def test_dict_input_returns_empty_list():
    """A dict is not a panel; failing closed prevents a TypeError."""
    assert _coerce_persona_panel({"analyst": 1}) == []


def test_int_input_returns_empty_list():
    assert _coerce_persona_panel(42) == []


def test_non_string_entries_are_dropped():
    """Numbers / None / booleans in a JSON list are filtered, not coerced."""
    assert _coerce_persona_panel(["analyst", 42, None, True, "philosopher"]) == [
        "analyst",
        "philosopher",
    ]


# ─── Oversized input ────────────────────────────────────────────────────────


def test_panel_capped_at_max_size():
    """A 1000-id blob must not pass through — the real panel is 4 slots."""
    panel = [f"persona_{i}" for i in range(1000)]
    result = _coerce_persona_panel(panel)
    assert len(result) == _MAX_PANEL_SIZE
    assert result == panel[:_MAX_PANEL_SIZE]
