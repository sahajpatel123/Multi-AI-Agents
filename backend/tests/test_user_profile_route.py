"""Integration tests for PATCH /api/user/profile."""

from __future__ import annotations

import pytest

from arena.db_models import UserTier



@pytest.mark.asyncio
async def test_profile_patch_updates_name(app_client, make_user):
    user = make_user(email="profile-name@test.com", tier=UserTier.PRO)
    res = await app_client.patch(
        "/api/user/profile",
        headers=_pro_headers(user),
        json={"name": "Renamed"},
    )
    assert res.status_code == 200
    assert res.json().get("name") == "Renamed"


@pytest.mark.asyncio
async def test_profile_patch_updates_expertise_level(app_client, make_user):
    user = make_user(email="profile-level@test.com", tier=UserTier.PRO)
    res = await app_client.patch(
        "/api/user/profile",
        headers=_pro_headers(user),
        json={"expertise_level": "expert"},
    )
    assert res.status_code == 200
    assert res.json().get("expertise_level") == "expert"


@pytest.mark.asyncio
async def test_profile_patch_rejects_invalid_level(app_client, make_user):
    user = make_user(email="profile-bad-level@test.com", tier=UserTier.PRO)
    res = await app_client.patch(
        "/api/user/profile",
        headers=_pro_headers(user),
        json={"expertise_level": "grandmaster"},
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_profile_patch_trims_expertise_domain(app_client, make_user):
    """Domain whitespace is trimmed by the validator."""
    user = make_user(email="profile-trim@test.com", tier=UserTier.PRO)
    res = await app_client.patch(
        "/api/user/profile",
        headers=_pro_headers(user),
        json={"expertise_domain": "  cryptography  ", "expertise_level": "practitioner"},
    )
    assert res.status_code == 200
    assert res.json().get("expertise_domain") == "cryptography"


@pytest.mark.asyncio
async def test_profile_patch_requires_auth(app_client):
    res = await app_client.patch(
        "/api/user/profile",
        json={"name": "Anonymous"},
    )
    assert res.status_code == 401
