"""Integration tests for GET /api/agent/templates and /api/agent/capabilities."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_templates_returns_dict(app_client):
    res = await app_client.get("/api/agent/templates")
    assert res.status_code == 200
    body = res.json()
    # Should be a dict (grouped by category). May be empty if no
    # templates are seeded, but must always be a dict.
    assert isinstance(body, dict)


@pytest.mark.asyncio
async def test_capabilities_returns_dict_with_capabilities_key(app_client):
    res = await app_client.get("/api/agent/capabilities")
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, dict)
    assert "capabilities" in body
    assert isinstance(body["capabilities"], (list, dict))


@pytest.mark.asyncio
async def test_templates_no_auth_required(app_client):
    """These are public discovery endpoints, no Authorization header."""
    res = await app_client.get("/api/agent/templates")
    assert res.status_code != 401


@pytest.mark.asyncio
async def test_capabilities_no_auth_required(app_client):
    res = await app_client.get("/api/agent/capabilities")
    assert res.status_code != 401
