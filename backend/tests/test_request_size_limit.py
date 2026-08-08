"""Request body size ceiling — including the missing Content-Length bypass."""

from __future__ import annotations

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from arena.core.request_size import (
    RequestSizeLimitMiddleware,
    max_request_body_bytes,
    payload_too_large_message,
)


def test_max_request_body_bytes_upload_vs_default():
    assert max_request_body_bytes("/api/health") == 10 * 1024
    assert max_request_body_bytes("/api/agent/upload") == 11 * 1024 * 1024
    assert max_request_body_bytes("/api/agent/upload/") == 11 * 1024 * 1024
    assert max_request_body_bytes("/api/payments/webhook") == 1024 * 1024


def test_payload_message_for_upload():
    assert "10MB" in payload_too_large_message("/api/agent/upload")
    assert "10KB" in payload_too_large_message("/api/auth/login")
    assert "1MB" in payload_too_large_message("/api/payments/webhook")


async def _echo(request: Request):
    body = await request.body()
    return JSONResponse({"n": len(body)})


def _app(max_size: int = 64):
    app = Starlette(routes=[Route("/echo", _echo, methods=["POST"])])
    app.add_middleware(RequestSizeLimitMiddleware, max_size=max_size)
    return app


def test_content_length_over_limit_413():
    client = TestClient(_app(max_size=64))
    res = client.post(
        "/echo",
        content=b"x" * 10,
        headers={"Content-Length": "9999"},
    )
    assert res.status_code == 413
    assert res.json().get("error") == "payload_too_large"


def test_content_length_ok_passes():
    client = TestClient(_app(max_size=64))
    res = client.post("/echo", content=b"hello")
    assert res.status_code == 200
    assert res.json()["n"] == 5


def test_malformed_content_length_400():
    client = TestClient(_app(max_size=64))
    res = client.post(
        "/echo",
        content=b"hi",
        headers={"Content-Length": "not-a-number"},
    )
    assert res.status_code == 400
    assert res.json().get("error") == "invalid_content_length"


def test_missing_content_length_still_enforces_body_size():
    """Chunked / CL-less bodies must not bypass the ceiling."""
    app = _app(max_size=32)

    async def asgi_call():
        body = b"Z" * 100
        sent = {"body": body, "done": False}

        async def receive():
            if not sent["done"]:
                sent["done"] = True
                return {"type": "http.request", "body": sent["body"], "more_body": False}
            return {"type": "http.request", "body": b"", "more_body": False}

        messages = []

        async def send(message):
            messages.append(message)

        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/echo",
            "raw_path": b"/echo",
            "query_string": b"",
            "headers": [
                (b"host", b"test"),
                # deliberately no content-length
            ],
            "client": ("127.0.0.1", 123),
            "server": ("test", 80),
        }
        await app(scope, receive, send)
        return messages

    import anyio

    messages = anyio.run(asgi_call)
    start = next(m for m in messages if m["type"] == "http.response.start")
    assert start["status"] == 413
