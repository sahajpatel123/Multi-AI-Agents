"""Integration tests for GET /api/agent/memory/context."""

from __future__ import annotations

import pytest

from arena.db_models import UserTier



@pytest.mark.asyncio
async def test_memory_context_returns_dict_for_authenticated_user(
    app_client, make_user
):
    user = make_user(email="mc-pro@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/memory/context",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    # Should at minimum be a dict (shape depends on whether the
    # user has any saved memories, but the response must be JSON
    # and parseable).
    assert isinstance(body, dict)


@pytest.mark.asyncio
async def test_memory_context_accepts_optional_task(app_client, make_user):
    user = make_user(email="mc-task@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/memory/context?task=quantum+computing",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert isinstance(res.json(), dict)


@pytest.mark.asyncio
async def test_memory_context_403_for_free_tier(app_client, make_user):
    user = make_user(email="mc-free@test.com", tier=UserTier.FREE)
    res = await app_client.get(
        "/api/agent/memory/context",
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_memory_context_requires_auth(app_client):
    res = await app_client.get("/api/agent/memory/context")
    assert res.status_code == 401
