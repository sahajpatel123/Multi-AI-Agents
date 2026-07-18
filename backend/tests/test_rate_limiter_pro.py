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


def test_at_limit_without_oldest_row(monkeypatch):
    monkeypatch.setattr(rlp, "get_settings", lambda: _Settings())
    err = rlp.check_pro_window_limit(_db(10, oldest_ts=None), user_id=2)
    assert err is not None
    assert err["error"] == "rate_limit_exceeded"
