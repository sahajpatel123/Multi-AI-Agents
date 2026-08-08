"""Request ID middleware — give every request a traceable ID.

Every HTTP response gets a stable ``X-Request-ID`` header, and the same
ID is exposed on ``request.state.request_id`` so route handlers, exception
handlers, and loggers can correlate a single request end-to-end.

The middleware accepts a caller-supplied ``X-Request-ID`` only when it is a
small printable-ASCII token. Anything else (missing, too long, control
characters, whitespace, non-ASCII) falls back to a fresh UUID4 so we never
echo attacker-controlled bytes into response headers or log files.
"""

from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware


def normalize_request_id(raw: str | None) -> str:
    """Return a safe request ID string.

    Accepts caller-supplied IDs that are at most 64 chars, ASCII, printable,
    and free of whitespace/control characters. Everything else falls back to
    a fresh UUID4.
    """
    if raw:
        candidate = raw.strip()
        if candidate and (
            len(candidate) <= 64
            and candidate.isascii()
            and all(ch.isprintable() and not ch.isspace() for ch in candidate)
        ):
            return candidate
    return str(uuid.uuid4())


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Pass-through middleware that tags every request/response with an ID."""

    async def dispatch(self, request, call_next):
        request_id = normalize_request_id(request.headers.get("X-Request-ID"))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
