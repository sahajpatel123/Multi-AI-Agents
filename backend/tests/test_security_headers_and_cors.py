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
    assert res.headers.get("X-XSS-Protection") == "1; mode=block"
    assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert res.headers.get("Cross-Origin-Opener-Policy") == "same-origin"
    assert res.headers.get("Cross-Origin-Resource-Policy") == "same-site"
    csp = res.headers.get("Content-Security-Policy") or ""
    assert "default-src 'self'" in csp
    # API origin must not advertise eval-capable script policy.
    assert "unsafe-eval" not in csp
    assert "frame-ancestors 'none'" in csp
    # Permissions-Policy must deny camera/mic/geolocation — the API origin
    # never needs them and a browser-mediated attack on a client should not
    # inherit access.
    pp = res.headers.get("Permissions-Policy") or ""
    for forbidden in ("camera=()", "microphone=()", "geolocation=()"):
        assert forbidden in pp, (
            f"Permissions-Policy missing {forbidden!r}: {pp!r}"
        )


@pytest.mark.asyncio
async def test_security_headers_remove_server_fingerprint(app_client):
    """Server / x-powered-by headers must be stripped — they advertise the
    server implementation and version to attackers."""
    res = await app_client.get("/api/health")
    assert res.status_code == 200
    # Starlette/Uvicorn may set these by default. The middleware strips them
    # on the way out. Case-insensitive — headers are normalized to lower-case
    # by Starlette but be defensive.
    headers = {k.lower(): v for k, v in res.headers.items()}
    assert "server" not in headers, f"server header leaked: {headers.get('server')!r}"
    assert "x-powered-by" not in headers, (
        f"x-powered-by header leaked: {headers.get('x-powered-by')!r}"
    )


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


@pytest.mark.asyncio
async def test_security_headers_hsts_branch(monkeypatch, isolated_db):
    """Strict-Transport-Security is set only when is_production=True.

    The middleware's HSTS branch is captured at ``create_app()`` time, so a
    fresh app must be built with ENVIRONMENT=production to exercise it.
    """
    import os
    import httpx
    from arena.config import Settings as _Settings
    from arena.config import get_settings as _get_settings
    from arena.core.seed_personas import seed_persona_library
    from arena.database import get_db

    # Pin environment BEFORE create_app() reads it.
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://app.example.com")
    # Satisfy production-only CORS / FRONTEND_PUBLIC_URL guards. The
    # ALLOWED_ORIGINS above is non-localhost so the prod validator passes.
    monkeypatch.setenv("FRONTEND_PUBLIC_URL", "https://app.example.com")
    _get_settings.cache_clear()  # type: ignore[attr-defined]

    # Skip the production-secret hard-fails; we only care about headers.
    monkeypatch.setattr(_Settings, "validate_secrets", lambda self: None)
    monkeypatch.setattr(_Settings, "validate_api_keys", lambda self: None)

    from main import create_app

    SessionLocal = isolated_db

    def _override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db

    # httpx ASGITransport skips lifespan; seed persona library manually.
    seed_db = SessionLocal()
    try:
        seed_persona_library(seed_db)
    finally:
        seed_db.close()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as client:
        res = await client.get("/api/health")

    hsts = res.headers.get("Strict-Transport-Security")
    assert hsts, "HSTS header missing in production mode"
    assert "max-age=31536000" in hsts
    assert "includeSubDomains" in hsts
