"""Tests for request-ID correlation helper.

Routes reuse the middleware-set ``request.state.request_id`` so the
``X-Request-ID`` a client sees is the same ID stored in usage records, logs,
and stream events. When the middleware is absent, they fall back to a fresh
UUID.
"""

from __future__ import annotations

import uuid

from starlette.requests import Request

from arena.core.observability import correlation_request_id


def _request_with_state(request_id: str | None):
    scope = {"type": "http", "method": "GET", "path": "/api/prompt", "headers": []}
    request = Request(scope)
    if request_id is not None:
        request.state.request_id = request_id
    return request


def test_uses_middleware_request_id_when_present():
    request = _request_with_state("trace-123")
    assert correlation_request_id(request) == "trace-123"


def test_falls_back_to_fresh_uuid_when_middleware_absent():
    request = _request_with_state(None)
    rid = correlation_request_id(request)
    uuid.UUID(rid)


def test_falls_back_to_fresh_uuid_when_state_blank():
    request = _request_with_state("")
    rid = correlation_request_id(request)
    uuid.UUID(rid)
