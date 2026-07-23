"""Regression tests for ``sanitize_model_text`` + ``sanitize_model_optional_text``.

These helpers are the Pydantic-layer counterpart to the FastAPI-layer
``sanitize_text`` / ``sanitize_html`` — they raise ``ValueError``
(not ``HTTPException``) so Pydantic can wrap the error in the
422 response envelope.

A regression here would either:

  - Skip the type check → a non-string value reaches the database.
  - Drop the strip → leading/trailing whitespace leaks.
  - Drop the empty check → empty values bypass downstream "required
    field" logic.
  - Drop the null-byte check → smuggling attack bypasses sanitization.
  - Drop the length check → unbounded payload reaches the database.

Pins:
  - Plain string is stripped and returned.
  - Non-string raises ``ValueError``.
  - Empty string raises ``ValueError``.
  - Whitespace-only raises ``ValueError``.
  - Null-byte raises ``ValueError``.
  - Over-length raises ``ValueError``.
  - The error message contains the field name (for debugging).
  - ``sanitize_model_optional_text`` returns ``None`` for None and
    delegates to ``sanitize_model_text`` otherwise.
"""

from __future__ import annotations

import pytest

from arena.core.input_validation import sanitize_model_optional_text, sanitize_model_text


class TestSanitizeModelTextHappyPath:
    def test_plain_text_returned(self):
        assert sanitize_model_text("hello", max_length=100, field_name="name") == "hello"

    def test_leading_whitespace_stripped(self):
        assert sanitize_model_text("  hello", max_length=100, field_name="name") == "hello"

    def test_trailing_whitespace_stripped(self):
        assert sanitize_model_text("hello  ", max_length=100, field_name="name") == "hello"

    def test_unicode_preserved(self):
        assert sanitize_model_text("ünîçødé", max_length=100, field_name="name") == "ünîçødé"


class TestSanitizeModelTextNonString:
    def test_none_raises_value_error(self):
        with pytest.raises(ValueError) as exc:
            sanitize_model_text(None, max_length=100, field_name="name")
        assert "name" in str(exc.value)
        assert "string" in str(exc.value).lower()

    def test_int_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_text(42, max_length=100, field_name="name")

    def test_float_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_text(3.14, max_length=100, field_name="name")

    def test_bool_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_text(True, max_length=100, field_name="name")

    def test_list_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_text(["hello"], max_length=100, field_name="name")

    def test_dict_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_text({"name": "value"}, max_length=100, field_name="name")

    def test_bytes_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_text(b"hello", max_length=100, field_name="name")


class TestSanitizeModelTextEmpty:
    def test_empty_string_raises(self):
        with pytest.raises(ValueError) as exc:
            sanitize_model_text("", max_length=100, field_name="name")
        assert "name" in str(exc.value)
        assert "empty" in str(exc.value).lower()

    def test_whitespace_only_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_text("   ", max_length=100, field_name="name")

    def test_newline_only_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_text("\n", max_length=100, field_name="name")

    def test_tab_only_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_text("\t", max_length=100, field_name="name")


class TestSanitizeModelTextNullByte:
    def test_null_byte_raises(self):
        with pytest.raises(ValueError) as exc:
            sanitize_model_text("hello\x00world", max_length=100, field_name="name")
        assert "name" in str(exc.value)
        assert "invalid" in str(exc.value).lower()

    def test_leading_null_byte_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_text("\x00hello", max_length=100, field_name="name")

    def test_trailing_null_byte_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_text("hello\x00", max_length=100, field_name="name")


class TestSanitizeModelTextLength:
    def test_exactly_max_length_accepted(self):
        text = "a" * 100
        assert sanitize_model_text(text, max_length=100, field_name="name") == text

    def test_over_max_length_raises(self):
        with pytest.raises(ValueError) as exc:
            sanitize_model_text("a" * 101, max_length=100, field_name="name")
        assert "name" in str(exc.value)
        assert "long" in str(exc.value).lower()

    def test_far_over_max_length_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_text("a" * 1_000_000, max_length=100, field_name="name")


class TestSanitizeModelTextFieldName:
    """The field name is in every error message so Pydantic can
    surface 'invalid <field>' to the user without parsing."""

    def test_field_name_in_non_string_error(self):
        with pytest.raises(ValueError) as exc:
            sanitize_model_text(None, max_length=100, field_name="user_input")
        assert "user_input" in str(exc.value)

    def test_field_name_in_empty_error(self):
        with pytest.raises(ValueError) as exc:
            sanitize_model_text("", max_length=100, field_name="my_field")
        assert "my_field" in str(exc.value)

    def test_field_name_in_length_error(self):
        with pytest.raises(ValueError) as exc:
            sanitize_model_text("a" * 200, max_length=100, field_name="the_field")
        assert "the_field" in str(exc.value)


class TestSanitizeModelTextDefensive:
    def test_does_not_raise_on_unusual_inputs(self):
        """Defensive: a normal input does not raise."""
        for value in ("hello", "  hello  ", "hello world", "üñîçødé"):
            sanitize_model_text(value, max_length=100, field_name="x")

    def test_returns_plain_str(self):
        """The return type is plain `str` (not a subclass)."""
        result = sanitize_model_text("hello", max_length=100, field_name="x")
        assert isinstance(result, str)
        assert type(result) is str


class TestSanitizeModelOptionalText:
    """The optional variant returns None for None and delegates
    to ``sanitize_model_text`` otherwise."""

    def test_none_returns_none(self):
        result = sanitize_model_optional_text(
            None, max_length=100, field_name="bio"
        )
        assert result is None

    def test_string_delegates_to_required(self):
        result = sanitize_model_optional_text(
            "hello", max_length=100, field_name="bio"
        )
        assert result == "hello"

    def test_empty_string_raises(self):
        """An empty string is NOT the same as None — the optional
        helper delegates to required for empty, which raises."""
        with pytest.raises(ValueError):
            sanitize_model_optional_text("", max_length=100, field_name="bio")

    def test_whitespace_only_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_optional_text("   ", max_length=100, field_name="bio")

    def test_null_byte_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_optional_text("a\x00b", max_length=100, field_name="bio")

    def test_over_length_raises(self):
        with pytest.raises(ValueError):
            sanitize_model_optional_text("a" * 200, max_length=100, field_name="bio")

    def test_string_with_leading_whitespace_is_stripped(self):
        result = sanitize_model_optional_text("  hello  ", max_length=100, field_name="bio")
        assert result == "hello"

    def test_string_unicode_preserved(self):
        result = sanitize_model_optional_text("ünîçødé", max_length=100, field_name="bio")
        assert result == "ünîçødé"

    def test_int_raises(self):
        """A non-string non-None value is delegated to required,
        which raises ValueError (not None)."""
        with pytest.raises(ValueError):
            sanitize_model_optional_text(42, max_length=100, field_name="bio")

    def test_field_name_in_none_case(self):
        """When None, no error is raised (return None). Pin the
        contract — the field name is NOT in any error because no
        error is raised."""
        result = sanitize_model_optional_text(
            None, max_length=100, field_name="my_field"
        )
        assert result is None  # no exception, no field name check

    def test_field_name_in_string_case(self):
        """When the optional helper raises, the field name IS in
        the error message."""
        with pytest.raises(ValueError) as exc:
            sanitize_model_optional_text("", max_length=100, field_name="my_field")
        assert "my_field" in str(exc.value)


class TestSanitizeModelTextIdempotence:
    def test_repeated_call_is_deterministic(self):
        for _ in range(3):
            assert sanitize_model_text("hello", max_length=100, field_name="x") == "hello"