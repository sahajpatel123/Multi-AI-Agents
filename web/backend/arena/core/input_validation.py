"""Input validation and sanitization utilities for security hardening."""

from __future__ import annotations

import re
from typing import Optional

from fastapi import HTTPException, status

HTML_TAG_RE = re.compile(r"<[^>]+>")
NULL_BYTE = "\x00"


def _require_string(value: object, field_name: str) -> str:
    if not isinstance(value, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be a string",
        )
    return value


def sanitize_text(text: object, max_length: int = 2000, field_name: str = "input") -> str:
    text = _require_string(text, field_name).strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} cannot be empty",
        )
    if NULL_BYTE in text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} contains invalid characters",
        )
    if len(text) > max_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} exceeds maximum length of {max_length} characters",
        )
    return text


def strip_html(text: object) -> str:
    return HTML_TAG_RE.sub("", _require_string(text, "input"))


def sanitize_html(text: object, max_length: int = 100, field_name: str = "input") -> str:
    return sanitize_text(strip_html(text), max_length=max_length, field_name=field_name)


def sanitize_optional_text(
    text: Optional[object],
    *,
    max_length: int,
    field_name: str,
    strip_tags: bool = False,
) -> Optional[str]:
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
    cleaned = HTML_TAG_RE.sub("", value)
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
