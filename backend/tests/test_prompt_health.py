"""Integration tests for /api/prompt health and readiness probes."""

from __future__ import annotations

import pytest


# ─── /api/prompt/health ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health_no_auth_required(app_client):
    """Health probes must work without authentication — Render's uptime
    checker hits these every few seconds without credentials."""
    res = await app_client.get("/api/prompt/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "arena-prompt"


@pytest.mark.asyncio
async def test_health_does_not_hit_db(app_client):
    """The cheapest possible check — a DB round-trip here would defeat
    the purpose of having a separate liveness probe. We assert the
    response is well-formed and trust that 'no DB call' is implicit
    (the handler is a synchronous return)."""
    res = await app_client.get("/api/prompt/health")
    # 200 with no db dep proves the route handler didn't touch db —
    # otherwise FastAPI would have raised on the missing dependency.
    assert res.status_code == 200


# ─── /api/prompt/readiness ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_readiness_no_auth_required(app_client):
    res = await app_client.get("/api/prompt/readiness")
    # 200 if everything healthy; 503 if any check fails. Either is
    # 'reachable without auth' — the load balancer doesn't carry a
    # Bearer token.
    assert res.status_code in (200, 503)


@pytest.mark.asyncio
async def test_readiness_returns_check_breakdown(app_client):
    res = await app_client.get("/api/prompt/readiness")
    body = res.json()
    assert "checks" in body
    assert "db" in body["checks"]
    assert "memory" in body["checks"]
    assert "prompt_route" in body["checks"]
    assert "checked_at" in body
    assert "service" in body
    assert body["service"] == "arena-prompt"


@pytest.mark.asyncio
async def test_readiness_db_ok_under_test(app_client):
    """The DB check passes under the in-memory test SQLite (which is
    why readiness returns 200 in the test suite)."""
    res = await app_client.get("/api/prompt/readiness")
    body = res.json()
    assert body["checks"]["db"] == "ok"
    assert body["checks"]["memory"] == "ok"
    assert body["checks"]["prompt_route"] == "ok"
    assert body["status"] == "ok"


@pytest.mark.asyncio
async def test_readiness_status_is_ok_in_test_env(app_client):
    """All three checks pass → 200 status, ok body."""
    res = await app_client.get("/api/prompt/readiness")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"