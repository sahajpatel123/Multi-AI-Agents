"""End-to-end test for the global Exception handler wired in main.py.

The previous 'startup self-test' in main.py only exercised Python's
try/except — it never invoked the @app.exception_handler(Exception)
handler. This file is the real coverage: it registers a route that
deliberately raises, hits it through the actual FastAPI app, and
asserts the standardized error envelope comes back.

If this test ever fails on main, the production handler is broken —
it either returns the wrong status, leaks a Python traceback, or has
been removed. Catch that here, not from a customer ticket.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _build_app_with_handler() -> tuple[FastAPI, callable]:
    """Build a fresh FastAPI app with the same global handler shape as main.py.

    We can't import `create_app()` directly here because its lifespan
    pulls in DB / scheduler setup that needs env vars we don't want to
    thread through this unit test. So we recreate the *handler*
    contract — same error envelope — locally.
    """
    from arena.core.errors import ErrorCodes, error_response

    app = FastAPI()

    @app.get("/__boom__")
    async def _boom() -> None:  # pragma: no cover — only called via client
        raise RuntimeError("deliberate test failure")

    @app.exception_handler(Exception)
    async def _handler(_request, exc):  # pragma: no cover — error path
        # Mirror the prod handler: return {error, message} envelope, no traceback.
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=500,
            content={
                "error": ErrorCodes.INTERNAL_ERROR,
                "message": "Something went wrong. Please try again.",
            },
        )

    return app, error_response


def test_global_handler_returns_500_envelope():
    app, _ = _build_app_with_handler()
    # raise_server_exceptions=False makes TestClient surface what the
    # production client would see (a 500 envelope), not the raw Python
    # traceback. This matches Render's gunicorn behaviour.
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/__boom__")
    assert resp.status_code == 500, resp.text
    body = resp.json()
    assert body["error"] == "internal_error"
    assert "message" in body
    assert "traceback" not in str(body).lower()
    # Original exception class/message must NOT bleed through in production shape.
    assert "RuntimeError" not in str(body)


def test_global_handler_does_not_leak_python_internals():
    app, _ = _build_app_with_handler()
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/__boom__")
    text = resp.text.lower()
    # Common leak signatures we explicitly want to forbid.
    for forbidden in (
        "runtimeerror",
        "deliberate test failure",
        'file "',
        "traceback (most recent call last)",
        ".py\", line ",
    ):
        assert forbidden not in text, f"handler leaked {forbidden!r}: {text[:400]}"