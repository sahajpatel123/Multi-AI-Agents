"""Integration tests for /api/mcp/integrations list, catalog, rename, and toggle."""

from __future__ import annotations

import pytest

from arena.core.token_crypto import encrypt_token, get_fernet
from arena.db_models import MCPIntegration, UserTier



def _seed_integration(
    db,
    *,
    user_id: int,
    service: str = "notion",
    display_name: str = "My Notion",
    is_active: bool = True,
):
    """Insert an MCPIntegration row. We don't go through the connect
    endpoint because it requires ENCRYPTION_KEY to be set; for the routes
    under test (list, catalog, rename, toggle) the token value doesn't
    matter as long as it's a non-empty encrypted string."""
    fernet = get_fernet()
    if fernet is None:
        # Fall back to a plaintext placeholder so the test can run on a
        # test runner without ENCRYPTION_KEY set. The routes under test
        # never decrypt.
        encrypted = "not-encrypted-test-fixture"
    else:
        encrypted = fernet.encrypt(b"test-fixture-token").decode("utf-8")
    return MCPIntegration(
        user_id=user_id,
        service=service,
        display_name=display_name,
        access_token=encrypted,
        is_active=is_active,
    )


# ─── List filters ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_excludes_inactive_by_default(app_client, make_user, db_session):
    user = make_user(email="int-list@test.com", tier=UserTier.PRO)
    db_session.add(_seed_integration(db_session, user_id=user.id, service="notion", is_active=True))
    db_session.add(_seed_integration(db_session, user_id=user.id, service="github", is_active=False))
    db_session.commit()

    res = await app_client.get("/api/mcp/integrations", headers=_pro_headers(user))
    body = res.json()
    services = {i["service"] for i in body["integrations"]}
    assert services == {"notion"}


@pytest.mark.asyncio
async def test_list_includes_inactive_when_requested(app_client, make_user, db_session):
    user = make_user(email="int-incl@test.com", tier=UserTier.PRO)
    db_session.add(_seed_integration(db_session, user_id=user.id, service="notion", is_active=True))
    db_session.add(_seed_integration(db_session, user_id=user.id, service="github", is_active=False))
    db_session.commit()

    res = await app_client.get(
        "/api/mcp/integrations?include_inactive=true", headers=_pro_headers(user)
    )
    body = res.json()
    services = {i["service"] for i in body["integrations"]}
    assert services == {"notion", "github"}


@pytest.mark.asyncio
async def test_list_service_filter(app_client, make_user, db_session):
    user = make_user(email="int-svc@test.com", tier=UserTier.PRO)
    db_session.add(_seed_integration(db_session, user_id=user.id, service="notion"))
    db_session.add(_seed_integration(db_session, user_id=user.id, service="github"))
    db_session.commit()

    res = await app_client.get(
        "/api/mcp/integrations?service=notion", headers=_pro_headers(user)
    )
    body = res.json()
    assert {i["service"] for i in body["integrations"]} == {"notion"}


@pytest.mark.asyncio
async def test_list_service_filter_unknown_returns_empty(app_client, make_user):
    """A stale frontend passing an old service name shouldn't break the
    endpoint — empty list rather than 400."""
    user = make_user(email="int-svc-unk@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/mcp/integrations?service=ghost-service", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["integrations"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_list_search_matches_display_name(app_client, make_user, db_session):
    user = make_user(email="int-search@test.com", tier=UserTier.PRO)
    db_session.add(_seed_integration(db_session, user_id=user.id, service="notion",
                                      display_name="Work Notion"))
    db_session.add(_seed_integration(db_session, user_id=user.id, service="github",
                                      display_name="Personal Notion"))
    db_session.commit()

    res = await app_client.get(
        "/api/mcp/integrations?search=work", headers=_pro_headers(user)
    )
    body = res.json()
    names = {i["display_name"] for i in body["integrations"]}
    assert names == {"Work Notion"}


@pytest.mark.asyncio
async def test_list_search_escapes_like_wildcards(app_client, make_user, db_session):
    user = make_user(email="int-wild@test.com", tier=UserTier.PRO)
    db_session.add(_seed_integration(db_session, user_id=user.id, service="notion",
                                      display_name="100% effort"))
    db_session.add(_seed_integration(db_session, user_id=user.id, service="github",
                                      display_name="fifty percent"))
    db_session.commit()

    res = await app_client.get(
        "/api/mcp/integrations?search=100%25", headers=_pro_headers(user)
    )
    body = res.json()
    names = {i["display_name"] for i in body["integrations"]}
    assert names == {"100% effort"}


@pytest.mark.asyncio
async def test_list_scoped_to_caller(app_client, make_user, db_session):
    alice = make_user(email="int-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="int-bob@test.com", tier=UserTier.PRO)
    db_session.add(_seed_integration(db_session, user_id=alice.id, service="notion"))
    db_session.add(_seed_integration(db_session, user_id=bob.id, service="notion"))
    db_session.commit()

    res = await app_client.get("/api/mcp/integrations", headers=_pro_headers(alice))
    body = res.json()
    assert body["total"] == 1


@pytest.mark.asyncio
async def test_list_filters_echo_in_response(app_client, make_user):
    user = make_user(email="int-echo@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/mcp/integrations?service=notion&search=work&include_inactive=true",
        headers=_pro_headers(user),
    )
    print("STATUS:", res.status_code, "BODY:", res.text[:300])
    body = res.json()
    assert body["filters"]["service"] == "notion"
    assert body["filters"]["search"] == "work"
    assert body["filters"]["include_inactive"] is True


# ─── Catalog ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_catalog_lists_all_supported_services(app_client, make_user):
    user = make_user(email="int-cat@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/mcp/integrations/services", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 12
    sids = {s["service"] for s in body["services"]}
    assert "notion" in sids
    assert "github" in sids
    assert "slack" in sids


@pytest.mark.asyncio
async def test_catalog_marks_connected_services(app_client, make_user, db_session):
    user = make_user(email="int-cat-mark@test.com", tier=UserTier.PRO)
    db_session.add(_seed_integration(db_session, user_id=user.id, service="notion"))
    db_session.commit()

    res = await app_client.get("/api/mcp/integrations/services", headers=_pro_headers(user))
    body = res.json()
    by_sid = {s["service"]: s for s in body["services"]}
    assert by_sid["notion"]["connected"] is True
    assert by_sid["github"]["connected"] is False


@pytest.mark.asyncio
async def test_catalog_carries_label_and_category(app_client, make_user):
    user = make_user(email="int-cat-meta@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/mcp/integrations/services", headers=_pro_headers(user))
    body = res.json()
    notion = next(s for s in body["services"] if s["service"] == "notion")
    assert notion["label"] == "Notion"
    assert notion["category"] == "docs"


# ─── Rename ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_rename_updates_display_name(app_client, make_user, db_session):
    user = make_user(email="int-rename@test.com", tier=UserTier.PRO)
    row = _seed_integration(db_session, user_id=user.id, service="notion",
                            display_name="Old Name")
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)

    res = await app_client.patch(
        f"/api/mcp/integrations/{row.id}",
        json={"display_name": "New Name"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["display_name"] == "New Name"

    # Verify it persisted.
    listing = await app_client.get("/api/mcp/integrations", headers=_pro_headers(user))
    assert listing.json()["integrations"][0]["display_name"] == "New Name"


@pytest.mark.asyncio
async def test_rename_404_for_foreign(app_client, make_user, db_session):
    """Foreign ids must look like not-found (no existence oracle)."""
    user = make_user(email="int-rename-for@test.com", tier=UserTier.PRO)
    other = make_user(email="int-rename-other@test.com", tier=UserTier.PRO)
    row = _seed_integration(db_session, user_id=other.id, service="notion")
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)

    res = await app_client.patch(
        f"/api/mcp/integrations/{row.id}",
        json={"display_name": "hijack"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_rename_rejects_overlong_name(app_client, make_user, db_session):
    user = make_user(email="int-rename-long@test.com", tier=UserTier.PRO)
    row = _seed_integration(db_session, user_id=user.id, service="notion")
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    res = await app_client.patch(
        f"/api/mcp/integrations/{row.id}",
        json={"display_name": "x" * 200},
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


# ─── Toggle ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_toggle_disables_active_integration(app_client, make_user, db_session):
    user = make_user(email="int-tog@test.com", tier=UserTier.PRO)
    row = _seed_integration(db_session, user_id=user.id, service="notion", is_active=True)
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)

    res = await app_client.post(
        f"/api/mcp/integrations/{row.id}/toggle",
        json={"is_active": False},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is False

    # Default list (include_inactive=false) must now hide it.
    listing = await app_client.get("/api/mcp/integrations", headers=_pro_headers(user))
    assert listing.json()["integrations"] == []


@pytest.mark.asyncio
async def test_toggle_re_enables(app_client, make_user, db_session):
    """A user can re-enable without re-auth'ing."""
    user = make_user(email="int-tog-re@test.com", tier=UserTier.PRO)
    row = _seed_integration(db_session, user_id=user.id, service="notion", is_active=False)
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)

    res = await app_client.post(
        f"/api/mcp/integrations/{row.id}/toggle",
        json={"is_active": True},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is True

    listing = await app_client.get("/api/mcp/integrations", headers=_pro_headers(user))
    assert listing.json()["total"] == 1


@pytest.mark.asyncio
async def test_toggle_404_for_foreign(app_client, make_user, db_session):
    user = make_user(email="int-tog-for@test.com", tier=UserTier.PRO)
    other = make_user(email="int-tog-other@test.com", tier=UserTier.PRO)
    row = _seed_integration(db_session, user_id=other.id, service="notion")
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    res = await app_client.post(
        f"/api/mcp/integrations/{row.id}/toggle",
        json={"is_active": False},
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_toggle_404_for_missing(app_client, make_user):
    user = make_user(email="int-tog-miss@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/mcp/integrations/999999/toggle",
        json={"is_active": False},
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


# ─── Auth ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_integration_endpoints_require_auth(app_client):
    for method, path in [
        ("GET", "/api/mcp/integrations"),
        ("GET", "/api/mcp/integrations/services"),
    ]:
        res = await app_client.request(method, path)
        assert res.status_code == 401, f"{method} {path} returned {res.status_code}"

    # PATCH and POST need a body, so the auth check happens after parsing.
    res = await app_client.request("PATCH", "/api/mcp/integrations/1", json={"display_name": "x"})
    assert res.status_code == 401
    res = await app_client.request("POST", "/api/mcp/integrations/1/toggle", json={"is_active": False})
    assert res.status_code == 401