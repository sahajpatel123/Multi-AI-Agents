"""Integration tests for /api/agent/capabilities/examples."""

from __future__ import annotations

import pytest

from arena.core.capabilities import CAPABILITY_EXAMPLES, REGISTRY


# ─── Lib contract ──────────────────────────────────────────────────────────


def test_every_capability_has_examples_entry():
    """No capability is allowed to ship without an examples entry — the
    UI renders an empty list for capabilities with no curated
    prompts, but a missing key would crash the render. The contract
    is that every registered capability has a key (possibly empty)."""
    for cap_id in REGISTRY:
        assert cap_id in CAPABILITY_EXAMPLES, (
            f"Capability {cap_id!r} is missing from CAPABILITY_EXAMPLES"
        )


def test_examples_are_strings():
    """Each example must be a non-empty string — the UI renders them
    as button text."""
    for cap_id, examples in CAPABILITY_EXAMPLES.items():
        for ex in examples:
            assert isinstance(ex, str), (
                f"{cap_id} example is not a string: {ex!r}"
            )
            assert len(ex) > 0, f"{cap_id} has an empty example string"


def test_examples_have_sane_lengths():
    """Examples appear as button chips — under 20 chars is too cryptic,
    over 200 chars is too long for a chip. Sanity check the doc team
    has not let an outlier slip through."""
    for cap_id, examples in CAPABILITY_EXAMPLES.items():
        for ex in examples:
            assert 20 <= len(ex) <= 200, (
                f"{cap_id} example is {len(ex)} chars: {ex!r}"
            )


# ─── Endpoint ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_examples_endpoint_returns_envelope(app_client):
    res = await app_client.get("/api/agent/capabilities/examples")
    assert res.status_code == 200
    body = res.json()
    assert "examples" in body
    assert isinstance(body["examples"], list)


@pytest.mark.asyncio
async def test_examples_endpoint_stable_alphabetical_order(app_client):
    res = await app_client.get("/api/agent/capabilities/examples")
    body = res.json()
    ids = [entry["id"] for entry in body["examples"]]
    assert ids == sorted(ids)


@pytest.mark.asyncio
async def test_examples_endpoint_does_not_require_auth(app_client):
    """Examples are public marketing copy, not user data — no auth."""
    res = await app_client.get("/api/agent/capabilities/examples")
    assert res.status_code != 401


@pytest.mark.asyncio
async def test_examples_endpoint_carries_per_capability_list(app_client):
    """Each entry has id + examples (possibly empty). The UI renders
    the empty list as a 'no curated examples' placeholder."""
    res = await app_client.get("/api/agent/capabilities/examples")
    body = res.json()
    for entry in body["examples"]:
        assert "id" in entry
        assert "examples" in entry
        assert isinstance(entry["examples"], list)


@pytest.mark.asyncio
async def test_examples_endpoint_matches_lib_map(app_client):
    """The endpoint and the lib map must agree — no test-only fixtures
    that don't reflect production data."""
    res = await app_client.get("/api/agent/capabilities/examples")
    body = res.json()
    by_id = {entry["id"]: entry["examples"] for entry in body["examples"]}
    for cap_id, expected in CAPABILITY_EXAMPLES.items():
        assert by_id[cap_id] == expected