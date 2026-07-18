"""Unit tests for arena.core.expertise_calibrator pure helpers."""

from __future__ import annotations

from arena.core.expertise_calibrator import (
    EXPERTISE_LEVELS,
    append_expertise_to_system,
    get_expertise_modifier,
    _normalize_level,
)


def test_normalize_level_defaults_and_aliases():
    assert _normalize_level("") == "curious"
    assert _normalize_level(None) == "curious"  # type: ignore[arg-type]
    assert _normalize_level("  EXPERT ") == "expert"
    assert _normalize_level("unknown-level") == "curious"
    for key in EXPERTISE_LEVELS:
        assert _normalize_level(key) == key


def test_get_expertise_modifier_empty_for_none_level():
    assert get_expertise_modifier("none", "physics") == ""
    assert get_expertise_modifier("none", "") == ""


def test_get_expertise_modifier_includes_domain_and_config():
    block = get_expertise_modifier("practitioner", "  corporate law  ")
    assert "EXPERTISE CALIBRATION:" in block
    assert "Working professional in corporate law" in block
    assert "0.78" in block
    assert "industry publications" in block
    assert "This calibration overrides default style decisions." in block


def test_get_expertise_modifier_omits_domain_when_blank():
    block = get_expertise_modifier("expert", "   ")
    assert "Domain expert" in block
    assert " in " not in block.split("User background:")[1].split("\n")[0]


def test_append_expertise_to_system_skips_empty():
    base = "You are a solver.\n"
    assert append_expertise_to_system(base, "") == base
    assert append_expertise_to_system(base, "   ") == base


def test_append_expertise_to_system_appends_block():
    base = "You are a solver."
    out = append_expertise_to_system(base, "EXPERTISE CALIBRATION:\nBe precise.")
    assert out.startswith("You are a solver.")
    assert "EXPERTISE CALIBRATION:" in out
    assert out.index("solver") < out.index("EXPERTISE")
