"""Integration tests for GET /api/personas and GET /api/personas/{id}.

The DB is pre-seeded with the 16 canonical personas at app startup, so the
tests here use the real seeded ids ('analyst', 'philosopher', etc.) rather
than inventing new ones — that way they're testing production-shape data,
not isolated fixtures.
"""

from __future__ import annotations

import pytest

from arena.db_models import PersonaLibrary


def _seed(db, *, persona_id: str, provider: str = "claude", display_order: int = 0):
    """Add a unique test fixture persona. Uses a ``test_`` prefix so it
    never collides with the 16 canonical seeded rows."""
    row = PersonaLibrary(
        persona_id=persona_id,
        name=persona_id.title(),
        color="#ffffff",
        bg_tint="#000000",
        quote=f"Quote for {persona_id}",
        description=f"Description for {persona_id}",
        temperature=0.5,
        system_prompt=f"System prompt for {persona_id}",
        provider=provider,
        display_order=display_order,
    )
    db.add(row)
    db.flush()
    return row


# ─── List endpoint ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_returns_dict_with_personas_array(app_client, db_session):
    _seed(db_session, persona_id="test_alpha", display_order=1)
    _seed(db_session, persona_id="test_beta", display_order=2)
    db_session.commit()

    res = await app_client.get("/api/personas")
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, dict)
    assert isinstance(body["personas"], list)
    # 16 seeded + 2 added.
    assert body["total"] == 18


@pytest.mark.asyncio
async def test_list_orders_by_display_order(app_client, db_session):
    _seed(db_session, persona_id="test_zebra", display_order=30)
    _seed(db_session, persona_id="test_alpha", display_order=10)
    _seed(db_session, persona_id="test_middle", display_order=20)
    db_session.commit()

    res = await app_client.get("/api/personas")
    body = res.json()
    # Pull only the test_ fixtures so we can assert on a closed set.
    test_ids = [p["persona_id"] for p in body["personas"] if p["persona_id"].startswith("test_")]
    assert test_ids == ["test_alpha", "test_middle", "test_zebra"]


@pytest.mark.asyncio
async def test_list_provider_filter_case_insensitive(app_client, db_session):
    # Seed a unique provider so this test doesn't depend on the canonical
    # rows' provider assignments (which a future seed change could shift).
    _seed(db_session, persona_id="test_only_acme", provider="acme")
    _seed(db_session, persona_id="test_only_zenith", provider="zenith")
    db_session.commit()

    # UI sends "Acme", DB has "acme" — must still match.
    res = await app_client.get("/api/personas?provider=Acme")
    body = res.json()
    ids = {p["persona_id"] for p in body["personas"]}
    assert ids == {"test_only_acme"}


@pytest.mark.asyncio
async def test_list_provider_filter_returns_empty_for_unknown_provider(
    app_client, db_session
):
    res = await app_client.get("/api/personas?provider=nomodel-xyz")
    body = res.json()
    assert body["personas"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_list_providers_list_is_distinct_and_sorted(app_client, db_session):
    res = await app_client.get("/api/personas")
    body = res.json()
    # Distinct — duplicates collapse. Sorted — UI gets a stable order.
    assert body["providers"] == sorted(set(body["providers"]))
    # Sanity: the canonical providers seeded at startup are all present.
    assert {"claude", "openai", "grok", "deepseek"}.issubset(body["providers"])


@pytest.mark.asyncio
async def test_list_rejects_overlong_provider(app_client, db_session):
    """FastAPI Query(max_length=50) caps the provider param so a 100KB
    payload can't pin the DB on an ilike scan."""
    res = await app_client.get(f"/api/personas?provider={'x' * 200}")
    assert res.status_code == 422


# ─── Tier-aware availability ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_marks_free_personas_available_for_free(
    app_client, db_session
):
    # 'analyst' is in FREE_PERSONAS, 'scientist' is not.
    res = await app_client.get("/api/personas?tier=free")
    body = res.json()
    by_id = {p["persona_id"]: p for p in body["personas"]}
    assert by_id["analyst"]["available_for_tier"] is True
    assert by_id["scientist"]["available_for_tier"] is False


@pytest.mark.asyncio
async def test_list_marks_all_personas_available_for_pro(app_client):
    res = await app_client.get("/api/personas?tier=pro")
    body = res.json()
    # Every canonical persona must be available for PRO.
    for p in body["personas"]:
        assert p["available_for_tier"] is True


@pytest.mark.asyncio
async def test_list_omits_availability_flag_for_anonymous_caller(
    app_client,
):
    """Tier-locking must not leak to anonymous listings — a logged-out
    visitor shouldn't be able to fingerprint which personas are paywalled."""
    res = await app_client.get("/api/personas")
    body = res.json()
    # Even though 'scientist' is paywalled, the flag must be absent.
    assert "available_for_tier" not in body["personas"][0]


@pytest.mark.asyncio
async def test_list_unknown_tier_falls_back_to_free(app_client):
    """A stale frontend passing an old tier name shouldn't break the endpoint
    — the public catalog should still come back with sensible defaults."""
    res = await app_client.get("/api/personas?tier=enterprise")
    body = res.json()
    by_id = {p["persona_id"]: p for p in body["personas"]}
    # 'enterprise' isn't a known tier → normalize_tier returns FREE →
    # analyst is available, scientist is not.
    assert by_id["analyst"]["available_for_tier"] is True
    assert by_id["scientist"]["available_for_tier"] is False


# ─── Detail endpoint ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_detail_returns_single_persona(app_client):
    res = await app_client.get("/api/personas/analyst")
    assert res.status_code == 200
    body = res.json()
    assert body["persona_id"] == "analyst"


@pytest.mark.asyncio
async def test_detail_404_for_unknown_id(app_client):
    """Clients shouldn't have to scan the full list to confirm an id is
    invalid — give them a clear 404 with the offending id in the body."""
    res = await app_client.get("/api/personas/does-not-exist")
    assert res.status_code == 404
    body = res.json()
    assert body["detail"]["error"] == "persona_not_found"
    assert body["detail"]["persona_id"] == "does-not-exist"


@pytest.mark.asyncio
async def test_detail_with_tier_appends_availability(app_client):
    res = await app_client.get("/api/personas/scientist?tier=free")
    body = res.json()
    assert body["persona_id"] == "scientist"
    assert body["available_for_tier"] is False

    res = await app_client.get("/api/personas/scientist?tier=plus")
    body = res.json()
    assert body["available_for_tier"] is True