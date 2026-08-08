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

strip_html() was the silent-strip helper; after all callers migrated
to reject helpers it now raises NotImplementedError so new call sites
cannot reintroduce fail-open stripping.
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
        assert ei.value.detail["error"] == "validation_error"
        assert "cannot be empty" in ei.value.detail["message"]

    def test_null_byte_rejected(self):
        with pytest.raises(HTTPException) as ei:
            input_validation.sanitize_text("ok\x00evil", max_length=200)
        assert ei.value.status_code == 400
        assert ei.value.detail["error"] == "validation_error"
        assert "invalid characters" in ei.value.detail["message"]

    def test_too_long_rejected(self):
        with pytest.raises(HTTPException) as ei:
            input_validation.sanitize_text("a" * 1001, max_length=1000)
        assert ei.value.status_code == 400
        assert ei.value.detail["error"] == "validation_error"
        assert "exceeds maximum length" in ei.value.detail["message"]

    def test_non_string_raises(self):
        with pytest.raises(HTTPException):
            input_validation.sanitize_text([], max_length=200)


class TestSanitizeHtmlRejectsInsteadOfStrips:
    """The new contract: HTML markup is REJECTED, not silently stripped."""

    def test_script_tag_rejected_with_400(self):
        with pytest.raises(HTTPException) as ei:
            input_validation.sanitize_html("<script>alert(1)</script>", max_length=200)
        assert ei.value.status_code == 400
        assert ei.value.detail["error"] == "validation_error"
        assert "HTML markup" in ei.value.detail["message"]

    def test_lone_open_angle_rejected(self):
        with pytest.raises(HTTPException) as ei:
            input_validation.sanitize_html("hello <world", max_length=200)
        assert ei.value.status_code == 400
        assert ei.value.detail["error"] == "validation_error"
        assert "HTML markup" in ei.value.detail["message"]

    def test_lone_close_angle_rejected(self):
        with pytest.raises(HTTPException) as ei:
            input_validation.sanitize_html("hello world>", max_length=200)
        assert ei.value.status_code == 400
        assert ei.value.detail["error"] == "validation_error"
        assert "HTML markup" in ei.value.detail["message"]

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
        assert ei.value.detail["error"] == "validation_error"
        assert "exceeds maximum length" in ei.value.detail["message"]


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


class TestStripHtmlRemoved:
    """strip_html() was the fail-open silent-strip helper. After iter-16
    migrated every caller to the reject path, iter-17 made strip_html
    raise NotImplementedError so any future caller explodes loudly
    instead of silently changing user input.
    """

    def test_strip_html_raises_with_explanatory_message(self):
        with pytest.raises(NotImplementedError, match="fail-open anti-pattern"):
            input_validation.strip_html("<b>hello</b>")

    def test_strip_html_message_directs_caller_to_replacement(self):
        # The error message must point callers at the actual replacement
        # so they don't have to grep for it.
        with pytest.raises(NotImplementedError) as ei:
            input_validation.strip_html("anything")
        msg = str(ei.value)
        assert "sanitize_html" in msg
        assert "html.escape" in msg


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

    def test_optional_text_strip_tags_true_rejects_html(self):
        # Historical name "strip_tags" must NOT silently strip — reject.
        with pytest.raises(HTTPException) as ei:
            input_validation.sanitize_optional_text(
                "hi <b>x</b>",
                max_length=50,
                field_name="note",
                strip_tags=True,
            )
        assert ei.value.status_code == 400
        assert ei.value.detail["error"] == "validation_error"
        assert "HTML markup" in ei.value.detail["message"]

    def test_optional_text_strip_tags_true_allows_plain(self):
        out = input_validation.sanitize_optional_text(
            "plain note",
            max_length=50,
            field_name="note",
            strip_tags=True,
        )
        assert out == "plain note"

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
