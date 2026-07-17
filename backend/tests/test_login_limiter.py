"""Login / registration lockout — record failures only after real failures.

Regression: the old check_and_record(success=False) pre-counted every
request. After (max-1) wrong passwords, a *correct* password still
locked the IP before authenticate_user ran.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from arena.core.login_limiter import LoginRateLimiter


class _FakeRequest:
    def __init__(self, host: str = "203.0.113.10"):
        self.client = SimpleNamespace(host=host)
        self.headers: dict[str, str] = {}


@pytest.fixture
def limiter():
    return LoginRateLimiter(max_attempts=3, window_seconds=3600, lockout_seconds=600)


def test_correct_password_after_failures_still_succeeds(limiter):
    """Core regression: (max-1) failures must not block the next success."""
    req = _FakeRequest()
    for _ in range(2):  # max_attempts - 1
        limiter.assert_not_locked(req)
        limiter.record_failure(req)

    # Third try is the recovery with correct password — only lockout check.
    limiter.assert_not_locked(req)
    limiter.clear(req)  # success
    # Still not locked; further attempts allowed.
    limiter.assert_not_locked(req)


def test_max_failures_locks_ip(limiter):
    req = _FakeRequest()
    for _ in range(2):
        limiter.assert_not_locked(req)
        limiter.record_failure(req)

    with pytest.raises(HTTPException) as ei:
        limiter.record_failure(req)  # 3rd failure → lock
    assert ei.value.status_code == 429
    assert ei.value.detail["error"] == "too_many_attempts"

    with pytest.raises(HTTPException) as ei2:
        limiter.assert_not_locked(req)
    assert ei2.value.status_code == 429


def test_assert_not_locked_does_not_record(limiter):
    req = _FakeRequest()
    for _ in range(10):
        limiter.assert_not_locked(req)
    # No failures recorded → never locked.
    limiter.assert_not_locked(req)


def test_success_clears_failure_window(limiter):
    req = _FakeRequest()
    limiter.record_failure(req)
    limiter.record_failure(req)
    limiter.clear(req)
    # Two more failures after clear must not lock (need 3 in window).
    limiter.record_failure(req)
    limiter.record_failure(req)
    limiter.assert_not_locked(req)


def test_compatibility_wrapper_no_longer_pre_records(limiter):
    req = _FakeRequest()
    for _ in range(10):
        limiter.check_and_record(req, success=False)
    limiter.check_and_record(req, success=True)
    limiter.assert_not_locked(req)


def test_different_ips_isolated(limiter):
    a = _FakeRequest("198.51.100.1")
    b = _FakeRequest("198.51.100.2")
    for _ in range(3):
        try:
            limiter.record_failure(a)
        except HTTPException:
            pass
    # B never failed.
    limiter.assert_not_locked(b)


@pytest.mark.asyncio
async def test_login_success_after_typos(app_client, isolated_db, make_user):
    """End-to-end: 4 wrong passwords then correct still logs in (max=5)."""
    from arena.core.login_limiter import login_limiter

    login_limiter.reset()
    make_user(email="recover@test.com", password="Strong1Pass")

    for i in range(4):
        r = await app_client.post(
            "/api/auth/login",
            json={"email": "recover@test.com", "password": f"Wrong{i}Pass1"},
        )
        assert r.status_code in (401, 429), r.text

    ok = await app_client.post(
        "/api/auth/login",
        json={"email": "recover@test.com", "password": "Strong1Pass"},
    )
    assert ok.status_code == 200, (
        f"correct password after 4 typos must succeed; got {ok.status_code} {ok.text}"
    )
    assert "access_token" in ok.json()
    login_limiter.reset()


@pytest.mark.asyncio
async def test_login_locks_after_max_failures(app_client, isolated_db, make_user):
    from arena.core.login_limiter import login_limiter

    login_limiter.reset()
    make_user(email="brute@test.com", password="Strong1Pass")

    statuses = []
    for i in range(6):
        r = await app_client.post(
            "/api/auth/login",
            json={"email": "brute@test.com", "password": f"BadPass{i}x1"},
        )
        statuses.append(r.status_code)

    assert 429 in statuses, f"expected lockout 429 in {statuses}"
    # Even correct password is blocked while locked.
    locked = await app_client.post(
        "/api/auth/login",
        json={"email": "brute@test.com", "password": "Strong1Pass"},
    )
    assert locked.status_code == 429
    login_limiter.reset()
