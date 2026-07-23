"""Regression tests for ``sanitize_optional_text``.

The optional text sanitizer returns None for None and delegates
to the required sanitizer otherwise. The ``strip_tags`` parameter
(legacy name) routes to the HTML-reject sanitizer when True.

Pins:
  - None → None (no error, no sanitization).
  - String with strip_tags=False (default) → plain text sanitizer.
  - String with strip_tags=True → HTML-reject sanitizer.
  - Markup is rejected when strip_tags=True (defense in depth).
  - Empty string is rejected (delegated to required).
  - Over-length is rejected (delegated to required).
  - Field name appears in every error.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from arena.core.input_validation import sanitize_optional_text


class TestSanitizeOptionalTextNoneCase:
    def test_none_returns_none(self):
        """None input returns None — no sanitization, no error."""
        result = sanitize_optional_text(
            None, max_length=100, field_name="bio"
        )
        assert result is None

    def test_none_with_strip_tags_returns_none(self):
        """None with strip_tags=True still returns None — the None
        check runs before the strip_tags routing."""
        result = sanitize_optional_text(
            None, max_length=100, field_name="bio", strip_tags=True
        )
        assert result is None


class TestSanitizeOptionalTextDefaultStripTags:
    """Default (strip_tags=False) → routes to ``sanitize_text``."""

    def test_plain_text_passes_through(self):
        result = sanitize_optional_text("hello", max_length=100, field_name="bio")
        assert result == "hello"

    def test_whitespace_stripped(self):
        result = sanitize_optional_text("  hello  ", max_length=100, field_name="bio")
        assert result == "hello"

    def test_unicode_preserved(self):
        result = sanitize_optional_text("ünîçødé", max_length=100, field_name="bio")
        assert result == "ünîçødé"

    def test_markup_NOT_rejected_with_strip_tags_false(self):
        """Default mode (strip_tags=False) does NOT reject markup —
        it routes to ``sanitize_text`` which only checks
        empty/null-byte/length. The HTML check is opt-in via
        strip_tags=True."""
        # Pin actual behavior — pin the contract.
        result = sanitize_optional_text(
            "<b>hello</b>", max_length=100, field_name="bio"
        )
        assert result == "<b>hello</b>"

    def test_empty_string_raises(self):
        with pytest.raises(HTTPException) as exc:
            sanitize_optional_text("", max_length=100, field_name="bio")
        assert exc.value.status_code == 400
        assert "bio" in exc.value.detail["message"]

    def test_whitespace_only_raises(self):
        with pytest.raises(HTTPException):
            sanitize_optional_text("   ", max_length=100, field_name="bio")

    def test_over_length_raises(self):
        with pytest.raises(HTTPException):
            sanitize_optional_text("a" * 200, max_length=100, field_name="bio")


class TestSanitizeOptionalTextStripTagsTrue:
    """``strip_tags=True`` → routes to ``sanitize_html`` (markup
    rejected). Legacy name; current behavior is fail-closed (reject
    markup, do NOT silently strip)."""

    def test_plain_text_passes_through(self):
        result = sanitize_optional_text(
            "hello", max_length=100, field_name="bio", strip_tags=True
        )
        assert result == "hello"

    def test_whitespace_stripped(self):
        result = sanitize_optional_text(
            "  hello  ", max_length=100, field_name="bio", strip_tags=True
        )
        assert result == "hello"

    def test_unicode_preserved(self):
        result = sanitize_optional_text(
            "ünîçødé", max_length=100, field_name="bio", strip_tags=True
        )
        assert result == "ünîçødé"

    def test_markup_REJECTED_with_strip_tags_true(self):
        """The headline contract: ``strip_tags=True`` rejects markup
        (it's a fail-closed contract, NOT a silent-strip contract)."""
        with pytest.raises(HTTPException) as exc:
            sanitize_optional_text(
                "<b>hello</b>", max_length=100, field_name="bio",
                strip_tags=True,
            )
        assert exc.value.status_code == 400
        assert "bio" in exc.value.detail["message"]

    def test_lone_lt_rejected(self):
        with pytest.raises(HTTPException):
            sanitize_optional_text(
                "<", max_length=100, field_name="bio", strip_tags=True
            )

    def test_lone_gt_rejected(self):
        with pytest.raises(HTTPException):
            sanitize_optional_text(
                ">", max_length=100, field_name="bio", strip_tags=True
            )

    def test_strip_then_markup_check(self):
        """Whitespace + markup: strip first, then markup check."""
        with pytest.raises(HTTPException):
            sanitize_optional_text(
                "  <b>bold</b>  ", max_length=100, field_name="bio",
                strip_tags=True,
            )

    def test_empty_string_raises(self):
        with pytest.raises(HTTPException):
            sanitize_optional_text(
                "", max_length=100, field_name="bio", strip_tags=True
            )

    def test_over_length_raises(self):
        with pytest.raises(HTTPException):
            sanitize_optional_text(
                "a" * 200, max_length=100, field_name="bio", strip_tags=True
            )


class TestSanitizeOptionalTextFieldName:
    """The field name is in every error envelope."""

    def test_field_name_in_empty_error_default(self):
        with pytest.raises(HTTPException) as exc:
            sanitize_optional_text("", max_length=100, field_name="my_field")
        assert "my_field" in exc.value.detail["message"]

    def test_field_name_in_over_length_error_default(self):
        with pytest.raises(HTTPException) as exc:
            sanitize_optional_text("a" * 200, max_length=100, field_name="my_field")
        assert "my_field" in exc.value.detail["message"]

    def test_field_name_in_markup_error_strip_tags(self):
        with pytest.raises(HTTPException) as exc:
            sanitize_optional_text(
                "<b>", max_length=100, field_name="my_field", strip_tags=True
            )
        assert "my_field" in exc.value.detail["message"]


class TestSanitizeOptionalTextDefensive:
    def test_does_not_raise_on_unusual_inputs(self):
        """Defensive: a normal input does not raise."""
        for value in ("hello", "  hello  ", "hello world", "ünîçødé"):
            sanitize_optional_text(value, max_length=100, field_name="x")

    def test_returns_plain_str_or_none(self):
        """The return type is plain ``str`` (not a subclass) or None."""
        result = sanitize_optional_text("hello", max_length=100, field_name="x")
        assert isinstance(result, str)
        assert type(result) is str

    def test_none_returns_none_type(self):
        result = sanitize_optional_text(None, max_length=100, field_name="x")
        assert result is None


class TestSanitizeOptionalTextIdempotence:
    def test_repeated_call_is_deterministic(self):
        for _ in range(3):
            assert sanitize_optional_text("hello", max_length=100, field_name="x") == "hello"
            assert sanitize_optional_text(
                "hello", max_length=100, field_name="x", strip_tags=True
            ) == "hello"


class TestSanitizeOptionalTextStripTagsDefaultContract:
    """Pin the strip_tags parameter default and contract."""

    def test_strip_tags_default_is_false(self):
        """The default value of ``strip_tags`` is False — callers
        who want HTML-rejection must opt in explicitly. A
        regression that flipped the default would silently
        change the behavior of every caller."""
        # We test this by passing a markup string and checking
        # it's accepted (the default behavior).
        result = sanitize_optional_text(
            "<b>hello</b>", max_length=100, field_name="x"
        )
        # Default = no markup check → markup passes through.
        assert result == "<b>hello</b>"

    def test_explicit_strip_tags_false_matches_default(self):
        """An explicit ``strip_tags=False`` behaves the same as the
        default."""
        result_default = sanitize_optional_text(
            "<b>x</b>", max_length=100, field_name="x"
        )
        result_explicit = sanitize_optional_text(
            "<b>x</b>", max_length=100, field_name="x", strip_tags=False
        )
        assert result_default == result_explicit

    def test_strip_tags_true_changes_behavior(self):
        """``strip_tags=True`` is a different code path — verify
        it produces different behavior on a markup string."""
        result_false = sanitize_optional_text(
            "<b>x</b>", max_length=100, field_name="x", strip_tags=False
        )
        with pytest.raises(HTTPException):
            sanitize_optional_text(
                "<b>x</b>", max_length=100, field_name="x", strip_tags=True
            )
        # And the False result preserves the markup.
        assert result_false == "<b>x</b>"