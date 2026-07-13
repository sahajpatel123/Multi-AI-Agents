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
        assert body["status"] in {"healthy", "ok", "degraded"}
        assert "db_connected" in body or "db_ok" in body or "checks" in body


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
        assert isinstance(body, list)
        assert len(body) >= 16
        ids = {p["persona_id"] for p in body}
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