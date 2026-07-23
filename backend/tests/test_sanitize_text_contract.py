"""Regression tests for ``sanitize_text`` (input validation).

The helper strips, rejects empty / null-byte / over-long inputs.
A regression here would either:

  - Drop the strip → leading/trailing whitespace leaks into the
    stored payload (breaks downstream text matching).
  - Drop the empty check → user submits " " and the validator
    accepts it (passing an empty value to downstream code).
  - Drop the null-byte check → a malicious payload smuggles a null
    byte to bypass downstream log/CQL sanitizers.
  - Drop the length check → 5MB string reaches the database.

Pins:
  - Plain text is stripped and returned.
  - Whitespace-only input is rejected.
  - Input containing null bytes is rejected.
  - Input exceeding max_length is rejected.
  - The error envelope has the stable shape: error + message + field_name.
  - max_length is enforced at exactly N (boundary test).
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from arena.core.input_validation import sanitize_text


class TestSanitizeTextHappyPath:
    def test_plain_text_stripped_and_returned(self):
        """Plain text is stripped and returned."""
        assert sanitize_text("hello", max_length=100) == "hello"

    def test_leading_whitespace_stripped(self):
        assert sanitize_text("  hello", max_length=100) == "hello"

    def test_trailing_whitespace_stripped(self):
        assert sanitize_text("hello  ", max_length=100) == "hello"

    def test_internal_whitespace_preserved(self):
        assert sanitize_text("hello world", max_length=100) == "hello world"

    def test_unicode_preserved(self):
        assert sanitize_text("ünîçødé", max_length=100) == "ünîçødé"


class TestSanitizeTextEmptyInput:
    def test_empty_string_rejected(self):
        with pytest.raises(HTTPException) as exc:
            sanitize_text("", max_length=100, field_name="prompt")
        assert exc.value.status_code == 400

    def test_whitespace_only_rejected(self):
        with pytest.raises(HTTPException):
            sanitize_text("   ", max_length=100, field_name="prompt")
        # The error message mentions empty / cannot.
        # We don't pin the exact wording — only the structural contract.

    def test_newline_only_rejected(self):
        with pytest.raises(HTTPException):
            sanitize_text("\n", max_length=100)

    def test_tab_only_rejected(self):
        with pytest.raises(HTTPException):
            sanitize_text("\t", max_length=100)

    def test_mixed_whitespace_only_rejected(self):
        with pytest.raises(HTTPException):
            sanitize_text(" \n\t \n ", max_length=100)


class TestSanitizeTextNullByte:
    """A null byte in user input is a classic smuggling attack —
    it bypasses downstream log/CQL sanitizers that split on
    printable characters only."""

    def test_null_byte_rejected(self):
        with pytest.raises(HTTPException):
            sanitize_text("hello\x00world", max_length=100)

    def test_leading_null_rejected(self):
        with pytest.raises(HTTPException):
            sanitize_text("\x00hello", max_length=100)

    def test_trailing_null_rejected(self):
        with pytest.raises(HTTPException):
            sanitize_text("hello\x00", max_length=100)

    def test_multiple_null_bytes_rejected(self):
        with pytest.raises(HTTPException):
            sanitize_text("a\x00b\x00c", max_length=100)


class TestSanitizeTextLength:
    def test_exactly_max_length_accepted(self):
        """An input exactly at max_length is accepted."""
        text = "a" * 100
        assert sanitize_text(text, max_length=100) == text

    def test_over_max_length_rejected(self):
        with pytest.raises(HTTPException):
            sanitize_text("a" * 101, max_length=100)

    def test_far_over_max_length_rejected(self):
        with pytest.raises(HTTPException):
            sanitize_text("a" * 100_000, max_length=100)

    def test_default_max_length_is_2000(self):
        """Pin the default max_length contract — operators watch
        this on dashboards. A regression that bumped it to 5000
        would silently allow longer payloads."""
        # Just at the default.
        text = "a" * 2000
        assert sanitize_text(text) == text
        # Just over.
        with pytest.raises(HTTPException):
            sanitize_text("a" * 2001)


class TestSanitizeTextFieldName:
    """The field name is interpolated into the error message so the
    frontend can render 'invalid <field>' without parsing."""

    def test_field_name_appears_in_empty_error(self):
        with pytest.raises(HTTPException) as exc:
            sanitize_text("", field_name="my_special_field")
        assert "my_special_field" in exc.value.detail["message"]

    def test_field_name_appears_in_length_error(self):
        with pytest.raises(HTTPException) as exc:
            sanitize_text("a" * 200, max_length=100, field_name="user_input")
        assert "user_input" in exc.value.detail["message"]

    def test_field_name_appears_in_null_byte_error(self):
        with pytest.raises(HTTPException) as exc:
            sanitize_text("a\x00b", field_name="prompt_text")
        assert "prompt_text" in exc.value.detail["message"]


class TestSanitizeTextErrorEnvelope:
    """The error envelope shape is read by the frontend — pin it."""

    def test_envelope_has_stable_error_code(self):
        """All error envelopes use the stable error code."""
        for bad in ("", " ", "a" * 200, "a\x00b"):
            with pytest.raises(HTTPException) as exc:
                sanitize_text(bad, max_length=100, field_name="x")
            assert exc.value.detail["error"] == "validation_error"

    def test_envelope_message_is_string(self):
        with pytest.raises(HTTPException) as exc:
            sanitize_text("", field_name="x")
        assert isinstance(exc.value.detail["message"], str)
        assert len(exc.value.detail["message"]) > 0


class TestSanitizeTextPrecedence:
    """Order of checks matters for the user-facing message."""

    def test_null_byte_check_runs_after_strip(self):
        """Whitespace + null-byte: strip first, then null-byte check."""
        with pytest.raises(HTTPException) as exc:
            sanitize_text("  \x00  ", max_length=100, field_name="x")
        # The null-byte message is the actionable error.
        assert "invalid" in exc.value.detail["message"].lower()

    def test_length_check_runs_after_strip(self):
        """Whitespace + over-length: strip first, then length check."""
        with pytest.raises(HTTPException) as exc:
            sanitize_text("  " + "a" * 100, max_length=50, field_name="x")
        assert "length" in exc.value.detail["message"].lower() or "maximum" in exc.value.detail["message"].lower()

    def test_empty_check_runs_after_strip(self):
        """Whitespace-only input: strip → empty → empty error."""
        with pytest.raises(HTTPException) as exc:
            sanitize_text("   ", max_length=100, field_name="x")
        assert "empty" in exc.value.detail["message"].lower()


class TestSanitizeTextDefensive:
    def test_does_not_raise_on_unusual_inputs(self):
        """Defensive: an unusual input (the validation catches it
        with HTTPException)."""
        for value in ("hello", "  hello  ", "hello world", "üñîçødé"):
            # Should NOT raise (these are valid).
            sanitize_text(value, max_length=100)

    def test_returns_stripped_str(self):
        """The return type is plain ``str`` (not a subclass)."""
        result = sanitize_text("hello", max_length=100)
        assert isinstance(result, str)
        assert type(result) is str