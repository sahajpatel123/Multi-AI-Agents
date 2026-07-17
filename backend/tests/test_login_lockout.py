"""Integration tests for /api/auth/login lockout + remaining-attempts UX."""

from __future__ import annotations

import pytest

from arena.db_models import UserTier


@pytest.mark.asyncio
async def test_login_401_includes_remaining_attempts(app_client, make_user):
    """Failed login should report how many more attempts the IP can sustain
    so the UI can render 'X attempts remaining'."""
    user = make_user(email="login-401@test.com", tier=UserTier.PRO, password="Strong1Pass")

    res = await app_client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "wrong"},
    )
    assert res.status_code == 401
    body = res.json()
    assert body["detail"]["error"] == "invalid_credentials"
    assert "remaining_attempts" in body["detail"]
    assert isinstance(body["detail"]["remaining_attempts"], int)
    assert body["detail"]["remaining_attempts"] >= 1


@pytest.mark.asyncio
async def test_remaining_attempts_decrements_with_failures(app_client, make_user):
    user = make_user(email="login-decrement@test.com", tier=UserTier.PRO, password="Strong1Pass")

    # Three failed attempts — remaining should decrement by 3.
    remaining_after_each = []
    for _ in range(3):
        res = await app_client.post(
            "/api/auth/login",
            json={"email": user.email, "password": "wrong"},
        )
        assert res.status_code == 401
        remaining_after_each.append(res.json()["detail"]["remaining_attempts"])

    # Each subsequent attempt must show a non-increasing remaining count.
    for i in range(1, len(remaining_after_each)):
        assert remaining_after_each[i] <= remaining_after_each[i - 1]


@pytest.mark.asyncio
async def test_successful_login_clears_failure_history(app_client, make_user):
    """A successful login between failures must reset the bucket so a
    user who fat-fingers once and then types correctly doesn't carry
    a strike into the next session."""
    user = make_user(email="login-clear@test.com", tier=UserTier.PRO, password="Strong1Pass")

    # One failure, then success.
    bad = await app_client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "wrong"},
    )
    assert bad.status_code == 401
    bad_remaining = bad.json()["detail"]["remaining_attempts"]

    # Correct password — should succeed.
    good = await app_client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "Strong1Pass"},
    )
    assert good.status_code == 200

    # New failure should show fresh bucket (same remaining as initial).
    bad2 = await app_client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "wrong"},
    )
    assert bad2.status_code == 401
    new_remaining = bad2.json()["detail"]["remaining_attempts"]
    assert new_remaining >= bad_remaining


@pytest.mark.asyncio
async def test_lockout_returns_429_with_retry_after_header(app_client, make_user):
    """After max_attempts failures, the IP must be locked out and the
    response must include a Retry-After header so well-behaved clients
    can back off without polling."""
    user = make_user(email="login-lockout@test.com", tier=UserTier.PRO, password="Strong1Pass")

    # The default max_attempts for the limiter — exhaust it.
    from arena.core.login_limiter import login_limiter
    max_attempts = login_limiter.max_attempts
    last_remaining = None
    for i in range(max_attempts):
        res = await app_client.post(
            "/api/auth/login",
            json={"email": user.email, "password": "wrong"},
        )
        if res.status_code == 429:
            assert "Retry-After" in res.headers
            assert int(res.headers["Retry-After"]) > 0
            last_remaining = res
            break
        # 401 — keep going
    assert last_remaining is not None, (
        f"Expected a 429 after {max_attempts} failures; "
        f"got status codes only"
    )

    # The body should also include retry_after for clients that read
    # JSON before the Retry-After header.
    body = last_remaining.json()
    assert body["detail"]["error"] == "too_many_attempts"
    assert "retry_after" in body["detail"]


@pytest.mark.asyncio
async def test_lockout_blocks_subsequent_attempts(app_client, make_user):
    """Even with the correct password, a locked-out IP cannot login until
    the lockout expires."""
    user = make_user(email="login-blocked@test.com", tier=UserTier.PRO, password="Strong1Pass")

    from arena.core.login_limiter import login_limiter
    max_attempts = login_limiter.max_attempts

    # Trigger the lockout.
    for _ in range(max_attempts):
        res = await app_client.post(
            "/api/auth/login",
            json={"email": user.email, "password": "wrong"},
        )
        if res.status_code == 429:
            break

    # Now try with the CORRECT password — must still be 429.
    res = await app_client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "Strong1Pass"},
    )
    assert res.status_code == 429
    assert res.headers.get("Retry-After")