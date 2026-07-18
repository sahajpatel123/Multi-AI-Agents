"""Unit tests for pure helpers in arena.core.response_shaper."""

from __future__ import annotations

from arena.core.response_shaper import (
    MAX_ONE_LINER_LENGTH,
    _extract_first_sentence,
    _needs_one_liner,
)


def test_needs_one_liner_empty_and_short():
    assert _needs_one_liner("") is True
    assert _needs_one_liner("   ") is True
    assert _needs_one_liner("ab") is True


def test_needs_one_liner_accepts_clean_line():
    assert _needs_one_liner("Markets reward patience over panic.") is False


def test_needs_one_liner_rejects_too_long_or_multi_sentence():
    long = "x" * (MAX_ONE_LINER_LENGTH + 5)
    assert _needs_one_liner(long) is True
    multi = "One. Two. Three. Four. Five."
    assert _needs_one_liner(multi) is True


def test_extract_first_sentence_stops_at_terminator():
    assert (
        _extract_first_sentence("Alpha is rising. Beta is noise elsewhere.")
        == "Alpha is rising."
    )
    assert _extract_first_sentence("Watch out! More follows.") == "Watch out!"
    assert _extract_first_sentence("Really? Yes it does.") == "Really?"


def test_extract_first_sentence_truncates_when_no_terminator():
    blob = "a" * 120
    out = _extract_first_sentence(blob)
    assert out.endswith("...")
    assert len(out) == 100
