"""Health endpoint disclosure audit.

/api/health is the only completely-unauthenticated read endpoint in the
backend. Render's readiness probe, external uptime monitors, and any
attacker can hit it without credentials. The response must NOT leak:
  - app version (correlates with release windows)
  - uptime_seconds (correlates with restart / deploy times)
  - total_requests_today (competitive intelligence)

Those fields are exposed only via /api/health/detailed, which requires
a valid bearer token. The /api/health/detailed endpoint itself returns
401 to unauthenticated callers — protecting uptime from fingerprinting
even by an attacker who knows the route name exists.
"""

import pytest


class TestPublicHealth:
    """GET /api/health — unauthenticated, minimal."""

    @pytest.mark.asyncio
    async def test_public_health_only_exposes_safe_fields(
        self, app_client, isolated_db
    ):
        res = await app_client.get("/api/health")
        assert res.status_code == 200
        body = res.json()
        # The two fields a load balancer / Render probe actually need.
        assert set(body.keys()) == {"status", "database"}
        assert body["status"] in {"healthy", "degraded"}
        assert body["database"] in {"connected", "disconnected"}

    @pytest.mark.asyncio
    async def test_public_health_never_returns_version_or_uptime(
        self, app_client, isolated_db
    ):
        # Defensive: even if the implementation changes the schema, these
        # fields must stay OUT of the unauthenticated response.
        res = await app_client.get("/api/health")
        assert res.status_code == 200
        body = res.json()
        for sensitive in ("version", "uptime_seconds", "total_requests_today"):
            assert sensitive not in body, (
                f"unauthenticated /api/health must not leak {sensitive!r}; "
                f"got {sorted(body.keys())}"
            )


class TestDetailedHealth:
    """GET /api/health/detailed — authenticated, full."""

    @pytest.mark.asyncio
    async def test_detailed_requires_auth(self, app_client, isolated_db):
        res = await app_client.get("/api/health/detailed")
        assert res.status_code == 401

    @pytest.mark.asyncio
    async def test_detailed_with_auth_exposes_operational_fields(
        self, app_client, auth_headers, isolated_db
    ):
        headers = auth_headers()
        res = await app_client.get("/api/health/detailed", headers=headers)
        assert res.status_code == 200
        body = res.json()
        # Authenticated callers see the operational panel.
        for required in ("status", "database", "version", "uptime_seconds",
                         "worker_pid"):
            assert required in body, (
                f"authenticated /api/health/detailed must include {required!r}; "
                f"got {sorted(body.keys())}"
            )
        assert isinstance(body["uptime_seconds"], int)
        assert body["uptime_seconds"] >= 0
        assert isinstance(body["worker_pid"], int)

    @pytest.mark.asyncio
    async def test_detailed_does_not_expose_per_process_request_counter(
        self, app_client, auth_headers, isolated_db
    ):
        # Per-worker in-memory counters misrepresented cross-worker traffic.
        # The contract is: do not surface any field that pretends to be a
        # global request count when it is really one worker's count.
        headers = auth_headers()
        res = await app_client.get("/api/health/detailed", headers=headers)
        assert res.status_code == 200
        body = res.json()
        for sensitive in ("total_requests_today", "request_count",
                          "requests_today", "total_requests"):
            assert sensitive not in body, (
                f"/api/health/detailed must not expose {sensitive!r} — it "
                f"is a per-process counter and would silently misrepresent "
                f"a multi-worker deployment."
            )


class TestGetHealthDataFunctions:
    """Pure-function tests for the two helpers (no app boot needed)."""

    def test_public_helper_omits_operational_fields(self):
        from arena.core.observability import get_health_data
        body = get_health_data(db_connected=True)
        assert set(body.keys()) == {"status", "database"}
        # Make sure NO operational field is even reachable by accident.
        for sensitive in ("version", "uptime_seconds", "worker_pid"):
            assert sensitive not in body

    def test_detailed_helper_includes_operational_fields(self):
        from arena.core.observability import get_health_data_detailed
        body = get_health_data_detailed(db_connected=True)
        for required in ("status", "database", "version",
                         "uptime_seconds", "worker_pid"):
            assert required in body

    def test_detailed_is_a_strict_superset_of_public(self):
        from arena.core.observability import (
            get_health_data,
            get_health_data_detailed,
        )
        public = set(get_health_data(db_connected=True).keys())
        detailed = set(get_health_data_detailed(db_connected=True).keys())
        assert public.issubset(detailed)
        # And detailed adds at least the three sensitive fields.
        assert detailed - public >= {
            "version", "uptime_seconds", "worker_pid"
        }
