"""Integration tests for GET /api/user/usage."""

from __future__ import annotations

import pytest

from arena.db_models import UserTier



@pytest.mark.asyncio
async def test_usage_returns_dict_for_pro_user(app_client, make_user):
    user = make_user(email="usage-pro@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/user/usage", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, dict)
    # Daily counters should be present.
    assert "credits_used_today" in body or "daily_limit" in body


@pytest.mark.asyncio
async def test_usage_returns_dict_for_free_user(app_client, make_user):
    user = make_user(email="usage-free@test.com", tier=UserTier.FREE)
    res = await app_client.get("/api/user/usage", headers=_pro_headers(user))
    assert res.status_code == 200
    assert isinstance(res.json(), dict)


@pytest.mark.asyncio
async def test_usage_requires_auth(app_client):
    res = await app_client.get("/api/user/usage")
    assert res.status_code == 401
