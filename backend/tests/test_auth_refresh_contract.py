"""End-to-end contract tests for /api/auth/refresh.

The refresh endpoint is the lynchpin of session continuity —
a regression in its shape (e.g. wrong token type, wrong response
fields) would break every long-running tab in production. The
unit-level refresh tests cover blacklist mechanics; this file
locks down the response contract end-to-end.
"""

from __future__ import annotations

import pytest

from arena.core.auth import create_refresh_token
from arena.db_models import UserTier


def _pro_headers(user):
    from arena.core.auth import create_access_token
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


# ─── Auth + token-type contract ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_refresh_rejects_empty_body(app_client, make_user):
    """Refresh must reject an empty body — the token lives in the body,
    not in Authorization. Either 400 (validation) or 401 (no token)
    is acceptable — what matters is the endpoint doesn't mint a token."""
    user = make_user(email="refresh-no-body@test.com", tier=UserTier.PRO)
    res = await app_client.post("/api/auth/refresh", json={})
    assert res.status_code in (400, 401)


@pytest.mark.asyncio
async def test_refresh_rejects_access_token_in_body(app_client, make_user):
    """The endpoint expects a refresh token, not an access token.
    Swapping them must NOT return a new access token — that would
    let a leaked access token mint indefinitely."""
    from arena.core.auth import create_access_token
    user = make_user(email="refresh-mix@test.com", tier=UserTier.PRO)
    access = create_access_token(user.id, user.email)
    res = await app_client.post(
        "/api/auth/refresh", json={"refresh_token": access}, headers=_pro_headers(user)
    )
    assert res.status_code in (400, 401)


@pytest.mark.asyncio
async def test_refresh_rejects_garbage_token(app_client, make_user):
    user = make_user(email="refresh-garbage@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/auth/refresh",
        json={"refresh_token": "not-a-jwt"},
        headers=_pro_headers(user),
    )
    assert res.status_code in (400, 401)


# ─── Success path contract ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_refresh_returns_new_access_and_refresh_tokens(app_client, make_user):
    user = make_user(email="refresh-ok@test.com", tier=UserTier.PRO)
    refresh = create_refresh_token(user.id, user.email)
    res = await app_client.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    # Both new tokens are present and non-empty.
    assert isinstance(body["access_token"], str) and body["access_token"]
    assert isinstance(body["refresh_token"], str) and body["refresh_token"]
    # Refresh rotation: the NEW refresh must NOT equal the OLD one.
    # (Some implementations reuse the same refresh, but ours rotates —
    # a critical security property that this test pins.)
    assert body["refresh_token"] != refresh
    # And it must NOT equal the access token (would be a real mess).
    assert body["refresh_token"] != body["access_token"]
    # The response carries the user payload.
    assert body["user"]["email"] == user.email


@pytest.mark.asyncio
async def test_refresh_old_refresh_becomes_invalid(app_client, make_user):
    """After rotation, the OLD refresh token must NOT be reusable.
    A leaked token that the user already rotated should be a
    dead end."""
    user = make_user(email="refresh-rotate@test.com", tier=UserTier.PRO)
    old_refresh = create_refresh_token(user.id, user.email)
    # First refresh — rotates the token.
    res1 = await app_client.post(
        "/api/auth/refresh",
        json={"refresh_token": old_refresh},
        headers=_pro_headers(user),
    )
    assert res1.status_code == 200
    # Second refresh with the OLD token — must fail (blacklisted on
    # first rotation).
    res2 = await app_client.post(
        "/api/auth/refresh",
        json={"refresh_token": old_refresh},
        headers=_pro_headers(user),
    )
    assert res2.status_code in (401, 400), (
        f"old refresh should be blacklisted after rotation; got {res2.status_code}"
    )


# ─── Tenant isolation ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_refresh_cannot_be_used_for_other_user(app_client, make_user):
    """A refresh token issued for alice must not return bob's data
    even if alice tries to redeem it with bob's bearer."""
    from arena.core.auth import create_access_token
    alice = make_user(email="refresh-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="refresh-bob@test.com", tier=UserTier.PRO)
    # Alice's refresh token.
    alice_refresh = create_refresh_token(alice.id, alice.email)
    # Bob tries to use it.
    res = await app_client.post(
        "/api/auth/refresh",
        json={"refresh_token": alice_refresh},
        headers={"Authorization": f"Bearer {create_access_token(bob.id, bob.email)}"},
    )
    # Either 400/401/403 — what matters is the response doesn't
    # return bob's user data. Some implementations may trust the
    # refresh token's sub claim over the bearer; we don't test the
    # which-is-authoritative question here, only that bob's user
    # payload is not exposed.
    if res.status_code == 200:
        # Defensive: if the endpoint returns 200 anyway, the user
        # field must NOT be bob.
        assert res.json()["user"]["email"] != bob.email