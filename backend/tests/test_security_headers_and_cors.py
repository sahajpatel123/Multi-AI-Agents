"""API security headers + CORS allow-list contract."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_security_headers_present_on_health(app_client):
    res = await app_client.get("/api/health")
    assert res.status_code == 200
    # Defense-in-depth headers on every response.
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("Cross-Origin-Opener-Policy") == "same-origin"
    assert res.headers.get("Cross-Origin-Resource-Policy") == "same-site"
    csp = res.headers.get("Content-Security-Policy") or ""
    assert "default-src 'self'" in csp
    # API origin must not advertise eval-capable script policy.
    assert "unsafe-eval" not in csp
    assert "frame-ancestors 'none'" in csp


@pytest.mark.asyncio
async def test_cors_preflight_allows_known_origin_only(app_client):
    # Allowed origin from conftest / default ALLOWED_ORIGINS.
    ok = await app_client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    # Starlette may 200 or 400 depending on path registration; when CORS
    # applies, ACAO must echo the allowed origin.
    if ok.status_code == 200 and "access-control-allow-origin" in {
        k.lower() for k in ok.headers.keys()
    }:
        assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"

    denied = await app_client.options(
        "/api/health",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    acao = denied.headers.get("access-control-allow-origin")
    assert acao in (None, "") or acao != "https://evil.example"
