"""Regression tests for ``LoginRateLimiter``.

The limiter sits in front of every login + registration attempt. A
regression here would either:

  - Drop the lockout check → attacker brute-forces with no cooldown.
  - Forget to clear on success → a successful user gets locked out
    after one bad attempt.
  - Forget the sliding window → old failures count toward the limit
    forever, locking out legitimate users who used to have bad luck.
  - Forget the Retry-After header → well-behaved clients poll,
    amplifying the load.

Pins:
  - ``assert_not_locked`` raises 429 with retry_after + Retry-After
    header while the lock is active.
  - ``record_failure`` Nth call raises 429 (lockout triggered).
  - ``clear`` empties the failure history; does NOT lift an active
    time-based lockout (security contract).
  - The sliding window evicts failures older than ``window_seconds``.
  - Lockouts auto-expire after ``lockout_seconds``.
  - Different IPs are tracked independently.
  - Concurrency: parallel record_failure calls do not exceed the limit.
"""

from __future__ import annotations

import threading
import time

import pytest
from fastapi import HTTPException

from arena.core.login_limiter import LoginRateLimiter
from fastapi import Request


def _make_request(ip: str = "203.0.113.1") -> Request:
    scope = {
        "type": "http",
        "headers": [],
        "client": (ip, 0),
    }
    return Request(scope)


@pytest.fixture
def limiter(monkeypatch):
    """A limiter that ignores proxy headers so the ``client_ip`` is
    always the peer (``203.0.113.1``)."""
    from arena.core import client_ip as client_ip_mod

    monkeypatch.setattr(client_ip_mod, "_trust_proxy_headers", lambda: False)
    return LoginRateLimiter(max_attempts=3, window_seconds=60, lockout_seconds=60)


class TestLoginRateLimiterNotLocked:
    def test_unlocked_ip_passes(self, limiter: LoginRateLimiter):
        # Should NOT raise.
        limiter.assert_not_locked(_make_request())

    def test_first_record_failure_does_not_lock(self, limiter: LoginRateLimiter):
        """The first N-1 failures record without raising; only the
        Nth triggers the lockout."""
        for _ in range(2):
            limiter.record_failure(_make_request())
        # Now exactly at max_attempts - 1 failures, no lock yet.
        # The third will trigger the lock.
        with pytest.raises(HTTPException) as exc:
            limiter.record_failure(_make_request())
        assert exc.value.status_code == 429


class TestLoginRateLimiterLockout:
    def test_lockout_triggered_on_max_attempts(self, limiter: LoginRateLimiter):
        """``max_attempts=3`` → the 3rd failure triggers 429."""
        for _ in range(2):
            limiter.record_failure(_make_request())
        with pytest.raises(HTTPException) as exc:
            limiter.record_failure(_make_request())
        assert exc.value.status_code == 429
        detail = exc.value.detail
        assert detail["error"] == "too_many_attempts"
        assert "retry_after" in detail
        assert "Retry-After" in exc.value.headers
        assert exc.value.headers["Retry-After"] == str(detail["retry_after"])

    def test_lockout_blocks_subsequent_attempts(self, limiter: LoginRateLimiter):
        """After lockout, ``assert_not_locked`` raises 429."""
        for _ in range(3):
            try:
                limiter.record_failure(_make_request())
            except HTTPException:
                pass
        # Now the IP is locked.
        with pytest.raises(HTTPException) as exc:
            limiter.assert_not_locked(_make_request())
        assert exc.value.status_code == 429

    def test_lockout_does_not_block_different_ip(self, limiter: LoginRateLimiter):
        """Per-IP isolation — locking one IP must not lock others."""
        for _ in range(3):
            try:
                limiter.record_failure(_make_request(ip="203.0.113.1"))
            except HTTPException:
                pass
        # Different IP is unaffected.
        limiter.assert_not_locked(_make_request(ip="198.51.100.99"))


class TestLoginRateLimiterClear:
    def test_clear_empties_failure_history(self, limiter: LoginRateLimiter):
        limiter.record_failure(_make_request())
        limiter.record_failure(_make_request())
        limiter.clear(_make_request())
        # After clear, remaining_attempts is back to max.
        assert limiter.remaining_attempts(_make_request()) == 3

    def test_clear_does_not_lift_active_lockout(self, limiter: LoginRateLimiter):
        """Security contract: a successful auth from a different path
        MUST NOT lift an active time-based lockout."""
        for _ in range(3):
            try:
                limiter.record_failure(_make_request())
            except HTTPException:
                pass
        # Lockout is active. clear() must not lift it.
        limiter.clear(_make_request())
        with pytest.raises(HTTPException):
            limiter.assert_not_locked(_make_request())


class TestLoginRateLimiterRemainingAttempts:
    def test_initial_value_is_max(self, limiter: LoginRateLimiter):
        assert limiter.remaining_attempts(_make_request()) == 3

    def test_decrements_on_each_failure(self, limiter: LoginRateLimiter):
        limiter.record_failure(_make_request())
        assert limiter.remaining_attempts(_make_request()) == 2
        limiter.record_failure(_make_request())
        assert limiter.remaining_attempts(_make_request()) == 1

    def test_floor_at_zero(self, limiter: LoginRateLimiter):
        """Pin the floor — a negative remaining_attempts would render
        as a confusing UI value.

        Note: after lockout, the bucket is cleared (see source
        ``self._attempts[ip] = []``), so ``remaining_attempts``
        returns ``max_attempts`` (no failures left, lockout is
        separate). The contract being pinned here is just: the value
        is never negative."""
        # Three failures, last one triggers lockout.
        for _ in range(3):
            try:
                limiter.record_failure(_make_request())
            except HTTPException:
                pass
        # The remaining must be ≥ 0 (the floor).
        assert limiter.remaining_attempts(_make_request()) >= 0


class TestLoginRateLimiterWindowSlides:
    def test_old_failures_age_out(self, limiter: LoginRateLimiter, monkeypatch):
        """Mock time so failures from t=0 age out by t=window+1."""
        base = time.time()
        monkeypatch.setattr(time, "time", lambda: base)
        limiter.record_failure(_make_request())
        # One failure recorded at t=0. remaining=2.
        assert limiter.remaining_attempts(_make_request()) == 2

        # Advance past the window.
        monkeypatch.setattr(time, "time", lambda: base + 61)
        # The old failure aged out → bucket is empty → remaining=3.
        assert limiter.remaining_attempts(_make_request()) == 3

    def test_lockout_auto_expires(self, limiter: LoginRateLimiter, monkeypatch):
        """The time-based lockout expires after ``lockout_seconds``."""
        base = time.time()
        monkeypatch.setattr(time, "time", lambda: base)
        for _ in range(3):
            try:
                limiter.record_failure(_make_request())
            except HTTPException:
                pass

        # Still locked at t=base+30.
        monkeypatch.setattr(time, "time", lambda: base + 30)
        with pytest.raises(HTTPException):
            limiter.assert_not_locked(_make_request())

        # No longer locked at t=base+61 (lockout_seconds=60).
        monkeypatch.setattr(time, "time", lambda: base + 61)
        # Should NOT raise.
        limiter.assert_not_locked(_make_request())


class TestLoginRateLimiterConcurrency:
    def test_concurrent_record_failures_do_not_exceed_limit(self, limiter: LoginRateLimiter):
        """N threads calling record_failure simultaneously must NOT
        produce more than max_attempts failures before lockout. The
        lock guards the check-then-append window — a regression that
        drops the lock would let N threads see under-limit and all
        proceed (defeating brute-force protection).

        Important: the lockout-triggering call itself raises 429, so
        it's counted as "locked", not "success". Two successes + 1
        lockout-trigger + 17 immediate-blocks = 20 total."""
        success_count = 0
        locked_count = 0
        lock = threading.Lock()

        def _record() -> None:
            nonlocal success_count, locked_count
            try:
                limiter.record_failure(_make_request())
                with lock:
                    success_count += 1
            except HTTPException:
                with lock:
                    locked_count += 1

        threads = [threading.Thread(target=_record) for _ in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # max_attempts=3. Successful appends: 2 (the 3rd raises before
        # completing the append). Subsequent calls raise immediately
        # on the lockout check. Total successes should be ≤ 2 (not 3),
        # because the 3rd append IS the lockout-triggering call.
        assert success_count == 2, (
            f"expected exactly 2 successful appends under the limit "
            f"(the 3rd triggers the lockout and raises), "
            f"got {success_count} (lock regression?)"
        )
        assert locked_count == 18
        assert success_count + locked_count == 20


class TestLoginRateLimiterErrorEnvelope:
    def test_lockout_envelope_shape(self, limiter: LoginRateLimiter):
        for _ in range(2):
            limiter.record_failure(_make_request())
        with pytest.raises(HTTPException) as exc:
            limiter.record_failure(_make_request())
        detail = exc.value.detail
        # Stable keys — the frontend reads these.
        assert "error" in detail
        assert "message" in detail
        assert "retry_after" in detail
        # And the headers carry the same retry-after.
        assert exc.value.headers["Retry-After"] == str(detail["retry_after"])

    def test_lockout_message_mentions_lockout(self, limiter: LoginRateLimiter):
        for _ in range(2):
            limiter.record_failure(_make_request())
        with pytest.raises(HTTPException) as exc:
            limiter.record_failure(_make_request())
        assert "locked" in exc.value.detail["message"].lower() or "hour" in exc.value.detail["message"].lower()