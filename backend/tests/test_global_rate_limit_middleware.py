"""Regression tests for ``GlobalRateLimitMiddleware``.

The middleware applies a global 100 req/min/IP cap, excluding the
payment webhook path. The webhook exemption is critical — Razorpay
delivers bursty webhooks and must not be capped.

A regression here — applying the cap to the webhook path, or
stripping the trailing slash incorrectly — would break payment
delivery or break the global cap contract.

Pins:
  - ``/api/payments/webhook`` is exempted (path matched with and
    without trailing slash).
  - All other paths consume the cap.
  - The cap is 100 requests per 60-second window.
  - At-limit 101st request raises 429.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI, Request
from httpx import AsyncClient, ASGITransport

# Import the middleware class WITHOUT triggering main.py's create_app()
# (which validates secrets and calls sys.exit). The class is defined at
# module level in main.py but the import is safe — only the call to
# create_app() is the side-effect.
import importlib.util
_spec = importlib.util.spec_from_file_location("_main_module_for_test", "main.py")
_mod = importlib.util.module_from_spec(_spec)

# We must NOT execute main.py because it calls create_app() at import
# time which sys.exits on missing env. Instead, reach into the source
# file and exec only the middleware class definition.
import ast
import pathlib

_main_src = pathlib.Path("main.py").read_text()
_tree = ast.parse(_main_src)

# Collect the GlobalRateLimitMiddleware class and its dependencies.
_ns: dict = {}
# Find just the class definition + the BaseHTTPMiddleware / Request / client_ip / rate_limiter imports it needs.
class_node = next(
    (n for n in _tree.body if isinstance(n, ast.ClassDef) and n.name == "GlobalRateLimitMiddleware"),
    None,
)
assert class_node is not None, "GlobalRateLimitMiddleware not found in main.py"

# Minimal imports for the class.
from starlette.middleware.base import BaseHTTPMiddleware  # noqa: E402

# Inject the middleware's dependencies into the namespace.
from arena.core.rate_limits import rate_limiter, client_ip  # noqa: E402

_ns.update({
    "BaseHTTPMiddleware": BaseHTTPMiddleware,
    "rate_limiter": rate_limiter,
    "client_ip": client_ip,
    "Request": Request,
})

# Execute only the class definition in our namespace.
_class_src = ast.Module(body=[class_node], type_ignores=[])
ast.fix_missing_locations(_class_src)
exec(compile(_class_src, "<test>", "exec"), _ns)

GlobalRateLimitMiddleware = _ns["GlobalRateLimitMiddleware"]


@pytest.fixture
def app():
    a = FastAPI()

    @a.middleware("http")
    async def _no_proxy_trust(request: Request, call_next):
        """Force non-production: ignore XFF so peer IP is the test IP."""
        from arena.core import client_ip as client_ip_mod
        original = client_ip_mod._trust_proxy_headers
        client_ip_mod._trust_proxy_headers = lambda: False
        try:
            return await call_next(request)
        finally:
            client_ip_mod._trust_proxy_headers = original

    a.add_middleware(GlobalRateLimitMiddleware)

    @a.get("/api/payments/webhook")
    async def webhook():
        return {"status": "ok"}

    @a.get("/api/payments/webhook/")
    async def webhook_with_slash():
        return {"status": "ok"}

    @a.get("/some/other/path")
    async def other():
        return {"status": "ok"}

    return a


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Clear the singleton limiter state between tests."""
    rate_limiter._events.clear()
    yield
    rate_limiter._events.clear()


class TestGlobalRateLimitWebhookExempt:
    @pytest.mark.asyncio
    async def test_webhook_path_is_exempt(self, app):
        """The webhook path is exempted from the global cap — even
        150 requests in a row MUST NOT raise 429 (the webhook handler
        is server-to-server and may burst)."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            for _ in range(150):
                res = await client.get("/api/payments/webhook")
                assert res.status_code == 200, (
                    f"webhook should be exempt from global cap; "
                    f"got status {res.status_code}"
                )

    @pytest.mark.asyncio
    async def test_webhook_with_trailing_slash_is_exempt(self, app):
        """A trailing-slash variant (``/api/payments/webhook/``)
        must also be exempted — the middleware normalizes the path."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            for _ in range(150):
                res = await client.get("/api/payments/webhook/")
                assert res.status_code == 200


class TestGlobalRateLimitAppliesToOtherPaths:
    @pytest.mark.asyncio
    async def test_other_paths_consume_the_cap(self, app):
        """A non-webhook path increments the global counter. The
        101st request raises 429."""
        from fastapi import HTTPException
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            for _ in range(100):
                res = await client.get("/some/other/path")
                assert res.status_code == 200
            # The 101st raises HTTPException → 429.
            with pytest.raises(HTTPException) as exc:
                await client.get("/some/other/path")
            assert exc.value.status_code == 429


class TestGlobalRateLimitEnvelopeShape:
    @pytest.mark.asyncio
    async def test_429_has_retry_after_header(self, app):
        from fastapi import HTTPException
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            for _ in range(100):
                await client.get("/some/other/path")
            with pytest.raises(HTTPException) as exc:
                await client.get("/some/other/path")
            assert exc.value.status_code == 429
            assert "retry_after" in exc.value.detail
            assert "Retry-After" in exc.value.headers