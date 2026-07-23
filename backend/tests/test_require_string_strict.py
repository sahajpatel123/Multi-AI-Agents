"""Regression tests for ``_require_string`` (input validation).

The helper enforces that the value passed to ``sanitize_text`` /
``sanitize_html`` is a plain ``str`` (NOT a subclass like
``markupsafe.Markup`` or any other ``str``-duck-typed object).
A regression that accepted ``str`` subclasses would let a
``Markup``-typed input slip through to the ``.strip()`` call —
which silently fails on Markup objects that don't override
``__getattribute__`` for strip.

Pins:
  - Plain ``str`` values pass through.
  - ``None`` / int / float / bool / list / dict raise HTTPException(400).
  - ``str`` subclasses raise HTTPException(400) (defense against
    markupsafe.Markup and similar).
  - The error envelope has the stable shape: error + message + field_name.
  - bytes / bytearray raise HTTPException(400) (they have ``decode``
    but not ``strip``).
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from arena.core.input_validation import _require_string


class TestRequireStringPlain:
    def test_string_passes_through(self):
        assert _require_string("hello", "name") == "hello"

    def test_empty_string_passes_through(self):
        """An empty string is still a string — passes through
        without raising (the downstream sanitizer handles the
        empty case)."""
        assert _require_string("", "name") == ""

    def test_unicode_string_passes_through(self):
        assert _require_string("ünîçødé", "name") == "ünîçødé"

    def test_whitespace_string_passes_through(self):
        """Whitespace is preserved at this layer — the downstream
        sanitizer is responsible for stripping."""
        assert _require_string("  hello  ", "name") == "  hello  "


class TestRequireStringNonString:
    def test_none_raises(self):
        with pytest.raises(HTTPException) as exc:
            _require_string(None, "name")
        assert exc.value.status_code == 400
        assert "name" in exc.value.detail["message"]

    def test_int_raises(self):
        with pytest.raises(HTTPException) as exc:
            _require_string(42, "name")
        assert exc.value.status_code == 400
        assert "name" in exc.value.detail["message"]

    def test_float_raises(self):
        with pytest.raises(HTTPException):
            _require_string(3.14, "name")

    def test_bool_raises(self):
        """A bool is technically an int subclass in Python — pin that
        ``_require_string`` rejects it. Pin the contract: the
        validator must NOT accept bools."""
        with pytest.raises(HTTPException):
            _require_string(True, "name")

    def test_list_raises(self):
        with pytest.raises(HTTPException):
            _require_string(["hello"], "name")

    def test_dict_raises(self):
        with pytest.raises(HTTPException):
            _require_string({"name": "value"}, "name")

    def test_bytes_raises(self):
        """bytes has ``decode`` but not ``strip`` — would fail
        downstream. Reject at the validator."""
        with pytest.raises(HTTPException):
            _require_string(b"hello", "name")

    def test_bytearray_raises(self):
        with pytest.raises(HTTPException):
            _require_string(bytearray(b"hello"), "name")


class TestRequireStringSubclasses:
    """Str subclasses (Markup, SafeString, etc.) must be rejected.
    A regression that accepted subclasses would let a Markup
    object slip through to ``.strip()`` — which can silently fail
    if Markup doesn't override ``__getattribute__`` for strip."""

    def test_markupsafe_markup_raises(self):
        try:
            from markupsafe import Markup
        except ImportError:
            pytest.skip("markupsafe not installed")

        # ``"<b>hi</b>"`` is a Markup object — NOT a plain str.
        # Pin the contract: the helper rejects it.
        with pytest.raises(HTTPException):
            _require_string(Markup("<b>hi</b>"), "name")

    def test_custom_str_subclass_raises(self):
        """A custom str subclass is NOT accepted."""
        class MyStr(str):
            pass

        with pytest.raises(HTTPException):
            _require_string(MyStr("hello"), "name")


class TestRequireStringErrorEnvelope:
    """Pin the error envelope shape — the frontend reads this."""

    @pytest.mark.parametrize("bad_value,expected_substr", [
        (None, "must be a string"),
        (42, "must be a string"),
        ([], "must be a string"),
        ({}, "must be a string"),
        (b"x", "must be a string"),
    ])
    def test_error_envelope_contains_field_name_and_message(
        self, bad_value, expected_substr
    ):
        with pytest.raises(HTTPException) as exc:
            _require_string(bad_value, "user_input")
        assert exc.value.status_code == 400
        # The detail has the stable contract: error code + message.
        assert exc.value.detail["error"] == "validation_error"
        assert "user_input" in exc.value.detail["message"]
        assert expected_substr in exc.value.detail["message"]

    def test_field_name_appears_in_message(self):
        """The field name MUST appear in the error message so the
        frontend can show 'invalid <field>' without parsing."""
        with pytest.raises(HTTPException) as exc:
            _require_string(None, "my_special_field")
        assert "my_special_field" in exc.value.detail["message"]


class TestRequireStringTypeContract:
    def test_returns_string_type(self):
        """The return type is always ``str``."""
        result = _require_string("hello", "name")
        assert isinstance(result, str)
        assert type(result) is str  # NOT a subclass

    def test_does_not_coerce_non_string_to_string(self):
        """A regression that converted the value via ``str(value)``
        would silently coerce ``None`` → ``"None"`` and accept
        numeric inputs as digits. Pin the strict rejection."""
        for value in (None, 42, 3.14, True, False):
            with pytest.raises(HTTPException):
                _require_string(value, "name")