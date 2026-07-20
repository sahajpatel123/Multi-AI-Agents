"""Input validation and sanitization utilities for security hardening.

Design note — sanitization philosophy
------------------------------------
Every helper in this module REJECTS invalid input rather than silently
transmuting it. Silent "fixing" of user input is a fail-open pattern:

  - It destroys the user's intent (a user typing `Use <stdio.h>` in a
    code question gets `Use .h` back, with no error, and thinks the
    system stored what they typed).
  - It mis-aligns logs and audits (the recorded value is not the
    submitted value).
  - It encourages attackers — a regex strip that misses a single
    encoding variant is an XSS hole. A strict reject is uniform
    across encoding variations: any `<` or `>` shape either matches
    the regex (and is rejected) or doesn't, but in neither case is it
    silently passed through as something different.

If a future caller truly needs to render user HTML, the caller must
opt into that explicitly via `html_module.escape(...)` at the
rendering site, not via a silent-strip helper here.
"""

from __future__ import annotations

import re
from typing import Optional

from fastapi import HTTPException, status

from arena.core.errors import ErrorCodes

# Reject any text containing `<` or `>` — stricter than tag-shaped
# patterns so encoding variants and half-tags cannot slip through.
HTML_CHAR_RE = re.compile(r"[<>]")
NULL_BYTE = "\x00"


def _require_string(value: object, field_name: str) -> str:
    if not isinstance(value, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": ErrorCodes.VALIDATION_ERROR, "message": f"{field_name} must be a string"},
        )
    return value


def sanitize_text(text: object, max_length: int = 2000, field_name: str = "input") -> str:
    text = _require_string(text, field_name).strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": ErrorCodes.VALIDATION_ERROR, "message": f"{field_name} cannot be empty"},
        )
    if NULL_BYTE in text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": ErrorCodes.VALIDATION_ERROR, "message": f"{field_name} contains invalid characters"},
        )
    if len(text) > max_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": ErrorCodes.VALIDATION_ERROR, "message": f"{field_name} exceeds maximum length of {max_length} characters"},
        )
    return text


def strip_html(text: object) -> str:
    """REMOVED. Silent HTML stripping is a fail-open anti-pattern.

    iter-16 migrated every caller to `sanitize_html` / `sanitize_model_html`
    which REJECT markup. The legacy strip helper is now a hard error so
    any future code that reaches for it gets a loud failure instead of
    silently changing the user's input.

    If you genuinely need to render user HTML, escape at the render site
    using a standard HTML-escape helper (e.g. `html.escape`). Do NOT
    silently strip characters out of stored data.
    """
    raise NotImplementedError(
        "input_validation.strip_html was removed in iter-17: silent "
        "HTML stripping is a fail-open anti-pattern that destroyed user "
        "intent and mismatched stored vs. submitted values. Use "
        "sanitize_html / sanitize_model_html (reject) or html.escape "
        "at the render site."
    )


def _assert_no_html_chars(text: str, field_name: str, raise_with) -> None:
    """Reject text containing `<` or `>`. Used by the sanitize_html family
    so display-name-ish fields cannot smuggle markup past the validator.
    """
    if HTML_CHAR_RE.search(text):
        raise_with(
            f"{field_name} must not contain HTML markup (< or >); "
            f"if you need to display special characters use a "
            f"plain-text rendering path."
        )


def sanitize_html(text: object, max_length: int = 100, field_name: str = "input") -> str:
    # Validate shape + length FIRST (this raises for strings > max_length,
    # null bytes, etc.). Then reject HTML. Order matters because we want
    # the *length* error to surface even when the input contains HTML —
    # returning a length error makes a feedback form suggest "shorten
    # your input" instead of "your input has HTML", which is misleading.
    text = _require_string(text, field_name)
    text = text.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": ErrorCodes.VALIDATION_ERROR, "message": f"{field_name} cannot be empty"},
        )
    if NULL_BYTE in text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": ErrorCodes.VALIDATION_ERROR, "message": f"{field_name} contains invalid characters"},
        )
    if len(text) > max_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": ErrorCodes.VALIDATION_ERROR, "message": f"{field_name} exceeds maximum length of {max_length} characters"},
        )

    def _raise_http(msg: str) -> None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": ErrorCodes.VALIDATION_ERROR, "message": msg},
        )

    _assert_no_html_chars(text, field_name, _raise_http)
    return text


def sanitize_optional_text(
    text: Optional[object],
    *,
    max_length: int,
    field_name: str,
    strip_tags: bool = False,
) -> Optional[str]:
    """Optional free-text sanitizer.

    ``strip_tags`` is a historical name. When True it no longer silently
    strips markup — it routes through ``sanitize_html`` which REJECTS
    ``<`` / ``>``. Callers that pass ``strip_tags=True`` therefore get
    fail-closed behavior instead of a no-op that looked like protection.
    """
    if text is None:
        return None
    if strip_tags:
        return sanitize_html(text, max_length=max_length, field_name=field_name)
    return sanitize_text(text, max_length=max_length, field_name=field_name)


def sanitize_model_text(value: object, *, max_length: int, field_name: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    value = value.strip()
    if not value:
        raise ValueError(f"{field_name} cannot be empty")
    if NULL_BYTE in value:
        raise ValueError(f"{field_name} contains invalid characters")
    if len(value) > max_length:
        raise ValueError(f"{field_name} is too long")
    return value


def sanitize_model_optional_text(
    value: object,
    *,
    max_length: int,
    field_name: str,
) -> Optional[str]:
    if value is None:
        return None
    return sanitize_model_text(value, max_length=max_length, field_name=field_name)


def sanitize_model_html(value: object, *, max_length: int, field_name: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    cleaned = value.strip()

    def _raise_value(msg: str) -> None:
        raise ValueError(msg)

    _assert_no_html_chars(cleaned, field_name, _raise_value)
    return sanitize_model_text(cleaned, max_length=max_length, field_name=field_name)


def sanitize_model_optional_html(
    value: object,
    *,
    max_length: int,
    field_name: str,
) -> Optional[str]:
    if value is None:
        return None
    return sanitize_model_html(value, max_length=max_length, field_name=field_name)
