"""Integration tests for /api/agent/capabilities/stats."""

from __future__ import annotations

import pytest

from arena.core.capabilities import REGISTRY


# ─── Endpoint contract ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stats_returns_envelope(app_client):
    res = await app_client.get("/api/agent/capabilities/stats")
    assert res.status_code == 200
    body = res.json()
    assert "stats" in body
    assert "total" in body
    assert isinstance(body["stats"], list)
    assert body["total"] == len(REGISTRY)


@pytest.mark.asyncio
async def test_stats_matches_registry_count(app_client):
    """The endpoint must not invent extra entries — every stat row
    corresponds to a registered capability, and vice versa."""
    res = await app_client.get("/api/agent/capabilities/stats")
    body = res.json()
    endpoint_ids = {entry["id"] for entry in body["stats"]}
    registry_ids = set(REGISTRY)
    assert endpoint_ids == registry_ids


@pytest.mark.asyncio
async def test_stats_alphabetical_order(app_client):
    """Stable alphabetical order so the UI doesn't shuffle between
    fetches and the screenshot tests stay reproducible."""
    res = await app_client.get("/api/agent/capabilities/stats")
    body = res.json()
    ids = [entry["id"] for entry in body["stats"]]
    assert ids == sorted(ids)


@pytest.mark.asyncio
async def test_stats_carries_description_and_execution(app_client):
    """Every row must have id, description, execution — the contract
    the dashboard renders. A regression that drops one of these
    fields would render an empty card."""
    res = await app_client.get("/api/agent/capabilities/stats")
    body = res.json()
    for entry in body["stats"]:
        for field in ("id", "description", "execution"):
            assert field in entry, f"missing {field!r} in {entry}"


@pytest.mark.asyncio
async def test_stats_does_not_require_auth(app_client):
    """Stats are public marketing data — no auth needed."""
    res = await app_client.get("/api/agent/capabilities/stats")
    assert res.status_code != 401


@pytest.mark.asyncio
async def test_stats_includes_condura_method_for_local(app_client):
    """Local-execution capabilities must include the condura_method
    so the UI can label them as 'Runs on Condura'."""
    res = await app_client.get("/api/agent/capabilities/stats")
    body = res.json()
    by_id = {entry["id"]: entry for entry in body["stats"]}
    # A known hybrid-delegate capability.
    assert "condura_method" in by_id["agent.long_research"]
    assert by_id["agent.long_research"]["execution"] == "hybrid_delegate"