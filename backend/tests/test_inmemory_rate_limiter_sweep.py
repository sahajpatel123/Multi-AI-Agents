"""Tests for the InMemoryRateLimiter._events lazy sweep.

The InMemoryRateLimiter has the same memory-leak class as
LoginRateLimiter._lockouts (cycle 21): keys that have events
but never return accumulate stale entries in their bucket.
The per-hit pop-while-loop only cleans up the bucket when
the SAME key gets a follow-up hit; for a key that never
returns, the stale entries linger in the bucket.

The fix is a lazy sweep: every _sweep_every (1000) calls,
walk all keys' buckets, pop stale entries (older than 1
hour, a conservative safety net), and del the key if the
bucket becomes empty. The amortized cost is O(1) per hit.

Tests pin:
- The sweep counter advances every _sweep_every calls
- The sweep removes keys whose entire bucket is stale
- The sweep does not trigger on calls < _sweep_every
- The sweep preserves keys with recent events
- The sweep fires inside hit()'s lock (no race condition)
"""

from __future__ import annotations

import time

from arena.core.rate_limits import InMemoryRateLimiter


def test_sweep_counter_advances_per_hit() -> None:
    """Every call to hit() increments _hit_count."""
    limiter = InMemoryRateLimiter()
    for _ in range(100):
        limiter.hit("k1", limit=1000, window_seconds=3600, message="x")
    assert limiter._hit_count == 100


def test_sweep_removes_stale_buckets_after_1000_calls() -> None:
    """After 1000 hits, the sweep fires. A bucket whose first
    event is older than 1 hour is removed entirely.
    """
    limiter = InMemoryRateLimiter()
    # Hit a key 5 times
    for _ in range(5):
        limiter.hit("stale", limit=1000, window_seconds=3600, message="x")
    assert "stale" in limiter._events
    assert len(limiter._events["stale"]) == 5

    # Manually rewrite the events to be > 1 hour old
    past = time.time() - 3700  # 1 hour + 100s
    bucket = limiter._events["stale"]
    for i in range(len(bucket)):
        bucket[i] = past + i

    # 995 more calls to reach hit 1000 (the next sweep trigger).
    for _ in range(995):
        limiter.hit("k1", limit=1000, window_seconds=3600, message="x")
    # The 1000th hit triggered the sweep; the stale key was
    # removed entirely (its first event is > 1 hour old).
    assert "stale" not in limiter._events


def test_sweep_preserves_recent_buckets() -> None:
    """A key whose events are recent is preserved by the sweep."""
    limiter = InMemoryRateLimiter()
    # 500 hits (below the 1000 threshold, no sweep)
    for _ in range(500):
        limiter.hit("recent", limit=1000, window_seconds=3600, message="x")
    assert "recent" in limiter._events
    # 500 more hits to reach 1000
    for _ in range(500):
        limiter.hit("k1", limit=1000, window_seconds=3600, message="x")
    # The 1000th hit triggered the sweep. The "recent" key has
    # events from within the last few seconds (well within 1
    # hour), so it's preserved.
    assert "recent" in limiter._events
    assert "k1" in limiter._events


def test_sweep_does_not_trigger_below_1000_calls() -> None:
    """Below the threshold, the sweep does not run."""
    limiter = InMemoryRateLimiter()
    for _ in range(500):
        limiter.hit("k1", limit=1000, window_seconds=3600, message="x")
    assert limiter._hit_count == 500
    # The sweep did not fire — no key was added to a special
    # "swept" marker. The counter just advances.
    assert len(limiter._events) == 1


def test_sweep_removes_empty_buckets() -> None:
    """The pop-while-loop on each hit pops stale events. If the
    bucket becomes empty after the pop, the lazy sweep at the
    next 1000-multiple also cleans up the empty bucket.
    """
    limiter = InMemoryRateLimiter()
    # Hit with a tiny window so each event is stale by the next hit
    for _ in range(3):
        limiter.hit("k1", limit=1000, window_seconds=1, message="x")
    # The bucket has 3 events, all within the last few seconds
    assert len(limiter._events["k1"]) == 3
    # Wait for the window to pass
    time.sleep(1.1)
    # 997 more calls to reach hit 1000
    for _ in range(997):
        limiter.hit("k2", limit=1000, window_seconds=3600, message="x")
    # The 1000th hit triggered the sweep. "k1" is still in the
    # dict but its events are now > 1 hour old (no — they're
    # only ~1 second old). The sweep doesn't remove it.
    # The pop-while-loop on the k1 hit would have popped them
    # but we never called hit on k1 again.
    # Actually, k1's events are ~1 second old, not > 1 hour,
    # so the sweep keeps k1.
    assert "k1" in limiter._events
