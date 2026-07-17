"""Health endpoint disclosure audit.

/api/health is the only completely-unauthenticated read endpoint in the
backend. Render's readiness probe, external uptime monitors, and any
attacker can hit it without credentials. The response must NOT leak:
  - app version (correlates with release windows)
  - uptime_seconds (correlates with restart / deploy times)
  - total_requests_today (competitive intelligence)
  - legacy_password_hits (auth migration telemetry)

Those fields are exposed only via /api/health/detailed, which requires
a valid bearer token AND ADMIN_EMAIL match. Any authenticated user
previously could read version/uptime — that is now admin-only.
"""

import pytest


@pytest.fixture
def admin_email(monkeypatch):
    """Point ADMIN_EMAIL at the default auth_headers user."""
    from arena import config

    email = "user@test.com"
    monkeypatch.setenv("ADMIN_EMAIL", email)
    config.get_settings.cache_clear()
    yield email
    config.get_settings.cache_clear()


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
        for sensitive in (
            "version",
            "uptime_seconds",
            "total_requests_today",
            "legacy_password_hits",
            "worker_pid",
        ):
            assert sensitive not in body, (
                f"unauthenticated /api/health must not leak {sensitive!r}; "
                f"got {sorted(body.keys())}"
            )


class TestDetailedHealth:
    """GET /api/health/detailed — admin + auth, full."""

    @pytest.mark.asyncio
    async def test_detailed_requires_auth(self, app_client, isolated_db):
        res = await app_client.get("/api/health/detailed")
        assert res.status_code == 401

    @pytest.mark.asyncio
    async def test_detailed_rejects_non_admin(
        self, app_client, auth_headers, isolated_db, monkeypatch
    ):
        from arena import config

        monkeypatch.setenv("ADMIN_EMAIL", "ops@arena.test")
        config.get_settings.cache_clear()
        # Default auth user is user@test.com — not the admin.
        headers = auth_headers()
        res = await app_client.get("/api/health/detailed", headers=headers)
        assert res.status_code == 403, (
            f"non-admin authenticated caller must get 403; got {res.status_code} "
            f"body={res.text[:200]}"
        )

    @pytest.mark.asyncio
    async def test_detailed_with_admin_exposes_operational_fields(
        self, app_client, auth_headers, isolated_db, admin_email
    ):
        headers = auth_headers()
        res = await app_client.get("/api/health/detailed", headers=headers)
        assert res.status_code == 200
        body = res.json()
        for required in (
            "status",
            "database",
            "version",
            "uptime_seconds",
            "worker_pid",
            "legacy_password_hits",
        ):
            assert required in body, (
                f"admin /api/health/detailed must include {required!r}; "
                f"got {sorted(body.keys())}"
            )
        assert isinstance(body["uptime_seconds"], int)
        assert body["uptime_seconds"] >= 0
        assert isinstance(body["worker_pid"], int)
        assert isinstance(body["legacy_password_hits"], int)
        assert body["legacy_password_hits"] >= 0

    @pytest.mark.asyncio
    async def test_detailed_does_not_expose_per_process_request_counter(
        self, app_client, auth_headers, isolated_db, admin_email
    ):
        # Per-worker in-memory counters misrepresented cross-worker traffic.
        headers = auth_headers()
        res = await app_client.get("/api/health/detailed", headers=headers)
        assert res.status_code == 200
        body = res.json()
        for sensitive in (
            "total_requests_today",
            "request_count",
            "requests_today",
            "total_requests",
        ):
            assert sensitive not in body, (
                f"/api/health/detailed must not expose {sensitive!r} — it "
                f"is a per-process counter and would silently misrepresent "
                f"a multi-worker deployment."
            )

    @pytest.mark.asyncio
    async def test_detailed_503_when_admin_not_configured(
        self, app_client, auth_headers, isolated_db, monkeypatch
    ):
        from arena import config

        monkeypatch.setenv("ADMIN_EMAIL", "")
        config.get_settings.cache_clear()
        headers = auth_headers()
        res = await app_client.get("/api/health/detailed", headers=headers)
        assert res.status_code == 503


class TestGetHealthDataFunctions:
    """Pure-function tests for the two helpers (no app boot needed)."""

    def test_public_helper_omits_operational_fields(self):
        from arena.core.observability import get_health_data

        body = get_health_data(db_connected=True)
        assert set(body.keys()) == {"status", "database"}
        for sensitive in (
            "version",
            "uptime_seconds",
            "worker_pid",
            "legacy_password_hits",
        ):
            assert sensitive not in body

    def test_detailed_helper_includes_operational_fields(self):
        from arena.core.observability import get_health_data_detailed

        body = get_health_data_detailed(db_connected=True)
        for required in (
            "status",
            "database",
            "version",
            "uptime_seconds",
            "worker_pid",
            "legacy_password_hits",
        ):
            assert required in body

    def test_detailed_is_a_strict_superset_of_public(self):
        from arena.core.observability import (
            get_health_data,
            get_health_data_detailed,
        )

        public = set(get_health_data(db_connected=True).keys())
        detailed = set(get_health_data_detailed(db_connected=True).keys())
        assert public.issubset(detailed)
        assert detailed - public >= {
            "version",
            "uptime_seconds",
            "worker_pid",
            "legacy_password_hits",
        }
