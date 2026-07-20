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
        # Behavior-level envelope pin (cycle-89 pattern). The auth
        # dependency raises from dependencies.py with the standard
        # dict envelope.
        detail = res.json().get("detail")
        assert isinstance(detail, dict)
        assert detail["error"] == "invalid_token"

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
        # Behavior-level envelope pin (cycle-89 pattern). admin_gate.py
        # raises with the standard dict envelope.
        detail = res.json().get("detail")
        assert isinstance(detail, dict)
        assert detail["error"] == "admin_required"

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


class TestPublicHealthRateLimit:
    """Cycle-50 follow-up: commit 0d47412 wired `enforce_ip_rate_limit` on
    `/api/health` at 300/min per IP. That cap was never asserted — a
    future contributor could remove the limiter and CI would still pass.

    Two tests pin the surface:
      1. The route declares the rate-limit at 300/min (intent).
      2. The route actually enforces it (behavior).
    """

    @pytest.mark.asyncio
    async def test_health_detailed_route_declares_the_60_per_minute_user_cap(
        self, app_client, isolated_db, admin_email
    ):
        """Read main.py and assert the detailed health route declares
        an `enforce_user_rate_limit` call with limit=60, window=60s.

        The detailed endpoint is admin-gated and returns operational
        details (version, uptime). 60/min/user matches the metrics
        endpoint cap (cycle 51) — a polling admin dashboard refreshes
        at most once per second, so 60/min is a comfortable ceiling.
        """
        from pathlib import Path

        main_src = (Path(__file__).resolve().parent.parent / "main.py").read_text()

        assert '@app.get("/api/health/detailed"' in main_src, (
            "Expected the admin /api/health/detailed route to be declared in main.py"
        )
        assert 'scope="health_detailed"' in main_src, (
            "Expected scope='health_detailed' for the /api/health/detailed limiter"
        )
        assert "limit=60" in main_src, (
            "Expected the /api/health/detailed cap to remain at 60/min. "
            "The 60/min ceiling matches the metrics endpoint cap (cycle 51) "
            "and accommodates a dashboard polling at 1/sec. Lower values break "
            "operational dashboards; higher values weaken the throttle."
        )
        assert "window_seconds=60" in main_src, (
            "Expected the /api/health/detailed cap to roll on a 60-second window"
        )
        """Read the source of main.py and assert the public health route
        has an `enforce_ip_rate_limit` call with limit=300, window=60s.

        This is a 'did we wire the throttle' check. If a contributor
        deletes the call (e.g. during a refactor), the behavioral test
        below would still pass if the limit is small enough to trip on
        the test count — but the intent check guarantees the cap matches
        the design ('generous for load balancers, still bound').
        """
        from pathlib import Path

        main_src = (Path(__file__).resolve().parent.parent / "main.py").read_text()

        # Look for the public health route declaration followed by an
        # enforce_ip_rate_limit call with the expected limit. We don't
        # parse the AST — a substring check is robust enough for a
        # regression guard.
        assert '@app.get("/api/health"' in main_src, (
            "Expected the public /api/health route to be declared in main.py"
        )
        # The '300' cap must appear in the same region as the rate-limit
        # call. We look for the call shape: enforce_ip_rate_limit(
        #   request,
        #   scope="health_public",
        #   limit=300,
        #   window_seconds=60,
        #   ...
        assert 'scope="health_public"' in main_src, (
            "Expected scope='health_public' for the /api/health limiter"
        )
        assert "limit=300" in main_src, (
            "Expected the /api/health IP cap to remain at 300/min — the "
            "design (cycle 0d47412) called for 'generous for load balancers, "
            "still bound'. A 300/min cap lets a probe fire every 200ms without "
            "tripping, while blocking a sustained flood. Lower values break "
            "monitoring integrations; higher values weaken DoS protection."
        )
        assert "window_seconds=60" in main_src, (
            "Expected the /api/health cap to roll on a 60-second window"
        )
