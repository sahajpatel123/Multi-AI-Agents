"""Tests for prompt-route request-ID correlation.

The prompt routes now reuse the middleware-set ``request.state.request_id`` so
the ``X-Request-ID`` a client sees is the same ID stored in usage records and
logs. When the middleware is absent, they fall back to a fresh UUID.
"""

from __future__ import annotations

import uuid

from starlette.requests import Request

from arena.routes.prompt import _correlation_request_id


def _request_with_state(request_id: str | None):
    scope = {"type": "http", "method": "GET", "path": "/api/prompt", "headers": []}
    request = Request(scope)
    if request_id is not None:
        request.state.request_id = request_id
    return request


def test_uses_middleware_request_id_when_present():
    request = _request_with_state("trace-123")
    assert _correlation_request_id(request) == "trace-123"


def test_falls_back_to_fresh_uuid_when_middleware_absent():
    request = _request_with_state(None)
    rid = _correlation_request_id(request)
    uuid.UUID(rid)


def test_falls_back_to_fresh_uuid_when_state_blank():
    request = _request_with_state("")
    rid = _correlation_request_id(request)
    uuid.UUID(rid)
