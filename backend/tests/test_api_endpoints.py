"""Integration tests for the FastAPI app.

Drives the full stack with httpx.AsyncClient and an in-memory SQLite DB.
LLM clients are stubbed by the conftest fixtures.
"""

import pytest


class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_health_returns_ok(self, app_client):
        res = await app_client.get("/api/health")
        assert res.status_code == 200
        body = res.json()
        # /api/health returns: status, version, uptime_seconds, database
        assert body["status"] in {"healthy", "degraded"}
        assert "database" in body or "db_connected" in body or "db_ok" in body


class TestAuthEndpoints:
    @pytest.mark.asyncio
    async def test_register_creates_user(self, app_client):
        res = await app_client.post("/api/auth/register", json={
            "email": "new@test.com",
            "password": "Strong1Pass",
            "name": "New",
        })
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert "access_token" in body
        assert body["user"]["email"] == "new@test.com"

    @pytest.mark.asyncio
    async def test_register_weak_password_rejected(self, app_client):
        res = await app_client.post("/api/auth/register", json={
            "email": "weak@test.com",
            "password": "alllower",
            "name": "x",
        })
        assert res.status_code in {400, 422}

    @pytest.mark.asyncio
    async def test_register_duplicate_email_rejected(self, app_client):
        body = {"email": "dup@test.com", "password": "Strong1Pass", "name": "x"}
        r1 = await app_client.post("/api/auth/register", json=body)
        assert r1.status_code == 201
        r2 = await app_client.post("/api/auth/register", json=body)
        assert r2.status_code in {400, 409, 422}

    @pytest.mark.asyncio
    async def test_register_rate_limit_blocks_before_user_created(
        self, app_client, db_session, isolated_db
    ):
        """The IP rate limit MUST run BEFORE create_user. Otherwise
        a 429 from the rate limit leaves a phantom user record —
        the email is now in the DB and a future /register attempt
        for the same email returns 409 instead of registering.

        This is the cycle 24 fix: moving enforce_ip_rate_limit above
        create_user. The test pins the contract: after 5 successful
        registrations, the 6th attempt must be 429 AND must not have
        created a 6th user row.
        """
        from arena.db_models import User as UserModel
        from arena.core.rate_limits import rate_limiter as _rl
        # Reset the in-memory limiter so the test isn't order-dependent.
        if hasattr(_rl, "_events"):
            _rl._events.clear()

        for i in range(5):
            r = await app_client.post(
                "/api/auth/register",
                json={
                    "email": f"rluser{i}@test.com",
                    "password": "Strong1Pass",
                    "name": f"R{i}",
                },
            )
            assert r.status_code == 201, (
                f"registration {i + 1} should succeed under the rate limit, "
                f"got status {r.status_code} body={r.text[:200]}"
            )

        # 6th attempt from the same IP — same scope as the previous
        # five — must be rate-limited and must NOT create a user.
        r6 = await app_client.post(
            "/api/auth/register",
            json={
                "email": "rluser6@test.com",
                "password": "Strong1Pass",
                "name": "R6",
            },
        )
        assert r6.status_code == 429, (
            f"6th registration from same IP should be 429, got {r6.status_code}"
        )

        # The 6th attempt must NOT have created a phantom user record.
        from sqlalchemy import select
        SessionLocal = isolated_db
        s = SessionLocal()
        try:
            phantom = s.execute(
                select(UserModel).where(UserModel.email == "rluser6@test.com")
            ).scalar_one_or_none()
            assert phantom is None, (
                "rate-limited register must not have created a user record; "
                "phantom accounts accumulate over time without this fix"
            )
        finally:
            s.close()

    @pytest.mark.asyncio
    async def test_login_returns_tokens(self, app_client):
        await app_client.post("/api/auth/register", json={
            "email": "log@test.com", "password": "Strong1Pass", "name": "L",
        })
        res = await app_client.post("/api/auth/login", json={
            "email": "log@test.com",
            "password": "Strong1Pass",
        })
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["access_token"]

    @pytest.mark.asyncio
    async def test_login_wrong_password_rejected(self, app_client):
        await app_client.post("/api/auth/register", json={
            "email": "wp@test.com", "password": "Strong1Pass", "name": "W",
        })
        res = await app_client.post("/api/auth/login", json={
            "email": "wp@test.com",
            "password": "Wrong1Pass",
        })
        assert res.status_code == 401

    @pytest.mark.asyncio
    async def test_me_requires_auth(self, app_client):
        res = await app_client.get("/api/auth/me")
        assert res.status_code == 401

    @pytest.mark.asyncio
    async def test_me_returns_user(self, app_client, auth_headers):
        res = await app_client.get("/api/auth/me", headers=auth_headers())
        assert res.status_code == 200
        body = res.json()
        assert body["email"] == "user@test.com"


class TestPersonasEndpoint:
    @pytest.mark.asyncio
    async def test_list_personas(self, app_client, auth_headers):
        res = await app_client.get("/api/personas", headers=auth_headers())
        # 200 expected; endpoint may also be public — accept either.
        assert res.status_code == 200
        body = res.json()
        # Envelope shape — array lives under 'personas', with metadata
        # attached (total, providers) so the UI doesn't need a second
        # request to render a provider-filter dropdown.
        assert isinstance(body, dict)
        assert "personas" in body
        assert isinstance(body["personas"], list)
        assert body["total"] >= 16
        ids = {p["persona_id"] for p in body["personas"]}
        assert "analyst" in ids
        assert "philosopher" in ids
        assert "contrarian" in ids


class TestTierEndpoint:
    @pytest.mark.asyncio
    async def test_tier_free_user(self, app_client, auth_headers):
        res = await app_client.get("/api/user/tier", headers=auth_headers())
        assert res.status_code == 200
        body = res.json()
        assert body["tier"] in {"FREE", "free", "GUEST", "guest"}
        assert "daily_limit" in body
        assert "allowed_personas" in body


class TestUsageEndpoint:
    @pytest.mark.asyncio
    async def test_usage_returns_history(self, app_client, auth_headers):
        res = await app_client.get("/api/user/usage", headers=auth_headers())
        assert res.status_code == 200
        body = res.json()
        assert body["daily_limit"] > 0
        assert body["credits_used_today"] == 0
        assert len(body["usage_history"]) == 14