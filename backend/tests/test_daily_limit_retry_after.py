"""Daily-limit 429s must say when they lift.

The sliding-window limiter (rate_limits.py) already pairs its 429 body's
``retry_after`` with an equal ``Retry-After`` header. These tests extend that
same contract to the daily message limits raised by cost_tracker: the raise
carries the next UTC midnight as ``reset_at``, the shared ``rate_limit_429``
builder turns it into a matching header + body pair, and unknown resets stay
honestly absent instead of inventing a number.
"""

from datetime import datetime

import pytest
from fastapi import HTTPException

from arena.core.cost_tracker import (
    RateLimitExceeded,
    TokenBudgetExceeded,
    _next_utc_midnight,
    check_and_increment_user,
)
from arena.core.rate_headers import rate_limit_429


def _fixed_now() -> datetime:
    return datetime(2026, 8, 24, 23, 59, 1)


class TestNextUtcMidnight:
    def test_mid_day_rolls_to_tomorrow(self):
        now = datetime(2026, 8, 24, 15, 30, 45)
        assert _next_utc_midnight(now) == datetime(2026, 8, 25, 0, 0, 0)

    def test_last_second_of_day_is_one_second_away(self):
        now = datetime(2026, 8, 24, 23, 59, 59)
        assert _next_utc_midnight(now) == datetime(2026, 8, 25)

    def test_exactly_midnight_is_next_day(self):
        # At 00:00 the current window just started, so the next lift is
        # tomorrow's midnight — never today's (a zero-second window).
        now = datetime(2026, 8, 24)
        assert _next_utc_midnight(now) == datetime(2026, 8, 25)


class TestRetryAfterSecondsProperty:
    def _exc(self, reset_at):
        return RateLimitExceeded(
            message="limit hit", tier="FREE", used=10, limit=10, reset_at=reset_at
        )

    def test_future_reset_counts_down(self, monkeypatch):
        monkeypatch.setattr(
            "arena.core.cost_tracker.utcnow_naive", lambda: _fixed_now()
        )
        exc = self._exc(datetime(2026, 8, 25).isoformat())
        assert exc.retry_after_seconds == 59

    def test_past_reset_clamps_to_zero(self):
        exc = self._exc(datetime(2020, 1, 1).isoformat())
        assert exc.retry_after_seconds == 0

    def test_missing_reset_is_none(self):
        assert self._exc(None).retry_after_seconds is None

    def test_unparseable_reset_is_none(self):
        assert self._exc("not-a-timestamp").retry_after_seconds is None

    def test_non_string_reset_is_none(self):
        # Defensive handling keeps a malformed exception from turning a
        # usable 429 response into a server error.
        assert self._exc(123).retry_after_seconds is None

    def test_subsecond_future_reset_rounds_up(self, monkeypatch):
        monkeypatch.setattr(
            "arena.core.cost_tracker.utcnow_naive",
            lambda: datetime(2026, 8, 24, 23, 59, 59, 500_000),
        )
        exc = self._exc(datetime(2026, 8, 25).isoformat())
        assert exc.retry_after_seconds == 1

    def test_aware_timestamp_is_normalized(self, monkeypatch):
        # A caller passing tz-aware ISO text still gets naive-UTC math,
        # matching the codebase's canonical datetime form.
        from datetime import timezone

        monkeypatch.setattr(
            "arena.core.cost_tracker.utcnow_naive", lambda: _fixed_now()
        )
        aware = datetime(2026, 8, 25, 0, 0, 1, tzinfo=timezone.utc).isoformat()
        assert self._exc(aware).retry_after_seconds == 60


class TestUserRaiseCarriesResetAt:
    def test_raise_names_next_utc_midnight(self, make_user, monkeypatch):
        from arena.database import SessionLocal
        from arena.db_models import UserTier

        monkeypatch.setattr(
            "arena.core.cost_tracker.utcnow_naive", lambda: _fixed_now()
        )
        user = make_user(tier=UserTier.FREE, prompt_count_today=10)
        db = SessionLocal()
        try:
            with pytest.raises(RateLimitExceeded) as exc_info:
                check_and_increment_user(db, user.id)
        finally:
            db.close()
        assert exc_info.value.reset_at == "2026-08-25T00:00:00"


class TestRateLimit429Builder:
    def test_header_matches_body_seconds(self, monkeypatch):
        monkeypatch.setattr(
            "arena.core.cost_tracker.utcnow_naive", lambda: _fixed_now()
        )
        e = RateLimitExceeded(
            message="daily cap",
            tier="FREE",
            used=10,
            limit=10,
            reset_at=datetime(2026, 8, 25).isoformat(),
        )
        built = rate_limit_429(e)
        assert isinstance(built, HTTPException)
        assert built.status_code == 429
        # The contract: clients reading either channel get the same number.
        assert (
            built.headers["Retry-After"]
            == str(built.detail["retry_after_seconds"])
        )

    def test_body_carries_scope_and_reset(self):
        e = RateLimitExceeded(
            message="daily cap",
            tier="PLUS",
            used=50,
            limit=50,
            scope="tokens",
            reset_at=datetime(2026, 8, 25).isoformat(),
        )
        detail = rate_limit_429(e).detail
        assert detail["scope"] == "tokens"
        assert detail["resets_at"] == "2026-08-25T00:00:00"
        assert detail["prompts_used"] == 50
        assert detail["daily_limit"] == 50

    def test_just_passed_reset_still_sends_positive_header(self):
        # Retry-After must be >= 1 even when the reset instant already
        # slipped by during handling — zero/negative reads as malformed.
        e = RateLimitExceeded(
            message="daily cap",
            tier="FREE",
            used=10,
            limit=10,
            reset_at=datetime(2020, 1, 1).isoformat(),
        )
        built = rate_limit_429(e)
        assert built.detail["retry_after_seconds"] == 1
        assert built.headers["Retry-After"] == "1"

    def test_invalid_reset_omits_reset_metadata(self):
        e = RateLimitExceeded(
            message="daily cap",
            tier="FREE",
            used=10,
            limit=10,
            reset_at="not-a-timestamp",
        )
        built = rate_limit_429(e)
        assert "Retry-After" not in (built.headers or {})
        assert "retry_after_seconds" not in built.detail
        assert "resets_at" not in built.detail

    def test_unknown_reset_omits_both_channels(self):
        # Token budgets carry no reset instant: honesty means no field and
        # no header rather than a fabricated "try tomorrow".
        e = TokenBudgetExceeded(
            message="over budget", tier="FREE", used=100, limit=100
        )
        built = rate_limit_429(e)
        assert "Retry-After" not in (built.headers or {})
        assert "retry_after_seconds" not in built.detail
        assert "resets_at" not in built.detail
