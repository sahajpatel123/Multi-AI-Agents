"""Direct tests for arena.core.datetime_utils.utcnow_naive.

This helper is the consolidated single source of truth for the
'current naive-UTC datetime' computation (replaces 11+ byte-identical
duplicates and 32 inline `datetime.now(timezone.utc).replace(...)` calls
that cycles 20 + 22 folded in). The function is one line but it's
called from 50+ sites, so the contract test pins what every caller
depends on:

  1. Returns a datetime
  2. The returned datetime is naive (tzinfo is None)
  3. The returned value is in UTC (year/month/day match UTC, not local)
  4. The returned value is within 1 second of `datetime.now(timezone.utc)`

The cycle 25 test is the first direct test for this helper; all
prior coverage was transitive via the call sites.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from arena.core.datetime_utils import utcnow_naive


def test_returns_a_datetime():
    result = utcnow_naive()
    assert isinstance(result, datetime)


def test_returns_naive_datetime():
    """The codebase's wire format is naive ISO without tz suffix.
    A tzinfo here would break JSON consumers and inequality checks
    against the DB-stored naive datetimes."""
    result = utcnow_naive()
    assert result.tzinfo is None, (
        f"expected naive datetime, got tzinfo={result.tzinfo!r}"
    )


def test_returns_utc_value():
    """Sanity check: the wall clock matches UTC. We don't make
    timezone-local assumptions on the host (e.g., a CI runner in
    PT shouldn't shift the result)."""
    # Check at the second-precision boundary so the test is stable
    # across ±1s clock skew.
    before = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
    result = utcnow_naive().replace(microsecond=0)
    after = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
    assert before <= result <= after, (
        f"expected utcnow_naive() in [{before!r}, {after!r}], got {result!r}"
    )


def test_result_is_close_to_now():
    """Round-trip property: the function returns 'now' to within
    1 second. Catches a future regression where someone changes
    `datetime.now(timezone.utc)` to e.g. `datetime.now()` (naive
    local time) or `datetime(2020, 1, 1)`."""
    expected = datetime.now(timezone.utc).replace(tzinfo=None)
    result = utcnow_naive()
    assert abs((result - expected).total_seconds()) < 1.0, (
        f"utcnow_naive() drifted > 1s from datetime.now(timezone.utc): "
        f"got {result!r}, expected ~{expected!r}"
    )


def test_returned_value_has_no_microsecond_drift():
    """Stress test for the wall-clock assumption: capture two calls
    100ms apart and verify the diff is positive and < 1 second.

    A regression where the helper returned a cached or fixed value
    (e.g., module-load time) would show diff == 0 here."""
    t1 = utcnow_naive()
    import time

    time.sleep(0.1)
    t2 = utcnow_naive()
    delta = (t2 - t1).total_seconds()
    assert 0.05 < delta < 1.0, (
        f"consecutive utcnow_naive() calls should differ by ~0.1s, got {delta}s"
    )


def test_tzinfo_is_none_even_after_tzaware_input():
    """Forward-compat: if someone wraps utcnow_naive with a tz-aware
    datetime (e.g., for a future API), this guard ensures the
    returned value is still naive. Documented contract: naive only."""
    naive = utcnow_naive()
    # The returned value MUST be naive even when the host clock is
    # in a different timezone (verified by direct comparison to a
    # tz-aware datetime computed from the same source).
    tz_aware = datetime.now(timezone.utc)
    naive_replaced = naive.replace(tzinfo=timezone.utc)
    diff = (tz_aware - naive_replaced).total_seconds()
    assert abs(diff) < 1.0
    assert naive.tzinfo is None