"""Unit tests for arena.core.cost_tracker.

Validates daily counter logic, tier-based message caps, Pro rolling window, and
the usage record accumulator.
"""

from datetime import datetime, timezone, timedelta

import pytest

from arena.core.cost_tracker import (
    RateLimitExceeded,
    RequestCostAccumulator,
    _now_utc,
    _reset_if_new_day,
    check_and_increment_guest,
    check_and_increment_user,
    check_token_budget,
    estimate_cost,
    get_today_token_usage,
    record_usage,
)
from arena.core.rate_limiter_pro import check_pro_window_limit
from arena.core.tier_config import TIER_MESSAGE_LIMITS, UserTier
from arena.db_models import GuestRateLimit, UsageRecord


class TestRequestCostAccumulator:
    def test_default_zeros(self):
        a = RequestCostAccumulator()
        assert a.input_tokens == 0
        assert a.output_tokens == 0
        assert a.estimated_cost_usd >= 0
        assert a.request_id  # auto-generated uuid

    def test_add_accumulates(self):
        a = RequestCostAccumulator()
        a.add(100, 50)
        a.add(200, 100)
        assert a.input_tokens == 300
        assert a.output_tokens == 150

    def test_to_dict_has_required_fields(self):
        a = RequestCostAccumulator()
        d = a.to_dict()
        for k in ("request_id", "input_tokens", "output_tokens", "estimated_cost_usd"):
            assert k in d


class TestResetIfNewDay:
    def test_same_day_is_not_reset(self):
        now = _now_utc()
        assert _reset_if_new_day(now) is False

    def test_yesterday_resets(self):
        yesterday = _now_utc() - timedelta(days=1)
        assert _reset_if_new_day(yesterday) is True


class TestGuestRateLimit:
    def test_first_prompt_allowed(self, db_session):
        check_and_increment_guest(db_session, "1.2.3.4")
        rec = db_session.query(GuestRateLimit).filter_by(ip_address="1.2.3.4").first()
        assert rec.prompt_count_today == 1

    def test_over_limit_raises(self, db_session):
        ip = "5.6.7.8"
        limit = TIER_MESSAGE_LIMITS[UserTier.GUEST]
        for _ in range(limit):
            check_and_increment_guest(db_session, ip)
        with pytest.raises(RateLimitExceeded) as exc:
            check_and_increment_guest(db_session, ip)
        assert exc.value.tier == "GUEST"
        assert exc.value.limit == limit
        assert exc.value.used == limit

    def test_reset_after_new_day(self, db_session):
        ip = "9.9.9.9"
        check_and_increment_guest(db_session, ip)
        # Manually push the reset window into the past
        rec = db_session.query(GuestRateLimit).filter_by(ip_address=ip).first()
        rec.reset_at = _now_utc() - timedelta(days=1)
        db_session.commit()
        # New request should reset the counter
        check_and_increment_guest(db_session, ip)
        rec = db_session.query(GuestRateLimit).filter_by(ip_address=ip).first()
        assert rec.prompt_count_today == 1


class TestUserRateLimit:
    def test_user_at_limit_raises(self, make_user):
        from arena.core.auth import hash_password
        from arena.db_models import User, UserTier
        from arena.database import SessionLocal

        user = make_user(tier=UserTier.FREE, prompt_count_today=10)
        db = SessionLocal()
        try:
            with pytest.raises(RateLimitExceeded):
                check_and_increment_user(db, user.id)
        finally:
            db.close()

    def test_user_under_limit_increments(self, make_user):
        from arena.database import SessionLocal
        from arena.db_models import User, UserTier

        user = make_user(tier=UserTier.FREE, prompt_count_today=0)
        db = SessionLocal()
        try:
            check_and_increment_user(db, user.id)
            db.commit()
            refreshed = db.query(User).filter(User.id == user.id).first()
            assert refreshed.prompt_count_today == 1
        finally:
            db.close()

    def test_missing_user_does_not_raise(self, db_session):
        # Should silently return; never crashes.
        check_and_increment_user(db_session, 99999)


class TestProWindowLimit:
    def test_under_window_is_none(self, make_user):
        from arena.database import SessionLocal
        from arena.db_models import UserTier

        user = make_user(tier=UserTier.PRO)
        db = SessionLocal()
        try:
            assert check_pro_window_limit(db, user.id) is None
        finally:
            db.close()

    def test_over_window_returns_dict(self, make_user):
        from arena.database import SessionLocal
        from arena.db_models import UserTier, UsageRecord

        user = make_user(tier=UserTier.PRO)
        db = SessionLocal()
        try:
            now = _now_utc()
            # Add 50 recent usage records
            for i in range(50):
                db.add(UsageRecord(
                    user_id=user.id,
                    request_id=f"req-{i}",
                    input_tokens=10,
                    output_tokens=10,
                    mode="arena",
                    timestamp=now - timedelta(minutes=i),
                ))
            db.commit()
            result = check_pro_window_limit(db, user.id)
            assert result is not None
            assert result["error"] == "rate_limit_exceeded"
            assert result["limit"] >= 45
            assert result["current_count"] >= 45
            assert "reset_at" in result
        finally:
            db.close()


class TestRecordUsage:
    def test_persists_record(self, make_user, db_session):
        from arena.db_models import UsageRecord

        user = make_user()
        cost = RequestCostAccumulator(input_tokens=100, output_tokens=50)
        record_usage(
            db=db_session,
            cost=cost,
            session_id="sess-1",
            user_id=user.id,
            prompt_category="question",
            winner_agent_id="agent_1",
            mode="arena",
            total_processing_ms=1234,
        )
        rec = db_session.query(UsageRecord).filter_by(user_id=user.id).first()
        assert rec is not None
        assert rec.input_tokens == 100
        assert rec.output_tokens == 50
        assert rec.session_id == "sess-1"
        assert rec.mode == "arena"

    def test_failure_does_not_raise(self, make_user, db_session, monkeypatch):
        # If the DB commit fails, we should swallow and not break the request.
        from sqlalchemy.exc import SQLAlchemyError

        user = make_user()
        cost = RequestCostAccumulator(input_tokens=10, output_tokens=10)

        def _boom(*args, **kwargs):
            raise SQLAlchemyError("simulated")

        monkeypatch.setattr(db_session, "commit", _boom)
        # Should not raise.
        record_usage(db=db_session, cost=cost, user_id=user.id)


class TestEstimateCost:
    def test_zero(self):
        assert estimate_cost(0, 0) == 0.0

    def test_matches_registry(self):
        # 1000 input + 1000 output should equal input_rate + output_rate.
        c = estimate_cost(1000, 1000)
        from arena.core.model_router import MODEL_REGISTRY
        m = MODEL_REGISTRY["claude_sonnet"]
        assert c == pytest.approx(m["cost_per_1k_input"] + m["cost_per_1k_output"])


class TestGetTodayTokenUsage:
    def test_zero_for_fresh_user(self, make_user):
        from arena.database import SessionLocal

        user = make_user()
        db = SessionLocal()
        try:
            assert get_today_token_usage(db, user.id) == 0
        finally:
            db.close()

    def test_sums_today_only(self, make_user):
        from arena.database import SessionLocal
        from arena.db_models import UsageRecord

        user = make_user()
        db = SessionLocal()
        try:
            now = _now_utc()
            # An "earlier today" timestamp that never slips into yesterday when
            # the suite runs in the first hour of a UTC day. Previously this was
            # now - 1h, which fell before UTC midnight for runs between 00:00 and
            # 00:59, excluding the record and making the assertion flaky (~1h/day).
            earlier_today = max(
                now - timedelta(hours=1),
                now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(minutes=1),
            )
            # Today's records
            db.add_all([
                UsageRecord(user_id=user.id, request_id="r1", input_tokens=100, output_tokens=50, mode="arena", timestamp=now),
                UsageRecord(user_id=user.id, request_id="r2", input_tokens=200, output_tokens=100, mode="arena", timestamp=earlier_today),
            ])
            # Yesterday's records — should not count
            db.add(UsageRecord(
                user_id=user.id, request_id="r3", input_tokens=999, output_tokens=999,
                mode="arena", timestamp=now - timedelta(days=2),
            ))
            db.commit()
            assert get_today_token_usage(db, user.id) == 450  # 100+50+200+100
        finally:
            db.close()


class TestTokenBudget:
    """Daily token budget enforcement — separate from message count."""

    def test_under_budget_passes(self, make_user):
        from arena.core.cost_tracker import check_token_budget
        from arena.database import SessionLocal
        from arena.db_models import UserTier

        user = make_user(tier=UserTier.PRO)  # 300k budget
        db = SessionLocal()
        try:
            # Should not raise — 0 tokens used
            check_token_budget(db, user.id)
        finally:
            db.close()

    def test_over_budget_raises(self, make_user):
        from arena.core.cost_tracker import TokenBudgetExceeded, check_token_budget
        from arena.database import SessionLocal
        from arena.db_models import UsageRecord, UserTier

        user = make_user(tier=UserTier.FREE)  # 25k budget
        db = SessionLocal()
        try:
            now = _now_utc()
            # Add a usage record that exhausts the budget
            db.add(UsageRecord(
                user_id=user.id, request_id="big", input_tokens=20000, output_tokens=5000,
                mode="arena", timestamp=now,
            ))
            db.commit()
            with pytest.raises(TokenBudgetExceeded) as exc:
                check_token_budget(db, user.id)
            assert exc.value.scope == "tokens"
            assert exc.value.used == 25000
            assert exc.value.limit == 25000
        finally:
            db.close()

    def test_missing_user_silently_passes(self, db_session):
        from arena.core.cost_tracker import check_token_budget
        # No raise for unknown user.
        check_token_budget(db_session, 99999)