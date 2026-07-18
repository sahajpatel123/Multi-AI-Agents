"""Standardized error response helpers for consistent API error formatting."""

from fastapi import HTTPException, status
from typing import Optional, Dict, Any


class ApiError(Exception):
    """Standard API error with structured detail."""

    def __init__(
        self,
        error_code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        extra: Optional[Dict[str, Any]] = None,
    ):
        self.error_code = error_code
        self.message = message
        self.status_code = status_code
        self.extra = extra or {}
        super().__init__(message)

    def to_http_exception(self) -> HTTPException:
        detail = {"error": self.error_code, "message": self.message}
        detail.update(self.extra)
        return HTTPException(status_code=self.status_code, detail=detail)


def error_response(
    error_code: str,
    message: str,
    status_code: int = status.HTTP_400_BAD_REQUEST,
    **extra,
) -> HTTPException:
    """Create a standardized HTTPException with consistent error format.

    Format: {"error": "<code>", "message": "<human-readable>", ...extra}
    """
    detail = {"error": error_code, "message": message}
    detail.update(extra)
    return HTTPException(status_code=status_code, detail=detail)


# Common error codes for consistency
class ErrorCodes:
    # Auth errors
    EMAIL_EXISTS = "email_exists"
    INVALID_CREDENTIALS = "invalid_credentials"
    TOKEN_EXPIRED = "token_expired"
    TOKEN_REVOKED = "token_revoked"
    INVALID_TOKEN = "invalid_token"
    WEAK_PASSWORD = "weak_password"
    PASSWORD_SAME = "password_same"

    # Rate limiting
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"

    # Tier/feature gating
    FEATURE_NOT_ALLOWED = "feature_not_allowed"
    UPGRADE_REQUIRED = "upgrade_required"

    # Not found
    NOT_FOUND = "not_found"

    # Validation
    VALIDATION_ERROR = "validation_error"
    INVALID_PERSONA = "invalid_persona"
    INVALID_AGENT_ID = "invalid_agent_id"

    # Generic
    INTERNAL_ERROR = "internal_error"
    REQUEST_FAILED = "request_failed"
    SERVICE_UNAVAILABLE = "service_unavailable"
