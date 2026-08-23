"""Tests for ``arena.core.request_id`` middleware.

Pins:
  - Every response carries an ``X-Request-ID`` header.
  - ``request.state.request_id`` is populated for route handlers.
  - A safe caller-supplied ``X-Request-ID`` is echoed back exactly.
  - Unsafe caller-supplied IDs (too long, whitespace, control chars,
    non-ASCII) fall back to a fresh UUID4 instead of being echoed.
"""

from __future__ import annotations

import uuid

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from arena.core.request_id import RequestIDMiddleware, normalize_request_id


async def _echo_state(request: Request) -> JSONResponse:
    return JSONResponse({"request_id": request.state.request_id})


def _app() -> Starlette:
    app = Starlette(routes=[Route("/echo", _echo_state, methods=["GET"])])
    app.add_middleware(RequestIDMiddleware)
    return app


class TestNormalizeRequestId:
    def test_none_falls_back_to_uuid(self):
        rid = normalize_request_id(None)
        uuid.UUID(rid)
        assert len(rid) == 36

    def test_blank_falls_back_to_uuid(self):
        rid = normalize_request_id("   ")
        uuid.UUID(rid)

    def test_safe_token_preserved(self):
        assert normalize_request_id("req-123_abc.xyz") == "req-123_abc.xyz"

    def test_whitespace_trimmed_and_preserved(self):
        assert normalize_request_id("  abc-123  ") == "abc-123"

    def test_inner_whitespace_rejected(self):
        rid = normalize_request_id("abc 123")
        uuid.UUID(rid)

    def test_control_chars_rejected(self):
        for raw in ("bad\r\ninject", "tab\there", "ctl\x00"):
            rid = normalize_request_id(raw)
            uuid.UUID(rid)

    def test_overlong_rejected(self):
        rid = normalize_request_id("x" * 65)
        uuid.UUID(rid)

    def test_non_ascii_rejected(self):
        rid = normalize_request_id("héllo")
        uuid.UUID(rid)


class TestRequestIDMiddleware:
    def test_response_always_has_request_id(self):
        client = TestClient(_app())
        res = client.get("/echo")
        assert res.status_code == 200
        assert res.headers["X-Request-ID"]

    def test_generated_id_is_uuid_and_matches_state(self):
        client = TestClient(_app())
        res = client.get("/echo")
        rid = res.headers["X-Request-ID"]
        uuid.UUID(rid)
        assert res.json()["request_id"] == rid

    def test_safe_caller_id_is_echoed(self):
        client = TestClient(_app())
        res = client.get("/echo", headers={"X-Request-ID": "client-trace-1"})
        assert res.headers["X-Request-ID"] == "client-trace-1"
        assert res.json()["request_id"] == "client-trace-1"

    def test_unsafe_caller_id_is_replaced(self):
        client = TestClient(_app())
        res = client.get("/echo", headers={"X-Request-ID": "bad\r\ninject"})
        rid = res.headers["X-Request-ID"]
        uuid.UUID(rid)
        assert res.json()["request_id"] == rid

    def test_distinct_requests_get_distinct_generated_ids(self):
        client = TestClient(_app())
        first = client.get("/echo").headers["X-Request-ID"]
        second = client.get("/echo").headers["X-Request-ID"]
        assert first != second
