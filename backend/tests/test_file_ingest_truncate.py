"""Regression tests for ``_truncate`` (file ingest helper).

The truncate helper sits in front of every file-ingest path (PDF, image,
text upload). A regression here would either:

  - Drop the strip call → leading/trailing whitespace leaks into the
    stored payload (breaks downstream text matching).
  - Use ``len(s.encode())`` instead of ``len(s)`` → multi-byte chars
    truncated mid-character, corrupting the stored text.
  - Drop the bounds check → empty input raises or returns unexpected.

Pins:
  - ``None`` / empty / whitespace-only inputs return ``""``.
  - Short input is returned unchanged (after strip).
  - Long input is truncated to exactly ``n`` chars.
  - The output is a valid string slice (no half-codepoint chars).
  - The default ``n`` matches ``MAX_TEXT``.
"""

from __future__ import annotations

import pytest

from arena.core.file_ingest import MAX_TEXT, _truncate


class TestTruncateEmptyInput:
    def test_none_returns_empty_string(self):
        assert _truncate(None) == ""

    def test_empty_string_returns_empty_string(self):
        assert _truncate("") == ""

    def test_whitespace_only_returns_empty_string(self):
        assert _truncate("   \n\t  ") == ""


class TestTruncateShortInput:
    def test_shorter_than_limit_returned_unchanged(self):
        assert _truncate("hello", n=100) == "hello"

    def test_equal_to_limit_returned_unchanged(self):
        text = "x" * 50
        assert _truncate(text, n=50) == text

    def test_strips_surrounding_whitespace(self):
        assert _truncate("  hello  ", n=100) == "hello"

    def test_does_not_strip_internal_whitespace(self):
        """Internal whitespace is preserved (only the leading and
        trailing strip runs)."""
        assert _truncate("hello world", n=100) == "hello world"


class TestTruncateLongInput:
    def test_truncates_to_n_chars(self):
        text = "a" * 1000
        result = _truncate(text, n=50)
        assert len(result) == 50

    def test_truncation_takes_first_n_chars(self):
        """The truncation is a plain slice — first n chars."""
        text = "abcdefghij" * 10  # 100 chars
        result = _truncate(text, n=10)
        assert result == "abcdefghij"

    def test_truncate_then_strip(self):
        """A long input that ends in whitespace still gets stripped
        AFTER truncation (the helper strips first, then slices).
        Pin the order: strip happens BEFORE the slice. The internal
        whitespace (the two spaces between 'world' and 'x'...) is
        preserved by the strip call — only the OUTER whitespace is
        removed."""
        text = "  hello world  " + "x" * 100
        result = _truncate(text, n=20)
        # Strip removed the leading 2 spaces and trailing whitespace,
        # yielding "hello world  xxx...". The slice takes the first 20
        # chars of that — the internal 2 spaces between "world" and
        # "xxx" are preserved.
        assert result == "hello world  xxxxxxx"

    def test_truncate_to_zero_returns_empty_string(self):
        """``n=0`` is a valid edge case — every text is truncated to
        zero chars. The strip still runs."""
        assert _truncate("hello", n=0) == ""


class TestTruncateDefaultLimit:
    def test_default_limit_matches_MAX_TEXT(self):
        """The default ``n`` is ``MAX_TEXT`` — pin the constant."""
        # Compute what ``_truncate(long_text)()`` produces.
        long = "x" * (MAX_TEXT + 100)
        result = _truncate(long)
        assert len(result) == MAX_TEXT
        assert result == "x" * MAX_TEXT

    def test_MAX_TEXT_is_a_positive_int(self):
        """Sanity: the default cap is positive (file ingest requires
        a real cap)."""
        assert isinstance(MAX_TEXT, int)
        assert MAX_TEXT > 0


class TestTruncateUnicodeSafe:
    def test_truncation_does_not_split_multibyte_chars(self):
        """The helper uses Python string slicing, which counts
        Unicode code points (not bytes) — multi-byte chars like
        emoji and CJK are truncated at code-point boundaries.
        Pin this: a regression to byte-counting would corrupt the
        stored text."""
        # "🚀" is 1 code point but 4 bytes in UTF-8.
        text = "🚀" * 20  # 20 code points
        result = _truncate(text, n=10)
        # The result is exactly 10 code points.
        assert len(result) == 10
        # And every char is intact (not half-split).
        assert all(c == "🚀" for c in result)

    def test_truncation_handles_cjk_text(self):
        """CJK text is multi-byte in UTF-8; the slice must count code
        points, not bytes, to avoid splitting mid-character."""
        text = "中文字符" * 100  # 400 code points
        result = _truncate(text, n=10)
        # The first 10 code points of "中文字符" repeated 100 times.
        # Sequence: 中文字符中文字符中文 — that's 中(1) 文(2) 字(3)
        # 符(4) 中(5) 文(6) 字(7) 符(8) 中(9) 文(10).
        assert result == "中文字符中文字符中文"
        assert len(result) == 10


class TestTruncateDefensive:
    def test_truncate_does_not_add_ellipsis(self):
        """The helper is a plain slice — no `...` suffix is added.
        The caller (rendering layer) is responsible for showing
        truncation to the user."""
        result = _truncate("a" * 100, n=10)
        assert result == "a" * 10
        assert "..." not in result

    def test_truncate_returns_string_type(self):
        """Defensive: the return type is always str, even for input
        that becomes empty."""
        result = _truncate(None, n=10)
        assert isinstance(result, str)
        assert result == ""

    def test_truncate_with_negative_n(self):
        """A negative ``n`` produces a slice from the END of the
        stripped string — Python's standard slice behavior. Pin:
        the helper does NOT raise on negative ``n``; the caller is
        responsible for clamping ``n >= 0`` upstream."""
        result = _truncate("hello", n=-1)
        # Standard Python slice semantics — returns up to (but not
        # including) the last char.
        assert result == "hell"