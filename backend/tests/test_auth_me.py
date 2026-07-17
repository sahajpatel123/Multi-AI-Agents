"""Integration tests for GET /api/auth/me."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


# ─── Auth + shape ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_me_requires_auth(app_client):
    res = await app_client.get("/api/auth/me")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_rejects_garbage_bearer(app_client):
    """A malformed bearer token must not 500 — it should 401 like any
    other invalid auth, so the client can recover with a re-login."""
    res = await app_client.get(
        "/api/auth/me", headers={"Authorization": "Bearer not-a-real-jwt"}
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_rejects_blacklisted_token(app_client, make_user, db_session):
    """A token whose jti is in the blacklist must NOT pass /me — the
    blacklist is the 'logout' contract and a logged-out session must
    be observably dead."""
    user = make_user(email="me-black@test.com", tier=UserTier.PRO)
    from arena.core.token_blacklist import add as blacklist_add
    from datetime import datetime, timezone, timedelta
    token = create_access_token(user.id, user.email)
    blacklist_add(
        token,
        datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1),
        db_session,
    )
    res = await app_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


# ─── Payload fields ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_me_returns_email_and_tier(app_client, make_user):
    user = make_user(email="me-payload@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/auth/me", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == user.email
    # Tier is serialized as a string (uppercase enum value).
    assert body["tier"] in {"PRO", "pro"}


@pytest.mark.asyncio
async def test_me_returns_expected_field_set(app_client, make_user):
    """Lock down the /me contract — every field a client relies on.
    A future refactor that drops a field would break the UI without
    this guard."""
    user = make_user(email="me-fields@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/auth/me", headers=_pro_headers(user))
    body = res.json()
    # Must-have fields — every UI that uses /me relies on these.
    for field in ("email", "tier", "id", "name"):
        assert field in body, f"missing required field: {field}"


@pytest.mark.asyncio
async def test_me_is_scoped_to_caller(app_client, make_user):
    """The bearer token must return the bearer, not some other user."""
    alice = make_user(email="me-alice@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/auth/me", headers=_pro_headers(alice))
    body = res.json()
    assert body["email"] == alice.email
    # And not bob's.
    assert "bob@" not in body["email"]


@pytest.mark.asyncio
async def test_me_does_not_leak_password_hash(app_client, make_user):
    """Security: the /me response must NEVER include the password_hash
    field — only public-facing fields. A regression here would leak
    every user's bcrypt hash to anyone with a valid token."""
    user = make_user(email="me-leak@test.com", tier=UserTier.PRO, password="Strong1Pass")
    res = await app_client.get("/api/auth/me", headers=_pro_headers(user))
    body = res.json()
    # Even a substring match — password_hash shouldn't appear anywhere.
    serialized = str(body)
    assert "password_hash" not in serialized
    assert "Strong1Pass" not in serialized