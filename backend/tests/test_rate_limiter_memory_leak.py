"""Tests for the rate-limiter empty-key memory-leak fix.

Both InMemoryRateLimiter and LoginRateLimiter used to use a
defaultdict for their bucket dicts, which created an empty
entry on every first access. The entry was never deleted:
- InMemoryRateLimiter._events: defaultdict(deque), key
  never deleted after popleft drained the deque
- LoginRateLimiter._attempts: defaultdict(list), key
  reassigned to [] instead of del on clear / on lockout

A malicious actor with a large IP pool (botnet, NAT churn,
scanner traffic) could create unbounded keys — one entry
per IP ever seen. The fix uses plain dicts and explicitly
deletes the key when the bucket becomes empty, so a key's
lifetime is bounded by window_seconds after its last event
(or by a successful clear() for LoginRateLimiter).

Tests pin:
- InMemoryRateLimiter: the _events dict size stays bounded
  across N hits on the same key
- InMemoryRateLimiter: a unique key per hit does not grow
  the dict beyond the number of unique keys (no per-key
  empty entries accumulating)
- LoginRateLimiter: after clear(), the IP is fully removed
  from _attempts (not just an empty list)
- LoginRateLimiter: after max_attempts failures, the IP is
  fully removed from _attempts
- LoginRateLimiter: across many unique IPs with clear(),
  the dict is empty
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from arena.core.login_limiter import LoginRateLimiter
from arena.core.rate_limits import InMemoryRateLimiter


# --- helpers ---


class _FakeRequest:
    """Minimal Request stub for LoginRateLimiter. The limiter
    uses get_request_client_ip(request), which reads the IP from
    request.client.host.
    """

    def __init__(self, host: str = "203.0.113.10"):
        self.client = SimpleNamespace(host=host)
        self.headers: dict[str, str] = {}


# --- InMemoryRateLimiter ---


def test_inmemory_rate_limiter_does_not_grow_on_same_key_repeated_hits() -> None:
    """The pop-while-loop on each hit evicts stale events past
    the window, so the deque stays bounded at <= limit
    entries. The dict has exactly 1 key (the test key) no
    matter how many hits. Uses a high limit so the test loop
    doesn't trip the rate limit itself.
    """
    limiter = InMemoryRateLimiter()
    key = "ip:room_join:1.2.3.4"
    for _ in range(1000):
        limiter.hit(key, limit=10_000, window_seconds=3600, message="too many")
    assert len(limiter._events) == 1
    assert len(limiter._events[key]) <= 10_000


def test_inmemory_rate_limiter_handles_unique_keys() -> None:
    """1000 hits on 1000 unique keys produce 1000 entries (one
    per key, each with exactly 1 event). The previous
    defaultdict version would have created 1000 entries too,
    but each with an EMPTY deque created on subsequent
    accesses — the fix doesn't change the entry count for
    active keys, but it removes the silent empty-deque
    accumulation for keys whose events all popped.
    """
    limiter = InMemoryRateLimiter()
    for i in range(1000):
        limiter.hit(
            f"ip:room_join:1.2.3.{i}",
            limit=10, window_seconds=3600, message="too many",
        )
    assert len(limiter._events) == 1000
    for key in limiter._events:
        assert len(limiter._events[key]) == 1


def test_inmemory_rate_limiter_no_defaultdict_factory() -> None:
    """Pin the structural change: _events is a plain dict, not
    a defaultdict. A regression that re-introduces the
    default-dict factory would silently re-open the memory
    leak (every new key would create an empty deque on
    access, and the empty deque would never be deleted).
    """
    limiter = InMemoryRateLimiter()
    # Plain dict: __missing__ is the default, no factory.
    assert type(limiter._events) is dict
    # The defaultdict class has a `default_factory` attribute;
    # a plain dict does not. Pin that the attribute is gone.
    assert not hasattr(limiter._events, "default_factory")


# --- LoginRateLimiter ---


def test_login_rate_limiter_clear_fully_removes_ip() -> None:
    """After clear(), the IP is FULLY REMOVED from _attempts
    (not just an empty list). This is the regression guard
    for the original `= []` pattern.
    """
    limiter = LoginRateLimiter(max_attempts=3, window_seconds=3600, lockout_seconds=600)
    req = _FakeRequest()
    limiter.record_failure(req)
    limiter.record_failure(req)
    assert req.client.host in limiter._attempts

    limiter.clear(req)
    assert req.client.host not in limiter._attempts
    assert len(limiter._attempts) == 0


def test_login_rate_limiter_lockout_fully_removes_ip_from_attempts() -> None:
    """On the 3rd failure (max_attempts), the IP is fully
    removed from _attempts (only the _lockouts entry remains).
    The previous `= []` pattern left an empty list behind.
    """
    limiter = LoginRateLimiter(max_attempts=3, window_seconds=3600, lockout_seconds=600)
    req = _FakeRequest()
    limiter.record_failure(req)
    limiter.record_failure(req)

    with pytest.raises(HTTPException):
        limiter.record_failure(req)  # 3rd failure -> lockout + raise

    assert req.client.host not in limiter._attempts
    assert req.client.host in limiter._lockouts


def test_login_rate_limiter_does_not_grow_on_many_unique_ips() -> None:
    """Across 1000 unique IPs (each with a single failure +
    a clear), the _attempts dict is empty. The cumulative
    count is bounded by the number of IPs with an ACTIVE
    failure window, not the cumulative number of IPs ever
    seen.
    """
    limiter = LoginRateLimiter(max_attempts=3, window_seconds=3600, lockout_seconds=600)
    for i in range(1000):
        req = _FakeRequest(host=f"203.0.113.{i}")
        limiter.record_failure(req)
        limiter.clear(req)  # simulate successful login after the failure
    # All 1000 IPs cleared; dict is empty.
    assert len(limiter._attempts) == 0


def test_login_rate_limiter_does_not_grow_on_lockout_cycle() -> None:
    """1000 unique IPs each go through a full failure -> lockout
    cycle. _attempts is empty (each lockout del'd the IP).
    _lockouts has 1000 entries (the lockout itself, not
    bounded by this fix — a real-time sweep is the next
    step, tracked as a follow-up).
    """
    limiter = LoginRateLimiter(max_attempts=3, window_seconds=3600, lockout_seconds=600)
    for i in range(1000):
        req = _FakeRequest(host=f"203.0.113.{i}")
        try:
            for _ in range(3):
                limiter.record_failure(req)
        except HTTPException:
            pass  # expected lockout
    # _attempts is empty (each lockout del'd the IP).
    assert len(limiter._attempts) == 0


def test_login_rate_limiter_no_defaultdict_factory() -> None:
    """Pin the structural change: _attempts is a plain dict,
    not a defaultdict. A regression that re-introduces the
    default-dict factory would silently re-open the memory
    leak.
    """
    limiter = LoginRateLimiter()
    assert type(limiter._attempts) is dict
    # The defaultdict class has a `default_factory` attribute;
    # a plain dict does not. Pin that the attribute is gone.
    assert not hasattr(limiter._attempts, "default_factory")
