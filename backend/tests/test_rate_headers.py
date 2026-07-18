"""Unit tests for arena.core.rate_headers.rate_limit_headers."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from arena.core.rate_headers import rate_limit_headers
from arena.core.tier_config import TIER_DAILY_LIMITS, TIER_MESSAGE_LIMITS, UserTier


class _FakeQuery:
    def __init__(self, row):
        self._row = row

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._row


def _db_with_user(row):
    db = MagicMock()
    db.query.return_value = _FakeQuery(row)
    return db


@pytest.mark.asyncio
async def test_rate_limit_headers_for_pro_with_usage(monkeypatch):
    monkeypatch.setattr(
        "arena.core.rate_headers.get_today_token_usage",
        lambda db, user_id: 1_500,
    )
    user = SimpleNamespace(id=7, tier=UserTier.PRO, email="pro@test.com")
    db_user = SimpleNamespace(id=7, prompt_count_today=3)
    headers = await rate_limit_headers(
        request=MagicMock(),
        user=user,
        db=_db_with_user(db_user),
    )
    msg_limit = TIER_MESSAGE_LIMITS[UserTier.PRO]
    tok_limit = TIER_DAILY_LIMITS[UserTier.PRO]
    assert headers["X-RateLimit-Limit-Messages"] == str(msg_limit)
    assert headers["X-RateLimit-Remaining-Messages"] == str(msg_limit - 3)
    assert headers["X-RateLimit-Limit-Tokens"] == str(tok_limit)
    assert headers["X-RateLimit-Remaining-Tokens"] == str(tok_limit - 1_500)
    assert headers["X-RateLimit-Tier"] == "PRO"


@pytest.mark.asyncio
async def test_rate_limit_headers_floor_remaining_at_zero(monkeypatch):
    """Over-quota usage must not emit negative remaining counters."""
    monkeypatch.setattr(
        "arena.core.rate_headers.get_today_token_usage",
        lambda db, user_id: 10**12,
    )
    user = SimpleNamespace(id=1, tier=UserTier.FREE, email="free@test.com")
    db_user = SimpleNamespace(id=1, prompt_count_today=10**9)
    headers = await rate_limit_headers(
        request=MagicMock(),
        user=user,
        db=_db_with_user(db_user),
    )
    assert headers["X-RateLimit-Remaining-Messages"] == "0"
    assert headers["X-RateLimit-Remaining-Tokens"] == "0"
    assert headers["X-RateLimit-Tier"] == "FREE"


@pytest.mark.asyncio
async def test_rate_limit_headers_missing_db_row(monkeypatch):
    """Hard-deleted user mid-request still gets coherent zero-usage headers."""
    called = {"tokens": False}

    def _tokens(db, user_id):
        called["tokens"] = True
        return 99

    monkeypatch.setattr("arena.core.rate_headers.get_today_token_usage", _tokens)
    user = SimpleNamespace(id=99, tier=UserTier.PLUS, email="gone@test.com")
    headers = await rate_limit_headers(
        request=MagicMock(),
        user=user,
        db=_db_with_user(None),
    )
    assert called["tokens"] is False
    assert headers["X-RateLimit-Remaining-Messages"] == str(
        TIER_MESSAGE_LIMITS[UserTier.PLUS]
    )
    assert headers["X-RateLimit-Remaining-Tokens"] == str(
        TIER_DAILY_LIMITS[UserTier.PLUS]
    )
