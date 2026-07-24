"""Unit tests for arena.core.rate_limiter_pro.check_pro_window_limit."""

from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

from arena.core.datetime_utils import utcnow_naive
from arena.core import rate_limiter_pro as rlp


class _Settings:
    pro_window_hours = 24
    pro_window_messages = 5


def _db(count: int, oldest_ts=None):
    db = MagicMock()

    class _Q:
        def __init__(self):
            self._mode = "count"

        def filter(self, *a, **k):
            return self

        def order_by(self, *a, **k):
            self._mode = "oldest"
            return self

        def with_for_update(self, *a, **k):
            # Cycle 160 fix: SELECT … FOR UPDATE on the User row to
            # serialize concurrent check-then-insert races. The mock
            # chain is unchanged — the lock is a no-op for the count
            # assertions, which is exactly what we want for these tests.
            return self

        def count(self):
            return count

        def first(self):
            if oldest_ts is None:
                return None
            return SimpleNamespace(timestamp=oldest_ts)

    db.query.return_value = _Q()
    return db


def test_under_limit_returns_none(monkeypatch):
    monkeypatch.setattr(rlp, "get_settings", lambda: _Settings())
    assert rlp.check_pro_window_limit(_db(4), user_id=1) is None


def test_at_limit_returns_structured_error(monkeypatch):
    monkeypatch.setattr(rlp, "get_settings", lambda: _Settings())
    oldest = utcnow_naive() - timedelta(hours=1)
    err = rlp.check_pro_window_limit(_db(5, oldest_ts=oldest), user_id=9)
    assert err is not None
    assert err["error"] == "rate_limit_exceeded"
    assert err["limit"] == 5
    assert err["window_hours"] == 24
    assert err["current_count"] == 5
    assert "reset_at" in err
    assert "24 hours" in err["message"]


def test_reset_at_is_iso8601_utc_string(monkeypatch):
    """The frontend formats ``reset_at`` via ``new Date(...)`` — a malformed
    timestamp would silently render as 'Invalid Date' in the Pro upgrade
    tooltip. The contract: ``reset_at`` is an ISO-8601 string, parseable by
    ``datetime.fromisoformat`` (with or without the trailing ``Z``)."""
    from datetime import datetime as _dt
    monkeypatch.setattr(rlp, "get_settings", lambda: _Settings())
    oldest = utcnow_naive() - timedelta(hours=1)
    err = rlp.check_pro_window_limit(_db(5, oldest_ts=oldest), user_id=9)
    assert err is not None
    # The value is a string (not a datetime object — JSON-encoders crash otherwise).
    assert isinstance(err["reset_at"], str)
    # And it parses. ``datetime.fromisoformat`` handles the ``+00:00`` form;
    # the trailing ``Z`` is the form browsers emit natively.
    raw = err["reset_at"]
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    parsed = _dt.fromisoformat(raw)
    assert parsed is not None
    # And the parsed time equals oldest+window_hours — the contract is the
    # moment the oldest record ages out, not "now+window".
    expected = oldest + timedelta(hours=24)
    # Allow ±1 second for time spent in the test itself.
    assert abs((parsed.replace(tzinfo=None) - expected).total_seconds()) < 2


def test_at_limit_without_oldest_row(monkeypatch):
    monkeypatch.setattr(rlp, "get_settings", lambda: _Settings())
    err = rlp.check_pro_window_limit(_db(10, oldest_ts=None), user_id=2)
    assert err is not None
    assert err["error"] == "rate_limit_exceeded"


def test_acquires_user_row_lock_before_count(monkeypatch):
    """Regression: `check_pro_window_limit` MUST acquire a SELECT … FOR
    UPDATE lock on the User row before reading the recent-count.

    Background (HOT-PATH-ANALYSIS, HIGH): the prior implementation
    read `UsageRecord` count without any lock. N concurrent requests
    for the same user could each see under-limit, each insert their
    own UsageRecord, and the window would be silently exceeded. The
    fix is a row-level lock on the User so the check-then-insert
    window is serialized per-user.

    This test pins the contract by checking that the first
    `db.query(...)` chain (the User lock) calls `.with_for_update()`
    before any chain calls `.count()` (the UsageRecord read). A
    future refactor that drops the lock — and re-opens the race —
    fails here.
    """
    monkeypatch.setattr(rlp, "get_settings", lambda: _Settings())

    # Track each query chain as its own object so we can verify
    # `.with_for_update()` was called on the chain that locks the
    # User row, not on the chain that reads UsageRecord count.
    chains: list[dict] = []

    class _TrackingQ:
        def __init__(self):
            self.calls: list[str] = []

        def filter(self, *a, **k):
            self.calls.append("filter")
            return self

        def with_for_update(self, *a, **k):
            self.calls.append("with_for_update")
            return self

        def order_by(self, *a, **k):
            self.calls.append("order_by")
            return self

        def count(self):
            self.calls.append("count")
            return 4  # under limit

        def first(self):
            self.calls.append("first")
            return None

    db = MagicMock()

    def _new_chain(*args, **kwargs):
        chain = _TrackingQ()
        chains.append(chain)
        return chain

    db.query.side_effect = _new_chain

    # Under-limit path — the function reads count and returns None,
    # never entering the `if recent_count >= window_limit` branch.
    assert rlp.check_pro_window_limit(db, user_id=42) is None

    # Pin the ordering: at least one chain called with_for_update()
    # BEFORE any chain called count(). The User-lock chain is the
    # only chain that should hold the lock; the UsageRecord count
    # chain must not.
    lock_chains = [c for c in chains if "with_for_update" in c.calls]
    count_chains = [c for c in chains if "count" in c.calls]

    assert len(lock_chains) == 1, (
        f"expected exactly one User-lock chain (.with_for_update()), "
        f"got {len(lock_chains)}; full chains: {[c.calls for c in chains]}"
    )
    assert "with_for_update" in lock_chains[0].calls
    assert "count" not in lock_chains[0].calls, (
        "the User-lock chain must not also call count() — those are "
        "different query targets; the count() belongs to the UsageRecord chain"
    )
    assert len(count_chains) >= 1, (
        f"expected at least one UsageRecord count chain, got 0; "
        f"full chains: {[c.calls for c in chains]}"
    )
