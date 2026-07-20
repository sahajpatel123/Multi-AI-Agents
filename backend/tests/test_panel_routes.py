"""Integration tests for /api/panel and the new preset / patch / reset endpoints."""

from __future__ import annotations

import pytest

from arena.db_models import UserTier



def _all_free_panel() -> dict:
    """A panel of 4 personas that every tier can access."""
    return {
        "slot_1": "analyst",
        "slot_2": "philosopher",
        "slot_3": "pragmatist",
        "slot_4": "contrarian",
    }


# ─── Get / save baseline ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_returns_default_panel_on_first_call(app_client, make_user):
    user = make_user(email="panel-default@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/panel", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert body == _all_free_panel()


@pytest.mark.asyncio
async def test_save_rejects_duplicates(app_client, make_user):
    user = make_user(email="panel-dup@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/panel/save",
        json={
            "slot_1": "analyst",
            "slot_2": "analyst",  # duplicate
            "slot_3": "pragmatist",
            "slot_4": "contrarian",
        },
        headers=_pro_headers(user),
    )
    assert res.status_code == 422
    # Behavior-level envelope pin (cycle-89 pattern): if the route ever
    # regresses to detail='string', this fails before the AST detector
    # even has to.
    detail = res.json().get("detail")
    assert isinstance(detail, dict)
    assert detail["error"] == "validation_error"
    assert "duplicate" in detail["message"].lower()


@pytest.mark.asyncio
async def test_save_rejects_invalid_persona(app_client, make_user):
    user = make_user(email="panel-invalid@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/panel/save",
        json={
            "slot_1": "analyst",
            "slot_2": "philosopher",
            "slot_3": "pragmatist",
            "slot_4": "not-a-real-persona",
        },
        headers=_pro_headers(user),
    )
    assert res.status_code == 422
    detail = res.json().get("detail")
    assert isinstance(detail, dict)
    assert detail["error"] == "validation_error"
    assert "invalid persona" in detail["message"].lower()


@pytest.mark.asyncio
async def test_save_rejects_paywalled_for_free_tier(app_client, make_user):
    user = make_user(email="panel-paywall@test.com", tier=UserTier.FREE)
    res = await app_client.post(
        "/api/panel/save",
        json={
            "slot_1": "analyst",
            "slot_2": "philosopher",
            "slot_3": "pragmatist",
            "slot_4": "scientist",  # PLUS/PRO only
        },
        headers=_pro_headers(user),
    )
    assert res.status_code == 403
    detail = res.json().get("detail")
    assert isinstance(detail, dict)
    assert detail["error"] == "persona_not_allowed"
    assert "blocked_personas" in detail


@pytest.mark.asyncio
async def test_save_strips_overlong_slot(app_client, make_user):
    """UI bug sending a 100KB string must NOT reach the DB layer."""
    user = make_user(email="panel-long@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/panel/save",
        json={
            "slot_1": "x" * 200,
            "slot_2": "philosopher",
            "slot_3": "pragmatist",
            "slot_4": "contrarian",
        },
        headers=_pro_headers(user),
    )
    # Pydantic ValidationError surfaces as 422.
    assert res.status_code == 422
    detail = res.json().get("detail")
    assert isinstance(detail, dict)
    # FastAPI/Pydantic ValidationError envelope (not ErrorCodes.X).
    # Pin shape only — exact error string is a Pydantic internal.
    assert "error" in detail
    assert "message" in detail or "detail" in detail


# ─── Presets ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_presets_returns_all_five(app_client, make_user):
    user = make_user(email="presets-list@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/panel/presets", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 5
    names = {p["name"] for p in body["presets"]}
    assert names == {"default", "stress_test", "build_it", "long_view", "human_centered"}


@pytest.mark.asyncio
async def test_list_presets_marks_all_available_for_pro(app_client, make_user):
    """PRO can access every persona, so every preset must be available."""
    user = make_user(email="presets-pro@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/panel/presets", headers=_pro_headers(user))
    for preset in res.json()["presets"]:
        assert preset["available_for_tier"] is True
        assert preset["blocked_personas"] == []


@pytest.mark.asyncio
async def test_list_presets_flags_paywalled_for_free(app_client, make_user):
    """FREE users should see locked presets surfaced with the offending
    persona_ids, so the UI can render an upgrade CTA rather than hiding
    them entirely."""
    user = make_user(email="presets-free@test.com", tier=UserTier.FREE)
    res = await app_client.get("/api/panel/presets", headers=_pro_headers(user))
    presets = res.json()["presets"]
    by_name = {p["name"]: p for p in presets}

    # 'stress_test' uses devilsadvocate + scientist — both paywalled.
    assert by_name["stress_test"]["available_for_tier"] is False
    assert "devilsadvocate" in by_name["stress_test"]["blocked_personas"]

    # 'default' is all-free — must remain available.
    assert by_name["default"]["available_for_tier"] is True
    assert by_name["default"]["blocked_personas"] == []


@pytest.mark.asyncio
async def test_apply_preset_persists(app_client, make_user):
    user = make_user(email="preset-apply@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/panel/preset/build_it", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "saved"
    assert body["preset"] == "build_it"
    assert body["panel"]["slot_1"] == "engineer"

    # Confirm the new panel is what GET returns now.
    res = await app_client.get("/api/panel", headers=_pro_headers(user))
    assert res.json()["slot_1"] == "engineer"


@pytest.mark.asyncio
async def test_apply_preset_404_for_unknown_name(app_client, make_user):
    user = make_user(email="preset-404@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/panel/preset/banana", headers=_pro_headers(user)
    )
    assert res.status_code == 404
    assert res.json()["detail"]["preset"] == "banana"


@pytest.mark.asyncio
async def test_apply_preset_403_for_paywalled(app_client, make_user):
    """A FREE user trying to apply a preset containing paywalled personas
    must get a 403 listing the blockers."""
    user = make_user(email="preset-paywall@test.com", tier=UserTier.FREE)
    res = await app_client.post(
        "/api/panel/preset/build_it", headers=_pro_headers(user)
    )
    assert res.status_code == 403


# ─── PATCH single slot ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_patch_single_slot(app_client, make_user):
    user = make_user(email="patch-ok@test.com", tier=UserTier.PRO)
    res = await app_client.patch(
        "/api/panel",
        json={"slot": "slot_1", "persona_id": "engineer"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["panel"]["slot_1"] == "engineer"
    assert body["changed_slot"] == "slot_1"
    # Other slots untouched.
    assert body["panel"]["slot_2"] == "philosopher"

    # And it persists.
    res = await app_client.get("/api/panel", headers=_pro_headers(user))
    assert res.json()["slot_1"] == "engineer"


@pytest.mark.asyncio
async def test_patch_rejects_duplicate_with_existing_slot(app_client, make_user):
    """Replacing slot_1 with 'philosopher' (already in slot_2) would create
    a duplicate — PATCH must enforce the same invariant as full save."""
    user = make_user(email="patch-dup@test.com", tier=UserTier.PRO)
    res = await app_client.patch(
        "/api/panel",
        json={"slot": "slot_1", "persona_id": "philosopher"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_patch_rejects_paywalled(app_client, make_user):
    user = make_user(email="patch-paywall@test.com", tier=UserTier.FREE)
    res = await app_client.patch(
        "/api/panel",
        json={"slot": "slot_1", "persona_id": "scientist"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_patch_rejects_invalid_slot_name(app_client, make_user):
    """slot must match the regex — 'slot_5' or 'foo' must NOT silently
    bind to anything."""
    user = make_user(email="patch-bad-slot@test.com", tier=UserTier.PRO)
    res = await app_client.patch(
        "/api/panel",
        json={"slot": "slot_5", "persona_id": "analyst"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_patch_rejects_unknown_persona(app_client, make_user):
    user = make_user(email="patch-bad-p@test.com", tier=UserTier.PRO)
    res = await app_client.patch(
        "/api/panel",
        json={"slot": "slot_1", "persona_id": "ghost-persona"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


# ─── Reset ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_reset_returns_to_default(app_client, make_user):
    user = make_user(email="reset-ok@test.com", tier=UserTier.PRO)
    # First, set a non-default panel.
    await app_client.post(
        "/api/panel/save",
        json={
            "slot_1": "engineer",
            "slot_2": "scientist",
            "slot_3": "futurist",
            "slot_4": "historian",
        },
        headers=_pro_headers(user),
    )
    res = await app_client.delete("/api/panel", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "reset"
    assert body["panel"] == _all_free_panel()

    # And it's persisted.
    res = await app_client.get("/api/panel", headers=_pro_headers(user))
    assert res.json() == _all_free_panel()


# ─── Auth ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_panel_endpoints_require_auth(app_client):
    for method, path in [
        ("GET", "/api/panel"),
        ("GET", "/api/panel/presets"),
        ("POST", "/api/panel/save"),
        ("PATCH", "/api/panel"),
        ("DELETE", "/api/panel"),
    ]:
        if method == "PATCH":
            res = await app_client.request(method, path, json={"slot": "slot_1", "persona_id": "analyst"})
        elif method == "POST":
            res = await app_client.request(method, path, json=_all_free_panel())
        else:
            res = await app_client.request(method, path)
        assert res.status_code == 401, f"{method} {path} returned {res.status_code}"