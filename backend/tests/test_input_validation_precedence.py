"""Regression tests for ``sanitize_text`` / ``sanitize_html`` precedence.

The contract (see ``input_validation.py`` line 101 commentary): the
*length* error must surface even when the input contains HTML — a
misleading "your input has HTML" message on a 5,000-character input
would push the user to fix the wrong problem.

Pins:
  - Order of validation: require-string → strip → empty → null-byte →
    length → HTML. Length is checked BEFORE HTML so the user sees the
    right feedback.
  - The same precedence holds for ``sanitize_text`` (length only, no
    HTML check).
  - Both helpers raise with the same envelope shape
    (``{"error": VALIDATION_ERROR, "message": "..."}``).
  - The field name is interpolated into the message verbatim so the
    frontend can show "display_name must not contain HTML" instead of
    a generic "input must not contain HTML".
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException


class TestSanitizeText:
    def test_rejects_empty_after_strip(self):
        from arena.core.input_validation import sanitize_text
        with pytest.raises(HTTPException) as exc:
            sanitize_text("   ", max_length=100, field_name="display_name")
        assert exc.value.status_code == 400
        assert exc.value.detail["error"] == "validation_error"
        assert "display_name cannot be empty" in exc.value.detail["message"]

    def test_rejects_null_byte(self):
        from arena.core.input_validation import sanitize_text
        with pytest.raises(HTTPException) as exc:
            sanitize_text("ok\x00name", max_length=100, field_name="display_name")
        assert exc.value.status_code == 400
        assert "invalid characters" in exc.value.detail["message"]

    def test_rejects_oversize_input(self):
        from arena.core.input_validation import sanitize_text
        with pytest.raises(HTTPException) as exc:
            sanitize_text("x" * 101, max_length=100, field_name="display_name")
        assert exc.value.status_code == 400
        assert "exceeds maximum length" in exc.value.detail["message"]
        assert "100" in exc.value.detail["message"]

    def test_returns_stripped_text(self):
        from arena.core.input_validation import sanitize_text
        assert sanitize_text("  hello  ", max_length=100) == "hello"


class TestSanitizeHtmlPrecedence:
    def test_length_error_takes_precedence_over_html_error(self):
        """When the input is BOTH too long AND contains HTML, the length
        error must surface. The comment in input_validation.py:101-106
        calls out this ordering as a UX contract — pushing the user
        toward "shorten" before "remove markup" — and this test pins it."""
        from arena.core.input_validation import sanitize_html
        payload = "<b>" + ("x" * 200)  # 203 chars, contains < and >

        with pytest.raises(HTTPException) as exc:
            sanitize_html(payload, max_length=100, field_name="display_name")

        # The length message is the right feedback for this payload.
        assert exc.value.status_code == 400
        assert "exceeds maximum length" in exc.value.detail["message"]
        # And the HTML-specific phrasing must NOT appear — that would be
        # the misleading fallback we explicitly rejected.
        assert "HTML" not in exc.value.detail["message"]

    def test_rejects_empty_after_strip(self):
        from arena.core.input_validation import sanitize_html
        with pytest.raises(HTTPException) as exc:
            sanitize_html("   ", max_length=100, field_name="display_name")
        assert exc.value.status_code == 400
        assert "display_name cannot be empty" in exc.value.detail["message"]

    def test_rejects_null_byte_before_length(self):
        """Null-byte check runs before length — a malformed payload of
        any length must be rejected with the null-byte message."""
        from arena.core.input_validation import sanitize_html
        payload = "ok\x00" + ("x" * 1000)
        with pytest.raises(HTTPException) as exc:
            sanitize_html(payload, max_length=10, field_name="display_name")
        assert exc.value.status_code == 400
        assert "invalid characters" in exc.value.detail["message"]

    def test_rejects_html_chars(self):
        from arena.core.input_validation import sanitize_html
        with pytest.raises(HTTPException) as exc:
            sanitize_html("<b>bold</b>", max_length=100, field_name="display_name")
        assert exc.value.status_code == 400
        assert "must not contain HTML markup" in exc.value.detail["message"]
        assert "display_name" in exc.value.detail["message"]

    def test_rejects_gt_only(self):
        from arena.core.input_validation import sanitize_html
        with pytest.raises(HTTPException) as exc:
            sanitize_html("safe > unsafe", max_length=100, field_name="display_name")
        assert exc.value.status_code == 400

    def test_returns_plain_text_passthrough(self):
        from arena.core.input_validation import sanitize_html
        assert sanitize_html("Just plain text.", max_length=100) == "Just plain text."

    def test_strips_surrounding_whitespace_before_validation(self):
        from arena.core.input_validation import sanitize_html
        # 100-char content + leading/trailing whitespace → after strip
        # it fits the limit and passes (the helper strips before length
        # check, so the user does not get a length error for whitespace
        # they will not see rendered).
        inner = "x" * 100
        result = sanitize_html(f"  {inner}  ", max_length=100, field_name="display_name")
        assert result == inner