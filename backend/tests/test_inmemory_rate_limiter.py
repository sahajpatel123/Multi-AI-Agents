"""Regression tests for ``InMemoryRateLimiter``.

The limiter sits in front of every security-sensitive endpoint (auth,
payments, agent history, etc.). A regression here would either:

  - Stop tracking the window correctly → rate limits silently double
    or halve, breaking the contract the route handlers depend on.
  - Drop the retry-after header → well-behaved clients retry too
    aggressively, amplifying the load that triggered the limit.
  - Leak the lock → a parallel request races and sees an inconsistent
    bucket, defeating the rate limit.

Pins:
  - Under-limit requests pass through cleanly.
  - At-limit requests raise 429 with the right envelope (error,
    message, retry_after).
  - Over-limit requests also raise 429 with a fresh retry_after
    calculation.
  - The window slides: an event older than ``window_seconds`` is
    popped from the bucket, freeing a slot.
  - Different keys are tracked independently (per-user, per-scope).
  - The Retry-After HTTP header is set.
  - Concurrency: two threads hitting the same key simultaneously do
    not exceed the limit.
"""

from __future__ import annotations

import threading

import pytest
from fastapi import HTTPException

from arena.core.rate_limits import InMemoryRateLimiter


@pytest.fixture
def limiter() -> InMemoryRateLimiter:
    return InMemoryRateLimiter()


class TestRateLimiterUnderLimit:
    def test_single_hit_passes(self, limiter: InMemoryRateLimiter):
        # Should NOT raise.
        limiter.hit("k1", limit=5, window_seconds=60, message="too many")

    def test_at_limit_minus_one_passes(self, limiter: InMemoryRateLimiter):
        for i in range(4):
            limiter.hit("k1", limit=5, window_seconds=60, message="too many")

    def test_at_limit_passes_then_over_raises(self, limiter: InMemoryRateLimiter):
        """At limit == 5, the 5th hit is the boundary. The 6th raises."""
        for _ in range(5):
            limiter.hit("k1", limit=5, window_seconds=60, message="too many")
        with pytest.raises(HTTPException) as exc:
            limiter.hit("k1", limit=5, window_seconds=60, message="too many")
        assert exc.value.status_code == 429


class TestRateLimiterErrorEnvelope:
    def test_envelope_has_error_message_retry_after(self, limiter: InMemoryRateLimiter):
        for _ in range(3):
            limiter.hit("k2", limit=3, window_seconds=60, message="slow down")
        with pytest.raises(HTTPException) as exc:
            limiter.hit("k2", limit=3, window_seconds=60, message="slow down")
        detail = exc.value.detail
        assert detail["error"] == "rate_limit_exceeded"
        assert detail["message"] == "slow down"
        # retry_after must be a positive integer ≤ window_seconds.
        assert isinstance(detail["retry_after"], int)
        assert 1 <= detail["retry_after"] <= 60

    def test_retry_after_header_is_set(self, limiter: InMemoryRateLimiter):
        for _ in range(2):
            limiter.hit("k3", limit=2, window_seconds=60, message="slow")
        with pytest.raises(HTTPException) as exc:
            limiter.hit("k3", limit=2, window_seconds=60, message="slow")
        assert "Retry-After" in exc.value.headers
        # The header value matches the body retry_after.
        assert exc.value.headers["Retry-After"] == str(exc.value.detail["retry_after"])

    def test_retry_after_floor_is_one(self, limiter: InMemoryRateLimiter):
        """``max(1, ...)`` floor — a sub-second retry would round up
        to 1 second so the client doesn't tight-loop."""
        for _ in range(5):
            limiter.hit("k4", limit=5, window_seconds=1, message="slow")
        with pytest.raises(HTTPException) as exc:
            limiter.hit("k4", limit=5, window_seconds=1, message="slow")
        # Window is 1s, so retry_after can be 1 — the floor.
        assert exc.value.detail["retry_after"] >= 1


class TestRateLimiterWindowSlides:
    def test_old_event_pops_and_frees_slot(self, limiter: InMemoryRateLimiter, monkeypatch):
        """Mock time so an old event can age out — verifies the
        popleft-while-old branch without sleeping for real seconds."""
        import time as _time

        # First 3 hits at time=0.
        base = _time.time()
        monkeypatch.setattr(_time, "time", lambda: base)
        for _ in range(3):
            limiter.hit("k5", limit=3, window_seconds=10, message="x")

        # Advance the clock past the window. All 3 events should age out.
        monkeypatch.setattr(_time, "time", lambda: base + 11)
        # The bucket is now empty → the next hit must pass.
        limiter.hit("k5", limit=3, window_seconds=10, message="x")

    def test_partial_window_keeps_recent_events(self, limiter: InMemoryRateLimiter, monkeypatch):
        """Only events OLDER than the window are popped — recent ones
        stay in the bucket."""
        import time as _time

        base = _time.time()
        monkeypatch.setattr(_time, "time", lambda: base)
        # 3 hits at t=0.
        for _ in range(3):
            limiter.hit("k6", limit=3, window_seconds=10, message="x")

        # Advance to t=5 (half the window). All 3 events still valid.
        monkeypatch.setattr(_time, "time", lambda: base + 5)
        # The 4th hit should raise (limit still 3).
        with pytest.raises(HTTPException):
            limiter.hit("k6", limit=3, window_seconds=10, message="x")


class TestRateLimiterKeyIsolation:
    def test_different_keys_tracked_independently(self, limiter: InMemoryRateLimiter):
        """Two distinct keys (per-user, per-scope) must NOT share a
        bucket — a single abusive user on one scope must not lock
        out a legitimate user on a different scope."""
        # Max out key "user:1:scope_a".
        for _ in range(5):
            limiter.hit("user:1:scope_a", limit=5, window_seconds=60, message="x")
        with pytest.raises(HTTPException):
            limiter.hit("user:1:scope_a", limit=5, window_seconds=60, message="x")

        # But "user:2:scope_a" and "user:1:scope_b" are independent.
        # Should NOT raise.
        limiter.hit("user:2:scope_a", limit=5, window_seconds=60, message="x")
        limiter.hit("user:1:scope_b", limit=5, window_seconds=60, message="x")


class TestRateLimiterConcurrency:
    def test_concurrent_hits_do_not_exceed_limit(self, limiter: InMemoryRateLimiter):
        """N threads hitting the same key simultaneously must NOT
        produce more than ``limit`` successful hits — the lock guards
        the check-then-append window. A regression that drops the
        lock would let all N threads see under-limit and append,
        defeating the rate limit."""
        success_count = 0
        over_limit_count = 0
        lock = threading.Lock()

        def _hit() -> None:
            nonlocal success_count, over_limit_count
            try:
                limiter.hit("k7", limit=10, window_seconds=60, message="x")
                with lock:
                    success_count += 1
            except HTTPException:
                with lock:
                    over_limit_count += 1

        threads = [threading.Thread(target=_hit) for _ in range(50)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert success_count == 10, (
            f"expected exactly 10 successful hits under the limit, "
            f"got {success_count} (lock regression?)"
        )
        assert over_limit_count == 40
        assert success_count + over_limit_count == 50