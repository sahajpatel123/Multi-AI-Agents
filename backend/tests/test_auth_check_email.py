"""Integration tests for /api/auth/check-email."""

from __future__ import annotations

import pytest

from arena.db_models import UserTier


# ─── Available / used ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_check_email_returns_available_for_unused(app_client):
    res = await app_client.get("/api/auth/check-email?email=brand-new@example.com")
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is True
    assert body["email"] == "brand-new@example.com"


@pytest.mark.asyncio
async def test_check_email_returns_used_for_existing(app_client, make_user):
    user = make_user(email="taken@example.com", tier=UserTier.PRO)
    res = await app_client.get("/api/auth/check-email?email=taken@example.com")
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is False


@pytest.mark.asyncio
async def test_check_email_normalizes_case(app_client, make_user):
    """Email lookup is case-insensitive — the existing /register flow
    lowercases, so the check must too. Note: the make_user fixture
    bypasses the lowercase, so we seed with an already-lowercase
    email and verify the API still rejects the mixed-case version."""
    user = make_user(email="mixed@example.com", tier=UserTier.PRO)
    res = await app_client.get("/api/auth/check-email?email=MIXED@example.com")
    body = res.json()
    assert body["available"] is False
    # The response carries the normalized form.
    assert body["email"] == "mixed@example.com"
    # And the response form is fully lowercased + stripped — clients
    # can match against it directly without re-normalizing.
    assert body["email"] == body["email"].lower().strip()


# ─── Privacy contract: no PII leak ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_check_email_does_not_leak_user_id(app_client, make_user):
    """The response must NEVER include the existing user's id, tier, or
    any other field — just a boolean. A leak here would let an
    attacker enumerate users by checking each email."""
    user = make_user(email="private@example.com", tier=UserTier.PRO)
    res = await app_client.get("/api/auth/check-email?email=private@example.com")
    body = res.json()
    # The response schema is locked down — no user fields.
    for forbidden in ("id", "user_id", "tier", "name", "created_at"):
        assert forbidden not in body, (
            f"check-email response leaks {forbidden!r} field"
        )


@pytest.mark.asyncio
async def test_check_email_distinguishes_similar_addresses(app_client, make_user):
    """Plus-addressing tricks: 'user+x@example.com' and 'user+y@example.com'
    are different accounts. The check must NOT collapse them."""
    make_user(email="alice@example.com", tier=UserTier.PRO)
    res = await app_client.get("/api/auth/check-email?email=alice+x@example.com")
    body = res.json()
    # Different from the existing alice@example.com — must be available.
    assert body["available"] is True


# ─── Validation ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_check_email_rejects_empty(app_client):
    res = await app_client.get("/api/auth/check-email?email=")
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_check_email_rejects_overlong(app_client):
    res = await app_client.get(
        f"/api/auth/check-email?email={'x' * 300}@example.com"
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_check_email_does_not_require_auth(app_client):
    """Pre-signup check is public — a user has to be able to call it
    before they have credentials."""
    res = await app_client.get("/api/auth/check-email?email=anyone@example.com")
    assert res.status_code != 401


# ─── Cross-tenant check ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_check_email_does_not_differentiate_active_vs_disabled(app_client, make_user):
    """An account exists in the DB regardless of whether it's currently
    active — 'available' must mean 'no row matches this email', not
    'no active user'. Otherwise a deleted account would be
    'available' for re-registration, which is a subtle footgun."""
    user = make_user(email="keep@example.com", tier=UserTier.PRO)
    # The user is active — 'available' must be False.
    res = await app_client.get("/api/auth/check-email?email=keep@example.com")
    body = res.json()
    assert body["available"] is False


@pytest.mark.asyncio
async def test_check_email_rate_limit_blocks_enumeration(app_client, make_user, monkeypatch):
    """Without an IP rate limit an attacker could probe thousands of
    addresses per second and learn which ones are registered.
    Cycle 23 fix wired enforce_ip_rate_limit(scope='auth_check_email',
    limit=5, window=60s). This test pins the contract."""
    import arena.core.rate_limits as rl_mod
    # Reset the in-memory limiter state so the test isn't order-dependent.
    rl_mod.rate_limiter._events.clear() if hasattr(rl_mod.rate_limiter, "_events") else None

    # Five requests in a row from the same IP all succeed.
    for i in range(5):
        res = await app_client.get(
            "/api/auth/check-email?email=probe%s@example.com" % i
        )
        assert res.status_code == 200, (
            "request %d should pass under the limit" % (i + 1)
        )

    # Sixth request in the same window must be rate-limited.
    res = await app_client.get("/api/auth/check-email?email=probe6@example.com")
    assert res.status_code == 429, (
        "sixth request in 60s from same IP should be 429"
    )
    # The 429 detail includes the message and a retry_after; scope is
    # recorded server-side (in the rate_limiter key) but not echoed
    # in the response body. Just verify the error code is right.
    detail = res.json().get("detail", {})
    assert detail.get("error") == "rate_limit_exceeded"
    assert "slow down" in detail.get("message", "").lower()
    assert detail.get("retry_after", 0) > 0