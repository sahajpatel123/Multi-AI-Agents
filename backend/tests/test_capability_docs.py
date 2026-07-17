"""Integration tests for /api/agent/capabilities/docs."""

from __future__ import annotations

import pytest


# ─── Catalog docs listing ───────────────────────────────────────────────────


def test_capability_docs_catalog_returns_all_capabilities():
    """Verify the lib catalog has docs for every registered capability —
    no capability is allowed to ship without an extended description
    since the docs surface is a product surface, not just internal."""
    from arena.core.capabilities import CAPABILITY_DOCS, REGISTRY

    for cap_id in REGISTRY:
        assert cap_id in CAPABILITY_DOCS, (
            f"Capability {cap_id!r} is missing from CAPABILITY_DOCS — "
            "add an entry so the docs endpoint has something to return."
        )


@pytest.mark.asyncio
async def test_capability_docs_listing(app_client):
    res = await app_client.get("/api/agent/capabilities/docs")
    assert res.status_code == 200
    body = res.json()
    assert "docs" in body
    assert "total" in body
    # Every doc entry has a markdown field.
    for entry in body["docs"]:
        assert "id" in entry
        assert "description" in entry
        assert "markdown" in entry
        assert isinstance(entry["markdown"], str)
        assert len(entry["markdown"]) > 0


@pytest.mark.asyncio
async def test_capability_docs_does_not_require_auth(app_client):
    """Capability metadata is public. A paying customer evaluating the
    product shouldn't need to log in just to read docs."""
    res = await app_client.get("/api/agent/capabilities/docs")
    assert res.status_code != 401


@pytest.mark.asyncio
async def test_capability_docs_stable_alphabetical_order(app_client):
    res = await app_client.get("/api/agent/capabilities/docs")
    body = res.json()
    ids = [entry["id"] for entry in body["docs"]]
    assert ids == sorted(ids)


# ─── Single-capability doc lookup ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_capability_doc_lookup_returns_full_record(app_client):
    res = await app_client.get("/api/agent/capabilities/docs/arena.debate")
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == "arena.debate"
    assert body["execution"] == "web"
    assert isinstance(body["markdown"], str)
    # The markdown body must be substantive — not a one-liner.
    assert len(body["markdown"]) > 50


@pytest.mark.asyncio
async def test_capability_doc_lookup_404_for_unknown(app_client):
    """Unknown ids return 404 with a stable error code so a client can
    detect a typo without a try/except."""
    res = await app_client.get("/api/agent/capabilities/docs/ghost-capability")
    assert res.status_code == 404
    body = res.json()
    assert body["detail"]["error"] == "capability_not_found"
    assert body["detail"]["id"] == "ghost-capability"


@pytest.mark.asyncio
async def test_capability_doc_lookup_does_not_require_auth(app_client):
    res = await app_client.get("/api/agent/capabilities/docs/arena.respond")
    assert res.status_code != 401


@pytest.mark.asyncio
async def test_capability_doc_looks_ups_match_catalog_listing(app_client):
    """The two endpoints must agree on the body for the same id —
    one source of truth, two views."""
    list_res = await app_client.get("/api/agent/capabilities/docs")
    list_body = list_res.json()
    for entry in list_body["docs"]:
        single = await app_client.get(f"/api/agent/capabilities/docs/{entry['id']}")
        assert single.status_code == 200
        assert single.json()["markdown"] == entry["markdown"]