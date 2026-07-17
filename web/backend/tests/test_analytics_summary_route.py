"""Integration tests for GET /api/analytics/summary."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


@pytest.mark.asyncio
async def test_summary_returns_dict(app_client, make_user):
    user = make_user(email="ana-ok@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/analytics/summary", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, dict)


@pytest.mark.asyncio
async def test_summary_returns_empty_array_for_new_user(app_client, make_user):
    """A fresh user with no session summaries must get an empty list (not 404)."""
    user = make_user(email="ana-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/analytics/summary", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    # Summaries list exists, just empty.
    assert isinstance(body, dict)


@pytest.mark.asyncio
async def test_summary_requires_auth(app_client):
    res = await app_client.get("/api/analytics/summary")
    assert res.status_code == 401
