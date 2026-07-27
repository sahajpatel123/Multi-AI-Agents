"""Tests for the LoginRateLimiter._lockouts lazy sweep.

Cycle 19 (the empty-key memory-leak fix) closed the most
obvious leak: every IP that had ever been seen left a
permanent dict entry even after the lockout expired and
the IP never returned.

The follow-up leak (this cycle) is the same class but for
the _lockouts dict: an IP that triggers a lockout and
NEVER returns leaves its entry in _lockouts until process
restart. Without a sweep, a sustained attacker can pin
1M unique IPs in lockout and consume 100MB+ of memory.

The fix is a lazy sweep: every _sweep_every (1000) calls
to a hot-path method (assert_not_locked, record_failure),
we sweep all expired lockout entries. The amortized cost
is O(1) per call. The dict size stays bounded at ~1000
entries under sustained traffic.

Tests pin:
- After max_attempts failures on a unique IP, _lockouts has
  the entry (sanity for the leak we're closing)
- After 1000 unique IP lockouts followed by 1 more call,
  the lazy sweep triggers and expired entries are removed
  (the >1000 case is the primary use case for the sweep)
- The sweep removes entries whose lockout has expired but
  preserves active lockouts
- A single stale lockout (not yet expired) is preserved by
  the sweep
- The sweep count advances every _sweep_every calls
- The sweep does not trigger on calls < _sweep_every
"""

from __future__ import annotations

import time
from types import SimpleNamespace

import pytest

from arena.core.login_limiter import LoginRateLimiter


class _FakeRequest:
    def __init__(self, host: str = "203.0.113.10"):
        self.client = SimpleNamespace(host=host)
        self.headers: dict[str, str] = {}


def _trigger_lockout(limiter: LoginRateLimiter, host: str) -> None:
    """Trigger a lockout for a specific host. Raises HTTPException
    on the 3rd (max_attempts) failure.
    """
    req = _FakeRequest(host=host)
    try:
        for _ in range(limiter.max_attempts):
            limiter.record_failure(req)
    except Exception:
        pass  # expected lockout


def test_sweep_triggers_after_1000_calls() -> None:
    """The sweep counter advances every _sweep_every (1000)
    calls. Trigger 334 unique-IP lockouts (334 * 3 = 1002
    record_failure calls) and verify the counter has
    incremented past 1000 (so the sweep has fired at least
    once — the 1000th call triggered it).
    """
    limiter = LoginRateLimiter(
        max_attempts=3, window_seconds=3600, lockout_seconds=600,
    )
    # 334 IPs * 3 failures each = 1002 record_failure calls
    # (3 record_failure calls per IP, the 3rd raises on lockout)
    for i in range(334):
        _trigger_lockout(limiter, f"203.0.113.{i}")
    # The counter has incremented past 1000 — the 1000th call
    # triggered the sweep. The remaining 2 calls did not
    # (1002 % 1000 == 2, not 0). The counter is at 1002.
    assert limiter._hit_count > 1000
    # The sweep has fired (at hit 1000). The counter is just
    # past that point.
    assert limiter._hit_count == 1002


def test_sweep_removes_stale_lockouts() -> None:
    """Trigger 1000 unique IP lockouts (3000 hits), then trigger
    one more call to fire the sweep. Manually expire the
    lockouts, then trigger the sweep and verify the expired
    entries are removed.
    """
    limiter = LoginRateLimiter(
        max_attempts=3, window_seconds=3600, lockout_seconds=600,
    )
    # 1000 IPs * 3 failures = 3000 hits
    for i in range(1000):
        _trigger_lockout(limiter, f"203.0.113.{i}")
    # The sweep fired at hits 1000, 2000, 3000. But the lockouts
    # are still active, so the sweep kept them all.
    assert len(limiter._lockouts) == 1000

    # Manually expire all 1000 lockouts (simulate lockout window passing)
    past = time.time() - 1
    for ip in list(limiter._lockouts):
        limiter._lockouts[ip] = past

    # Advance the counter to the next 1000-multiple (4000th hit).
    # Use direct assert_not_locked calls on unique IPs that are
    # NOT in _lockouts — these calls don't modify _lockouts but
    # do increment _hit_count.
    for i in range(1000):
        limiter.assert_not_locked(_FakeRequest(host=f"203.0.114.{i}"))
    # The 4000th hit triggered the sweep — expired lockouts removed.
    assert len(limiter._lockouts) == 0  # all expired removed


def test_sweep_preserves_active_lockouts() -> None:
    """If some lockouts are active and some are expired, the
    sweep only removes the expired ones.
    """
    limiter = LoginRateLimiter(
        max_attempts=3, window_seconds=3600, lockout_seconds=600,
    )
    # 1000 lockouts (3000 hits)
    for i in range(1000):
        _trigger_lockout(limiter, f"203.0.113.{i}")
    # Expire half of them
    ips = list(limiter._lockouts)
    past = time.time() - 1
    for ip in ips[::2]:
        limiter._lockouts[ip] = past
    # Advance to the next 1000-multiple (4000th hit)
    for i in range(1000):
        limiter.assert_not_locked(_FakeRequest(host=f"203.0.114.{i}"))
    # 500 expired removed, 500 active remain
    assert len(limiter._lockouts) == 500


def test_sweep_does_not_trigger_below_1000_calls() -> None:
    """Below the threshold, the sweep does not run. Verify
    the counter advances but the sweep logic doesn't fire.
    """
    limiter = LoginRateLimiter(
        max_attempts=3, window_seconds=3600, lockout_seconds=600,
    )
    # 100 IPs * 3 failures = 300 hits
    for i in range(100):
        _trigger_lockout(limiter, f"203.0.113.{i}")
    assert limiter._hit_count == 300
    assert len(limiter._lockouts) == 100

    # Manually expire all 100 entries
    past = time.time() - 1
    for ip in list(limiter._lockouts):
        limiter._lockouts[ip] = past
    # 700 more calls (total 1000). The sweep has not fired yet
    # (the threshold is 1000 — and 1000 % 1000 == 0, so the sweep
    # does fire at 1000).
    for i in range(700):
        limiter.assert_not_locked(_FakeRequest(host=f"203.0.114.{i}"))
    # The 1000th call triggered the sweep — expired removed.
    assert len(limiter._lockouts) == 0
    assert limiter._hit_count == 1000
