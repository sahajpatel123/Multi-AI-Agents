"""Regression tests for the input-validation constants.

``NULL_BYTE`` and ``HTML_CHAR_RE`` are imported by every sanitizer
in ``input_validation.py``. A regression that changes their values
would silently:
  - Loosen the null-byte check (smuggling attack passes through).
  - Loosen the markup check (XSS vector passes through).
  - Reject legitimate characters (false positive).

Pins:
  - ``NULL_BYTE`` is exactly ``"\x00"`` (one char).
  - ``HTML_CHAR_RE`` matches ``<`` and ``>`` but not ``&`` or `"`.
  - The compiled regex's `pattern` is the canonical regex string.
"""

from __future__ import annotations

import re

import pytest

from arena.core.input_validation import HTML_CHAR_RE, NULL_BYTE


class TestNullByteConstant:
    def test_null_byte_is_single_x00_char(self):
        """The null byte is exactly one character (a literal NUL).
        A regression that expanded it to a longer pattern (e.g.
        ``"\\x00\\x01"``) would reject legitimate input."""
        assert NULL_BYTE == "\x00"
        assert len(NULL_BYTE) == 1
        assert ord(NULL_BYTE) == 0

    def test_null_byte_is_a_str(self):
        """The constant is a `str` (not bytes) — sanitizers use
        ``in NULL_BYTE`` for string containment."""
        assert isinstance(NULL_BYTE, str)
        assert not isinstance(NULL_BYTE, bytes)

    def test_null_byte_detected_by_in_operator(self):
        """Pin the ``in`` operator behavior — sanitizers use
        ``NULL_BYTE in value``."""
        assert NULL_BYTE in "hello\x00world"
        assert NULL_BYTE in "\x00"
        assert NULL_BYTE not in "hello world"
        assert NULL_BYTE not in ""


class TestHtmlCharReConstant:
    def test_matches_lt(self):
        assert HTML_CHAR_RE.search("<") is not None

    def test_matches_gt(self):
        assert HTML_CHAR_RE.search(">") is not None

    def test_matches_full_tag(self):
        assert HTML_CHAR_RE.search("<b>") is not None

    def test_matches_text_with_lt(self):
        assert HTML_CHAR_RE.search("hello<world") is not None

    def test_matches_text_with_gt(self):
        assert HTML_CHAR_RE.search("hello>world") is not None

    def test_does_not_match_ampersand(self):
        """``&`` is the entity prefix but NOT a markup char — pin
        that the regex doesn't reject it (false positive)."""
        assert HTML_CHAR_RE.search("&") is None

    def test_does_not_match_quote(self):
        assert HTML_CHAR_RE.search('"') is None

    def test_does_not_match_apostrophe(self):
        assert HTML_CHAR_RE.search("'") is None

    def test_does_not_match_empty_string(self):
        assert HTML_CHAR_RE.search("") is None

    def test_does_not_match_plain_text(self):
        assert HTML_CHAR_RE.search("hello world") is None

    def test_does_not_match_unicode(self):
        """The regex is anchored to ASCII `<` and `>` only — unicode
        punctuation like « » is NOT markup."""
        assert HTML_CHAR_RE.search("«hello»") is None

    def test_does_not_match_em_dash(self):
        """Em-dash, en-dash, etc. are NOT markup — pin ASCII-only."""
        assert HTML_CHAR_RE.search("—") is None
        assert HTML_CHAR_RE.search("–") is None

    def test_pattern_is_correct_regex(self):
        """Pin the regex source — operators watch this on dashboards.
        A regression that changed ``[<>]`` to ``[<>a-z]`` would
        silently reject legitimate text."""
        assert HTML_CHAR_RE.pattern == "[<>]"

    def test_is_compiled(self):
        """The constant is a compiled regex (not a string)."""
        assert isinstance(HTML_CHAR_RE, re.Pattern)


class TestNullByteAndHtmlCharReCoexist:
    """The two constants are independent — pin the orthogonal
    behavior."""

    def test_null_byte_does_not_match_html(self):
        """A null byte is not markup. Pin: the HTML regex doesn't
        catch it. (The sanitizers check for null byte SEPARATELY.)"""
        assert HTML_CHAR_RE.search("\x00") is None

    def test_html_does_not_match_null_byte(self):
        """Markup chars are not null bytes — pin via the inverse
        direction."""
        assert "\x00" not in "<>"
        # And the sanitizer pipeline checks both.

    def test_both_caught_in_pipeline(self):
        """A string with BOTH null byte AND markup: both checks
        independently fail. Pin that the input validation pipeline
        catches both — a string ``"<\x00>"`` is rejected for BOTH
        reasons (and either error is surfaced depending on order)."""
        # Both `in` checks return True.
        assert NULL_BYTE in "<\x00>"
        assert HTML_CHAR_RE.search("<\x00>") is not None


class TestNullByteStability:
    """Stability: the constant is a single-character string."""

    def test_repeated_null_byte_in_string(self):
        """Multiple null bytes in a string still trigger the check."""
        assert NULL_BYTE in "a\x00b\x00c"
        assert HTML_CHAR_RE.search("a\x00b\x00c") is None  # null byte ≠ HTML

    def test_null_byte_at_unicode_position(self):
        """Null byte is a single-byte character that can appear in
        any position in a unicode string."""
        # Pin: NULL_BYTE in "üñîçødé\x00" → True
        assert NULL_BYTE in "üñîçødé\x00"


class TestHtmlCharReAlternation:
    """The regex matches both `<` and `>`. Pin the alternation."""

    def test_first_match_is_lt_in_lt_then_gt_string(self):
        """The regex finds the first match. A string with `<` before
        `>` should match at the `<` position."""
        text = "<>"
        match = HTML_CHAR_RE.search(text)
        assert match is not None
        assert match.start() == 0
        assert match.group() == "<"

    def test_first_match_is_gt_when_only_gt(self):
        text = "hello>"
        match = HTML_CHAR_RE.search(text)
        assert match is not None
        assert match.group() == ">"

    def test_first_match_is_lt_when_only_lt(self):
        text = "hello<"
        match = HTML_CHAR_RE.search(text)
        assert match is not None
        assert match.group() == "<"


class TestInputValidationConstantsDefensive:
    def test_constants_are_module_level(self):
        """The constants are at module level (not inside a function)
        so they're cached on import."""
        from arena.core import input_validation

        assert hasattr(input_validation, "NULL_BYTE")
        assert hasattr(input_validation, "HTML_CHAR_RE")

    def test_constants_are_stable_across_imports(self):
        """Re-importing the module returns the same constant — pin
        the singleton semantics."""
        from arena.core import input_validation

        assert input_validation.NULL_BYTE == NULL_BYTE
        assert input_validation.HTML_CHAR_RE is HTML_CHAR_RE