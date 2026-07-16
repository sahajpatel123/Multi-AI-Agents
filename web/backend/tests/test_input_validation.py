"""Input-validation hardening tests.

The sanitize_html / sanitize_model_html helpers previously used silent
`re.sub(r'<[^>]+>', '', text)` to drop HTML tag-shaped substrings. That's
a fail-open anti-pattern:

  - It destroys user intent (typing `Use <stdio.h>` silently becomes
    `Use .h`).
  - It mis-aligns the stored value with the user's input — any log
    capturing the stored string misleads postmortem.
  - It only matches `<...>`-shaped ASCII — null bytes, double-encoded
    brackets, zero-width chars, comment-fragmented tags all slip
    through. An attacker crafting around the strip regex wins.

This test pins the corrected behavior: every sanitize_html variant
REJECTS input containing `<` or `>` rather than transmuting it. If a
future refactor reintroduces silent stripping, this test fails.

The legacy strip_html() is preserved for backwards compat with a
WARNING-on-use, but it is explicitly NOT what's exported to fresh
callers — see input_validation.py docstring.
"""

import pytest
from fastapi import HTTPException

from arena.core import input_validation


class TestSanitizeText:
    def test_basic_text_passes_through(self):
        out = input_validation.sanitize_text("hello world", max_length=200)
        assert out == "hello world"

    def test_strips_outer_whitespace(self):
        out = input_validation.sanitize_text("   hello   ", max_length=200)
        assert out == "hello"

    def test_empty_after_strip_raises(self):
        with pytest.raises(HTTPException) as ei:
            input_validation.sanitize_text("   ", max_length=200)
        assert ei.value.status_code == 400
        assert "cannot be empty" in ei.value.detail

    def test_null_byte_rejected(self):
        with pytest.raises(HTTPException) as ei:
            input_validation.sanitize_text("ok\x00evil", max_length=200)
        assert ei.value.status_code == 400
        assert "invalid characters" in ei.value.detail

    def test_too_long_rejected(self):
        with pytest.raises(HTTPException) as ei:
            input_validation.sanitize_text("a" * 1001, max_length=1000)
        assert ei.value.status_code == 400
        assert "exceeds maximum length" in ei.value.detail

    def test_non_string_raises(self):
        with pytest.raises(HTTPException):
            input_validation.sanitize_text([], max_length=200)


class TestSanitizeHtmlRejectsInsteadOfStrips:
    """The new contract: HTML markup is REJECTED, not silently stripped."""

    def test_script_tag_rejected_with_400(self):
        with pytest.raises(HTTPException) as ei:
            input_validation.sanitize_html("<script>alert(1)</script>", max_length=200)
        assert ei.value.status_code == 400
        assert "HTML markup" in ei.value.detail

    def test_lone_open_angle_rejected(self):
        with pytest.raises(HTTPException) as ei:
            input_validation.sanitize_html("hello <world", max_length=200)
        assert ei.value.status_code == 400
        assert "HTML markup" in ei.value.detail

    def test_lone_close_angle_rejected(self):
        with pytest.raises(HTTPException) as ei:
            input_validation.sanitize_html("hello world>", max_length=200)
        assert ei.value.status_code == 400
        assert "HTML markup" in ei.value.detail

    def test_angle_in_code_snippet_rejected(self):
        # The original silent-strip mishap: a user referencing <stdio.h>
        # in a domain field used to silently become "stdio.h" without
        # any error. The new contract raises when the input contains
        # an actual '<' or '>'.
        with pytest.raises(HTTPException) as ei:
            input_validation.sanitize_html(
                "Use <stdio.h> for I/O", max_length=200, field_name="expertise_domain"
            )
        assert ei.value.status_code == 400

    def test_dot_in_text_still_passes(self):
        # Punctuation like '.' is fine; the rejection only fires on
        # literal HTML brackets. A regression that overshoots and
        # rejects dots would break usernames like "jane.doe".
        out = input_validation.sanitize_html(
            "Use stdio.h for I/O", max_length=200, field_name="expertise_domain"
        )
        assert out == "Use stdio.h for I/O"

    def test_plain_text_still_passes(self):
        out = input_validation.sanitize_html("hello world", max_length=200)
        assert out == "hello world"

    def test_html_check_runs_after_length_check(self):
        # If the input is BOTH too long AND contains HTML, the length
        # error surfaces first so the user knows what to fix first.
        with pytest.raises(HTTPException) as ei:
            input_validation.sanitize_html(
                "<x>" + ("a" * 1000), max_length=100
            )
        assert ei.value.status_code == 400
        assert "exceeds maximum length" in ei.value.detail


class TestSanitizeModelHtmlRejects:
    def test_script_rejected_with_value_error(self):
        with pytest.raises(ValueError, match="HTML markup"):
            input_validation.sanitize_model_html(
                "<script>alert(1)</script>",
                max_length=200,
                field_name="name",
            )

    def test_angle_in_field_rejected(self):
        with pytest.raises(ValueError, match="HTML markup"):
            input_validation.sanitize_model_html(
                "Hello<World>",
                max_length=200,
                field_name="display_name",
            )

    def test_plain_text_still_passes(self):
        out = input_validation.sanitize_model_html(
            "Jane Doe", max_length=100, field_name="name"
        )
        assert out == "Jane Doe"


class TestStripHtmlDeprecated:
    """strip_html() is preserved for backwards compat but logs a warning
    on use. New code should reach for sanitize_html / sanitize_model_html
    which reject.

    These tests pin the legacy function's behavior so it doesn't
    silently change semantics during unrelated refactors.
    """

    def test_still_silently_strips_with_warning(self):
        # Direct log-handler capture — pytest's caplog is shadowed by
        # other tests that touch the same logger in this run.
        import logging as _logging
        records = []

        class _Capture(_logging.Handler):
            def emit(self, record):  # pragma: no cover - trivial
                records.append(record)

        logger = _logging.getLogger("arena.core.input_validation")
        handler = _Capture(_logging.WARNING)
        logger.addHandler(handler)
        try:
            out = input_validation.strip_html("<b>hello</b> world")
        finally:
            logger.removeHandler(handler)
        assert out == "hello world"
        assert any(
            "silent strip is a fail-open anti-pattern" in rec.getMessage()
            for rec in records
        ), f"expected strip_html WARNING; got: {[r.getMessage() for r in records]}"


class TestOptionalHelpers:
    def test_optional_text_none_passes_through(self):
        assert (
            input_validation.sanitize_optional_text(
                None, max_length=10, field_name="x"
            )
            is None
        )

    def test_optional_text_string_validates(self):
        out = input_validation.sanitize_optional_text(
            "hi", max_length=10, field_name="x"
        )
        assert out == "hi"

    def test_model_optional_html_none_passes_through(self):
        assert (
            input_validation.sanitize_model_optional_html(
                None, max_length=10, field_name="x"
            )
            is None
        )

    def test_model_optional_html_string_rejects_html(self):
        with pytest.raises(ValueError, match="HTML markup"):
            input_validation.sanitize_model_optional_html(
                "<x>", max_length=10, field_name="y"
            )
