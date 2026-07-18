"""Direct unit tests for arena.core.rate_limits.

The ``InMemoryRateLimiter.hit`` is the central security helper
that gates every rate-limit response in the codebase. It is
imported by:
  - arena.core.rate_limits.enforce_ip_rate_limit (cycle 23's
    /api/auth/check-email uses this)
  - arena.core.rate_limits.enforce_user_rate_limit
  - All auth + agent + payments + analytics routes

Every prior test of the rate-limit behavior either:
  1. Tests the integration (e.g. test_analytics_rate_limit.py
     monkeypatches ``rate_limiter.hit`` with a fake that always
     raises — does NOT exercise the real hit logic)
  2. Verifies a 429 response on a route (passes only because the
     integration test replaced the helper)

If ``InMemoryRateLimiter.hit`` had a bug (e.g. counting the wrong
way, or returning None instead of raising, or mutating shared
state across keys), NO existing test would catch it.

These tests pin the contract:
  - hit raises HTTPException 429 once `limit` is exceeded in a
    `window_seconds` window
  - hit does NOT raise on the limit-th call (only the (limit+1)-th)
  - the bucket is keyed by `key` (different keys don't share state)
  - hits are dropped from the window once they age out
  - hit's response carries the configured message + a positive
    retry_after
  - ``enforce_ip_rate_limit`` / ``enforce_user_rate_limit`` use the
    same keying scheme the call sites expect (ip:<scope>:<ip> vs
    user:<scope>:<user_id>)

The cycle 25 + 26 trend (direct tests for shared helpers) applies
here too: a 1-line helper used by 20+ routes deserves a direct
test that pins the contract independently of every caller.
"""

from __future__ import annotations

import time

import pytest
from fastapi import HTTPException

from arena.core.rate_limits import (
    InMemoryRateLimiter,
    enforce_ip_rate_limit,
    enforce_user_rate_limit,
    rate_limiter,
)


# ─── InMemoryRateLimiter.hit — the central security primitive ─────────


def test_hit_does_not_raise_under_limit():
    """N calls where N <= limit must all succeed silently."""
    bucket = InMemoryRateLimiter()
    for i in range(5):
        bucket.hit("user:scope:1", limit=5, window_seconds=60, message="over")
    # No exception => pass.


def test_hit_raises_on_limit_plus_one():
    """The (limit+1)-th call inside the window must raise 429."""
    bucket = InMemoryRateLimiter()
    for i in range(5):
        bucket.hit("user:scope:1", limit=5, window_seconds=60, message="over")
    with pytest.raises(HTTPException) as exc_info:
        bucket.hit("user:scope:1", limit=5, window_seconds=60, message="over")
    assert exc_info.value.status_code == 429


def test_hit_error_includes_message_and_retry_after():
    """The 429 body must include the configured message and a positive retry_after."""
    bucket = InMemoryRateLimiter()
    for i in range(3):
        bucket.hit("user:scope:1", limit=3, window_seconds=60, message="rate limit hit")
    with pytest.raises(HTTPException) as exc_info:
        bucket.hit("user:scope:1", limit=3, window_seconds=60, message="rate limit hit")
    detail = exc_info.value.detail
    assert detail["error"] == "rate_limit_exceeded"
    assert detail["message"] == "rate limit hit"
    assert detail["retry_after"] >= 1


def test_hit_keys_are_independent():
    """Different keys (ip, scope, ip) must not share state.

    A regression where the limiter used a single global bucket would
    trip a /api/auth/refresh request as soon as /api/auth/login had
    been called 5 times — silent DoS on every unrelated route.
    """
    bucket = InMemoryRateLimiter()
    for i in range(5):
        bucket.hit("ip:scope:1.1.1.1", limit=5, window_seconds=60, message="x")
    # Different IP, same scope: must NOT be limited.
    bucket.hit("ip:scope:2.2.2.2", limit=5, window_seconds=60, message="x")
    # Different scope, same IP: must NOT be limited either.
    bucket.hit("ip:other_scope:1.1.1.1", limit=5, window_seconds=60, message="x")


def test_hit_window_slides_old_events_out():
    """Events older than window_seconds must not count toward the limit."""
    bucket = InMemoryRateLimiter()
    # Fill the bucket 2 seconds ago in the limit's window.
    now = time.time()
    for i in range(3):
        bucket.hit("user:scope:1", limit=3, window_seconds=2, message="x")
    # Replay the test using the same key but with a 5s window — the
    # 2s-old events are out of the new window, so we should fit another
    # 3 events in. We simulate by directly poking the deque's entries.
    bucket._events["user:scope:1"].clear()
    bucket._events["user:scope:1"].extend([now - 10, now - 9, now - 8])
    # 3 events 8–10s in the past: with window_seconds=5, none count.
    # Make 3 fresh calls — they all should succeed.
    for i in range(3):
        bucket.hit("user:scope:1", limit=3, window_seconds=5, message="x")


def test_hit_429_retry_after_decreases_as_window_ages():
    """retry_after should shrink as the oldest event approaches the window edge."""
    bucket = InMemoryRateLimiter()
    # Force the deque to have an event 5 seconds in the past.
    # _events is a defaultdict(deque) so direct assignment works.
    bucket._events["user:scope:1"] = __import__("collections").deque()
    bucket._events["user:scope:1"].append(time.time() - 5)
    with pytest.raises(HTTPException) as exc_info:
        bucket.hit("user:scope:1", limit=1, window_seconds=10, message="x")
    # retry_after = max(1, int(10 - 5)) = 5, with a tiny fraction of a
    # second elapsed it could be 4 or even 1 (clamped). The contract
    # is: positive, ≤ window_seconds, and decreases as the oldest
    # event ages.
    retry_after = exc_info.value.detail["retry_after"]
    assert 1 <= retry_after <= 5
    # Now re-run with the event 9 seconds in the past — retry_after
    # should be 1 (clamped) since the window is almost expired.
    bucket._events["user:scope:1"] = __import__("collections").deque()
    bucket._events["user:scope:1"].append(time.time() - 9)
    with pytest.raises(HTTPException) as exc_info2:
        bucket.hit("user:scope:1", limit=1, window_seconds=10, message="x")
    assert exc_info2.value.detail["retry_after"] == 1


# ─── enforce_ip_rate_limit / enforce_user_rate_limit — the wrappers ───


class _FakeRequest:
    def __init__(self, ip: str = "1.2.3.4"):
        self.client = type("C", (), {"host": ip})()
        self.headers = {}


def test_enforce_ip_rate_limit_keys_by_ip():
    """Different IPs must have independent buckets."""
    a, b = _FakeRequest("1.1.1.1"), _FakeRequest("2.2.2.2")
    for i in range(5):
        enforce_ip_rate_limit(a, scope="test_scope", limit=5, window_seconds=60, message="x")
    # Different IP, same scope: should not be limited.
    enforce_ip_rate_limit(b, scope="test_scope", limit=5, window_seconds=60, message="x")


def test_enforce_user_rate_limit_keys_by_user():
    """Different user_ids must have independent buckets."""
    for i in range(5):
        enforce_user_rate_limit(1, scope="test_scope", limit=5, window_seconds=60, message="x")
    # Different user, same scope: should not be limited.
    enforce_user_rate_limit(2, scope="test_scope", limit=5, window_seconds=60, message="x")


def test_enforce_ip_uses_different_keyspace_than_enforce_user():
    """A user-scoped bucket must not interfere with an IP-scoped bucket
    and vice versa — even if the literal '1' and '1.1.1.1' collide on
    string prefix."""
    enforce_user_rate_limit(1, scope="twin", limit=1, window_seconds=60, message="x")
    # IP bucket under a different key namespace — should be allowed.
    enforce_ip_rate_limit(_FakeRequest("1.1.1.1"), scope="twin", limit=1, window_seconds=60, message="x")


# ─── Module-level singleton sanity ──────────────────────────────────────


def test_module_level_rate_limiter_is_singleton():
    """The module exposes a single InMemoryRateLimiter instance. Tests that
    monkeypatch ``rate_limiter.hit`` rely on this — if someone
    accidentally creates a new instance here, every monkeypatch call
    silently does nothing and rate-limit tests become no-ops."""
    from arena.core import rate_limits as rl
    assert isinstance(rl.rate_limiter, InMemoryRateLimiter)
    # Hit the same key on the singleton and a fresh instance — the
    # singleton's bucket must be the one tracking the count.
    fresh = InMemoryRateLimiter()
    rl.rate_limiter._events.clear()
    for i in range(3):
        rl.rate_limiter.hit("user:singleton:test", limit=3, window_seconds=60, message="x")
    # Singleton has 3 events, fresh has 0. Independent state.
    assert len(rl.rate_limiter._events.get("user:singleton:test", [])) == 3
    assert len(fresh._events.get("user:singleton:test", [])) == 0


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Each test starts from a clean rate limiter state.

    Mirrors the cycle 25 conftest pattern: the ``_events`` dict is
    module-level, so without this fixture a test that hits the
    limiter and a later test that hits the same key would
    cross-contaminate.
    """
    rate_limiter._events.clear()
    yield
    rate_limiter._events.clear()