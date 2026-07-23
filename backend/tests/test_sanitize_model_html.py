"""Regression tests for ``sanitize_model_html`` + optional variant.

The Pydantic-layer HTML sanitizer rejects text containing ``<`` or
``>`` (defends against markup injection in display fields). A
regression here would either:

  - Accept markup → stored HTML is rendered as HTML in the
    frontend (XSS vector).
  - Drop the strip → leading/trailing whitespace leaks.
  - Drop the length check → unbounded input reaches the database.

Pins:
  - Plain text (no `<` / `>`) is stripped and returned.
  - Text with ``<`` or ``>`` is rejected.
  - Empty / whitespace-only input is rejected.
  - Over-length input is rejected.
  - The error message mentions the field name.
  - The optional variant returns None for None and delegates
    to the required variant otherwise.
"""

from __future__ import annotations

import pytest

from arena.core.input_validation import sanitize_model_html, sanitize_model_optional_html


class TestSanitizeModelHtmlHappyPath:
    def test_plain_text_returned(self):
        assert sanitize_model_html("hello", max_length=100, field_name="name") == "hello"

    def test_leading_whitespace_stripped(self):
        assert sanitize_model_html("  hello", max_length=100, field_name="name") == "hello"

    def test_trailing_whitespace_stripped(self):
        assert sanitize_model_html("hello  ", max_length=100, field_name="name") == "hello"

    def test_internal_whitespace_preserved(self):
        assert sanitize_model_html("hello world", max_length=100, field_name="name") == "hello world"

    def test_unicode_preserved(self):
        assert sanitize_model_html("ünîçødé", max_length=100, field_name="name") == "ünîçødé"

    def test_punctuation_with_special_chars_preserved(self):
        """A character like `&` (entity prefix) is allowed — only
        `<` and `>` are forbidden."""
        assert sanitize_model_html("hello & world", max_length=100, field_name="name") == "hello & world"

    def test_ampersand_preserved(self):
        assert sanitize_model_html("&", max_length=100, field_name="name") == "&"


class TestSanitizeModelHtmlRejectsMarkup:
    """The headline contract: ``<`` and ``>`` are rejected."""

    def test_lt_rejected(self):
        with pytest.raises(ValueError) as exc:
            sanitize_model_html("hello<world", max_length=100, field_name="name")
        assert "name" in str(exc.value)

    def test_gt_rejected(self):
        with pytest.raises(ValueError):
            sanitize_model_html("hello>world", max_length=100, field_name="name")

    def test_both_rejected(self):
        with pytest.raises(ValueError):
            sanitize_model_html("<script>", max_length=100, field_name="name")

    def test_html_tag_rejected(self):
        """A full HTML tag is rejected — pin the contract."""
        with pytest.raises(ValueError):
            sanitize_model_html("<b>bold</b>", max_length=100, field_name="name")

    def test_lt_only_rejected(self):
        """A lone ``<`` is rejected (not just ``<>`` pairs)."""
        with pytest.raises(ValueError):
            sanitize_model_html("<", max_length=100, field_name="name")

    def test_gt_only_rejected(self):
        with pytest.raises(ValueError):
            sanitize_model_html(">", max_length=100, field_name="name")

    def test_strip_then_check(self):
        """Whitespace + markup: strip first, then check markup."""
        with pytest.raises(ValueError):
            sanitize_model_html("  <b>bold</b>  ", max_length=100, field_name="name")

    def test_html_entity_text_NOT_rejected(self):
        """The helper only checks for literal ``<`` and ``>`` chars.
        A string like ``&lt;`` (an HTML entity, not raw markup)
        is allowed — the helper doesn't try to interpret entities."""
        # Pin the actual behavior: the helper is a character-level
        # check, not an entity-aware parser.
        assert sanitize_model_html("&lt;", max_length=100, field_name="name") == "&lt;"


class TestSanitizeModelHtmlNonString:
    def test_none_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_html(None, max_length=100, field_name="name")

    def test_int_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_html(42, max_length=100, field_name="name")

    def test_bytes_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_html(b"hello", max_length=100, field_name="name")

    def test_list_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_html(["<b>"], max_length=100, field_name="name")


class TestSanitizeModelHtmlEmpty:
    def test_empty_string_raises(self):
        with pytest.raises(ValueError) as exc:
            sanitize_model_html("", max_length=100, field_name="name")
        assert "name" in str(exc.value)
        assert "empty" in str(exc.value).lower()

    def test_whitespace_only_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_html("   ", max_length=100, field_name="name")


class TestSanitizeModelHtmlLength:
    def test_exactly_max_length_accepted(self):
        text = "a" * 100
        assert sanitize_model_html(text, max_length=100, field_name="name") == text

    def test_over_max_length_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_html("a" * 101, max_length=100, field_name="name")

    def test_far_over_max_length_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_html("a" * 1_000_000, max_length=100, field_name="name")


class TestSanitizeModelHtmlFieldName:
    def test_field_name_in_markup_error(self):
        with pytest.raises(ValueError) as exc:
            sanitize_model_html("<b>", max_length=100, field_name="my_field")
        assert "my_field" in str(exc.value)

    def test_field_name_in_empty_error(self):
        with pytest.raises(ValueError) as exc:
            sanitize_model_html("", max_length=100, field_name="the_field")
        assert "the_field" in str(exc.value)

    def test_field_name_in_length_error(self):
        with pytest.raises(ValueError) as exc:
            sanitize_model_html("a" * 200, max_length=100, field_name="the_field")
        assert "the_field" in str(exc.value)


class TestSanitizeModelHtmlPrecedence:
    """Order of checks matters for the user-facing message."""

    def test_markup_check_runs_after_strip(self):
        """Whitespace + markup: strip first, then check markup."""
        with pytest.raises(ValueError) as exc:
            sanitize_model_html("  <b>bold</b>  ", max_length=100, field_name="x")
        # The markup message is the actionable error.
        assert "html" in str(exc.value).lower() or "markup" in str(exc.value).lower() or "<" in str(exc.value).lower() or ">" in str(exc.value).lower()

    def test_length_check_runs_after_markup(self):
        """Markup + over-length: markup wins (the more actionable
        error)."""
        # Use a 50-char text with markup, length 10.
        text_with_markup = "a" * 5 + "<b>" + "a" * 5
        with pytest.raises(ValueError) as exc:
            sanitize_model_html(text_with_markup, max_length=10, field_name="x")
        # The markup message is what the user sees first.
        assert "html" in str(exc.value).lower() or "<" in str(exc.value).lower() or ">" in str(exc.value).lower()

    def test_empty_check_runs_after_strip(self):
        """Whitespace-only: strip → empty → empty error."""
        with pytest.raises(ValueError) as exc:
            sanitize_model_html("   ", max_length=100, field_name="x")
        assert "empty" in str(exc.value).lower()


class TestSanitizeModelHtmlDefensive:
    def test_does_not_raise_on_unusual_inputs(self):
        """Defensive: a normal input does not raise."""
        for value in ("hello", "  hello  ", "hello world", "ünîçødé"):
            sanitize_model_html(value, max_length=100, field_name="x")

    def test_returns_plain_str(self):
        result = sanitize_model_html("hello", max_length=100, field_name="x")
        assert isinstance(result, str)
        assert type(result) is str


class TestSanitizeModelOptionalHtml:
    """The optional variant returns None for None and delegates
    to the required variant otherwise."""

    def test_none_returns_none(self):
        result = sanitize_model_optional_html(
            None, max_length=100, field_name="bio"
        )
        assert result is None

    def test_string_delegates_to_required(self):
        result = sanitize_model_optional_html(
            "hello", max_length=100, field_name="bio"
        )
        assert result == "hello"

    def test_empty_string_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_optional_html("", max_length=100, field_name="bio")

    def test_markup_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_optional_html("<b>", max_length=100, field_name="bio")

    def test_over_length_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_optional_html("a" * 200, max_length=100, field_name="bio")

    def test_int_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_optional_html(42, max_length=100, field_name="bio")

    def test_field_name_in_optional_error(self):
        with pytest.raises(ValueError) as exc:
            sanitize_model_optional_html("<b>", max_length=100, field_name="my_optional")
        assert "my_optional" in str(exc.value)

    def test_string_with_leading_whitespace_is_stripped(self):
        result = sanitize_model_optional_html("  hello  ", max_length=100, field_name="bio")
        assert result == "hello"

    def test_string_unicode_preserved(self):
        result = sanitize_model_optional_html("ünîçødé", max_length=100, field_name="bio")
        assert result == "ünîçødé"

    def test_punctuation_with_special_chars_preserved(self):
        result = sanitize_model_optional_html("hello & world", max_length=100, field_name="bio")
        assert result == "hello & world"


class TestSanitizeModelHtmlIdempotence:
    def test_repeated_call_is_deterministic(self):
        for _ in range(3):
            assert sanitize_model_html("hello", max_length=100, field_name="x") == "hello"