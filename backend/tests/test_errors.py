"""Unit tests for arena.core.errors — structured API error helpers."""

from __future__ import annotations

from fastapi import HTTPException, status

from arena.core.errors import ApiError, ErrorCodes, error_response


def test_api_error_to_http_exception_shape():
    err = ApiError(
        error_code=ErrorCodes.INVALID_CREDENTIALS,
        message="Bad credentials",
        status_code=status.HTTP_401_UNAUTHORIZED,
        extra={"retry_after": 0},
    )
    http = err.to_http_exception()
    assert isinstance(http, HTTPException)
    assert http.status_code == 401
    assert http.detail == {
        "error": "invalid_credentials",
        "message": "Bad credentials",
        "retry_after": 0,
    }


def test_api_error_default_status_and_empty_extra():
    err = ApiError("validation_error", "nope")
    http = err.to_http_exception()
    assert http.status_code == 400
    assert http.detail == {"error": "validation_error", "message": "nope"}


def test_error_response_merges_kwargs():
    http = error_response(
        ErrorCodes.RATE_LIMIT_EXCEEDED,
        "Slow down",
        status_code=429,
        retry_after=12,
        scope="agent_run",
    )
    assert http.status_code == 429
    assert http.detail["error"] == "rate_limit_exceeded"
    assert http.detail["message"] == "Slow down"
    assert http.detail["retry_after"] == 12
    assert http.detail["scope"] == "agent_run"


def test_error_codes_constants_are_stable_strings():
    # Pin the public contract other modules import by name.
    assert ErrorCodes.EMAIL_EXISTS == "email_exists"
    assert ErrorCodes.FEATURE_NOT_ALLOWED == "feature_not_allowed"
    assert ErrorCodes.NOT_FOUND == "not_found"
    assert ErrorCodes.INTERNAL_ERROR == "internal_error"
