"""Integration tests for /api/auth/me/features."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


# ─── Auth + envelope ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_features_requires_auth(app_client):
    res = await app_client.get("/api/auth/me/features")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_features_returns_envelope(app_client, make_user):
    user = make_user(email="feat-env@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/auth/me/features", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert "tier" in body
    assert "features" in body
    assert isinstance(body["features"], dict)


# ─── Per-tier behavior ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_free_user_gets_limited_features(app_client, make_user):
    """FREE users must NOT have agent_mode or unlimited_debates — the
    upgrade CTA depends on these being False."""
    user = make_user(email="feat-free@test.com", tier=UserTier.FREE)
    res = await app_client.get(
        "/api/auth/me/features", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["features"]["agent_mode"] is False
    assert body["features"]["unlimited_debates"] is False
    assert body["features"]["debate"] is False


@pytest.mark.asyncio
async def test_plus_user_gets_premium_features(app_client, make_user):
    """PLUS users get most premium features but NOT agent_mode (the
    Agent Mode add-on is a separate purchase)."""
    user = make_user(email="feat-plus@test.com", tier=UserTier.PLUS)
    res = await app_client.get(
        "/api/auth/me/features", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["features"]["agent_mode"] is False
    # Other PLUS features are True.
    assert body["features"]["debate"] is True
    assert body["features"]["memory"] is True


@pytest.mark.asyncio
async def test_pro_user_gets_everything(app_client, make_user):
    user = make_user(email="feat-pro@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/auth/me/features", headers=_pro_headers(user)
    )
    body = res.json()
    # PRO is the top tier — every feature is True.
    for name, value in body["features"].items():
        assert value is True, f"PRO {name} should be True, got {value}"


@pytest.mark.asyncio
async def test_features_tier_field_matches_user(app_client, make_user):
    """The tier field in the response must match the user's tier —
    the UI uses it to highlight the user's row in the pricing table."""
    user = make_user(email="feat-tier@test.com", tier=UserTier.PLUS)
    res = await app_client.get(
        "/api/auth/me/features", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["tier"] in {"PLUS", "plus"}


# ─── Consistency ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_features_consistent_with_user_tier(app_client, make_user):
    """The feature map must agree with the user's tier — a FREE user
    must never see agent_mode=True even briefly during a session
    upgrade. This is the contract the upgrade modal relies on."""
    user = make_user(email="feat-consistent@test.com", tier=UserTier.FREE)
    res = await app_client.get(
        "/api/auth/me/features", headers=_pro_headers(user)
    )
    body = res.json()
    if body["tier"].lower() == "free":
        # Every gated feature is False.
        for name in ("agent_mode", "unlimited_debates", "agent_orchestrate"):
            assert body["features"][name] is False, (
                f"FREE user must not have {name} enabled"
            )