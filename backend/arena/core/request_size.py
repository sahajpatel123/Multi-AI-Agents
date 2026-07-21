"""Per-path request body ceilings + size-limit middleware.

Defends both declared Content-Length overages and the historical bypass
where clients omit Content-Length (chunked / CL-less) and stream an
arbitrary body.
"""

from __future__ import annotations

import logging
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

DEFAULT_MAX_BODY_BYTES = 10 * 1024
UPLOAD_MAX_BODY_BYTES = 11 * 1024 * 1024  # 10MB file + multipart overhead
# Razorpay webhook entities can exceed the default 10KB API cap, but must
# still be bounded — unbounded bodies are a memory DoS vector.
WEBHOOK_MAX_BODY_BYTES = 1024 * 1024  # 1 MB


def max_request_body_bytes(path: str, default_max: int = DEFAULT_MAX_BODY_BYTES) -> int:
    """Return the max allowed body size for a request path."""
    p = (path or "").rstrip("/")
    if p.endswith("/api/agent/upload"):
        return UPLOAD_MAX_BODY_BYTES
    if p.endswith("/api/payments/webhook"):
        return WEBHOOK_MAX_BODY_BYTES
    return default_max


def payload_too_large_message(path: str) -> str:
    p = (path or "").rstrip("/")
    if p.endswith("/api/agent/upload"):
        return "File too large (max 10MB)"
    if p.endswith("/api/payments/webhook"):
        return "Webhook payload too large (max 1MB)"
    return "Request too large. Maximum 10KB allowed."


def is_body_method(method: str) -> bool:
    """Methods that may carry a request body we must size-check."""
    return (method or "").upper() in ("POST", "PUT", "PATCH", "DELETE")


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject request bodies that exceed the per-path byte ceiling."""

    def __init__(self, app, max_size: int = DEFAULT_MAX_BODY_BYTES):
        super().__init__(app)
        self.max_size = max_size

    async def dispatch(self, request: Request, call_next):
        path = request.url.path.rstrip("/")
        # Skip size check for OPTIONS preflight and non-body methods
        if request.method == "OPTIONS" or not is_body_method(request.method):
            return await call_next(request)

        max_allowed = max_request_body_bytes(path, self.max_size)
        content_length = request.headers.get("content-length")
        if content_length is not None and content_length != "":
            try:
                length = int(content_length)
            except (ValueError, TypeError):
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": "invalid_content_length",
                        "message": "Malformed Content-Length header.",
                    },
                )
            if length < 0:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": "invalid_content_length",
                        "message": "Malformed Content-Length header.",
                    },
                )
            if length > max_allowed:
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": "payload_too_large",
                        "message": payload_too_large_message(path),
                    },
                )
            return await call_next(request)

        # No Content-Length: enforce by reading the body (cached by Starlette).
        try:
            body = await request.body()
        except Exception:
            logger.warning("Failed to read request body for size check", exc_info=True)
            return JSONResponse(
                status_code=400,
                content={
                    "error": "invalid_body",
                    "message": "Could not read request body.",
                },
            )
        if len(body) > max_allowed:
            return JSONResponse(
                status_code=413,
                content={
                    "error": "payload_too_large",
                    "message": payload_too_large_message(path),
                },
            )
        return await call_next(request)
