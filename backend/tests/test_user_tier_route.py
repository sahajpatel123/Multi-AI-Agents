"""Integration tests for GET /api/user/tier."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


@pytest.mark.asyncio
async def test_tier_returns_dict(app_client, make_user):
    user = make_user(email="tier-pro@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/user/tier", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, dict)


@pytest.mark.asyncio
async def test_tier_returns_null_or_dict_for_new_user(app_client, make_user):
    """A new user may get null or {} before they hit /api/auth/me
    once. Either is a valid response — the route must not 5xx."""
    user = make_user(email="tier-new@test.com", tier=UserTier.FREE)
    res = await app_client.get("/api/user/tier", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert body is None or isinstance(body, dict)


@pytest.mark.asyncio
async def test_tier_requires_auth(app_client):
    res = await app_client.get("/api/user/tier")
    assert res.status_code == 401
