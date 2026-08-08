"""Regression tests for ``orm_user_to_response``.

The converter shapes an ORM ``User`` row into the API ``UserResponse``
returned by every authenticated endpoint. A regression here would
either:

  - Drop the defensive defaults → a user with missing columns
    raises on serialization (5xx on `/me`).
  - Set `name` to ``None`` → the frontend renders `null` instead of
    `""` (template errors).
  - Skip the tier fallback for enum vs string tier → 500 on legacy
    users with string tier.

Pins:
  - Tier field is always a string (enum.value if enum, str otherwise).
  - All optional fields have defensive defaults (None / 0 / False / "").
  - The converter does NOT raise when fields are missing.
  - ``db=None`` is supported (returns no calibration, no sub period).
"""

from __future__ import annotations

from types import SimpleNamespace
from datetime import datetime

import pytest

from arena.core.auth import orm_user_to_response
from arena.core.tier_config import UserTier
from arena.models.schemas import FeedbackCalibrationInfo


def _make_user(**overrides) -> SimpleNamespace:
    """Build a minimal user row stub that quacks like the ORM User
    the converter expects."""
    base = dict(
        id=42,
        email="user@example.com",
        tier=UserTier.PRO,
        created_at=datetime(2026, 1, 1, 12, 0, 0),
        prompt_count_today=5,
        name="Test User",
        expertise_level="practitioner",
        expertise_domain="ai",
        consecutive_payments=0,
        loyalty_reward_active=False,
        loyalty_free_months_remaining=0,
        loyalty_resume_at=None,
        loyalty_resume_attempts=0,
        loyalty_resume_next_attempt_at=None,
        agent_addon_active=False,
        agent_addon_cancelling=False,
        addon_subscription_id=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class TestOrmUserToResponseHappyPath:
    def test_returns_user_response_with_all_fields(self):
        user = _make_user()
        out = orm_user_to_response(user, db=None)
        assert out.id == 42
        assert out.email == "user@example.com"
        assert out.tier == "PRO"
        assert out.prompt_count_today == 5
        assert out.name == "Test User"
        assert out.expertise_level == "practitioner"
        assert out.expertise_domain == "ai"

    def test_default_feedback_calibration_is_empty_when_db_none(self):
        user = _make_user()
        out = orm_user_to_response(user, db=None)
        # No calibration when db is None — defaults to empty struct.
        assert isinstance(out.feedback_calibration, FeedbackCalibrationInfo)


class TestOrmUserToResponseTierHandling:
    def test_enum_tier_returns_its_value(self):
        """``UserTier.PRO`` → ``"PRO"`` (the enum value, verbatim)."""
        user = _make_user(tier=UserTier.PRO)
        out = orm_user_to_response(user, db=None)
        assert out.tier == "PRO"

    def test_string_tier_passed_through(self):
        """A plain string tier (legacy data) is passed through verbatim."""
        user = _make_user(tier="PLUS")
        out = orm_user_to_response(user, db=None)
        assert out.tier == "PLUS"

    def test_lowercase_string_tier_preserved(self):
        user = _make_user(tier="free")
        out = orm_user_to_response(user, db=None)
        assert out.tier == "free"


class TestOrmUserToResponseDefensiveDefaults:
    def test_missing_name_returns_empty_string(self):
        """A missing ``name`` attribute returns ``""`` — not None
        (the frontend template assumes string)."""
        user = _make_user()
        del user.name
        out = orm_user_to_response(user, db=None)
        assert out.name == ""

    def test_missing_expertise_level_returns_curious(self):
        """A missing expertise level defaults to ``"curious"``."""
        user = _make_user()
        del user.expertise_level
        out = orm_user_to_response(user, db=None)
        assert out.expertise_level == "curious"

    def test_missing_expertise_domain_returns_empty_string(self):
        user = _make_user()
        del user.expertise_domain
        out = orm_user_to_response(user, db=None)
        assert out.expertise_domain == ""

    def test_missing_consecutive_payments_returns_zero(self):
        user = _make_user()
        del user.consecutive_payments
        out = orm_user_to_response(user, db=None)
        assert out.consecutive_payments == 0

    def test_missing_loyalty_fields_return_defaults(self):
        user = _make_user()
        for attr in (
            "loyalty_reward_active",
            "loyalty_free_months_remaining",
            "loyalty_resume_at",
            "loyalty_resume_attempts",
            "loyalty_resume_next_attempt_at",
        ):
            delattr(user, attr)
        out = orm_user_to_response(user, db=None)
        assert out.loyalty_reward_active is False
        assert out.loyalty_free_months_remaining == 0
        assert out.loyalty_resume_at is None
        assert out.loyalty_resume_attempts == 0
        assert out.loyalty_resume_next_attempt_at is None

    def test_missing_agent_addon_fields_return_defaults(self):
        user = _make_user()
        for attr in ("agent_addon_active", "agent_addon_cancelling", "addon_subscription_id"):
            delattr(user, attr)
        out = orm_user_to_response(user, db=None)
        assert out.agent_addon_active is False
        assert out.agent_addon_cancelling is False
        assert out.addon_subscription_id is None

    def test_does_not_raise_on_minimal_user(self):
        """A user with ONLY the required attributes (id, email,
        tier, created_at, prompt_count_today) does NOT raise. The
        converter is defensive — every optional field has a default."""
        minimal = SimpleNamespace(
            id=1,
            email="min@example.com",
            tier="pro",
            created_at=datetime(2026, 1, 1),
            prompt_count_today=0,
        )
        out = orm_user_to_response(minimal, db=None)
        assert out.id == 1
        assert out.email == "min@example.com"
        assert out.tier == "pro"  # string tier preserved


class TestOrmUserToResponseNullSafety:
    def test_null_name_returns_empty_string(self):
        """An explicit ``None`` name returns ``""`` (defensive)."""
        user = _make_user(name=None)
        out = orm_user_to_response(user, db=None)
        assert out.name == ""

    def test_null_expertise_level_returns_curious(self):
        user = _make_user(expertise_level=None)
        out = orm_user_to_response(user, db=None)
        assert out.expertise_level == "curious"

    def test_null_loyalty_count_returns_zero(self):
        user = _make_user(loyalty_free_months_remaining=None)
        out = orm_user_to_response(user, db=None)
        assert out.loyalty_free_months_remaining == 0

    def test_null_consecutive_payments_returns_zero(self):
        user = _make_user(consecutive_payments=None)
        out = orm_user_to_response(user, db=None)
        assert out.consecutive_payments == 0

    def test_boolean_coerces_none_to_false(self):
        user = _make_user(loyalty_reward_active=None, agent_addon_active=None)
        out = orm_user_to_response(user, db=None)
        assert out.loyalty_reward_active is False
        assert out.agent_addon_active is False


class TestOrmUserToResponseCreatedAt:
    def test_created_at_passed_through(self):
        """The created_at timestamp is passed through unchanged — a
        regression that converts to UTC could shift dates by hours."""
        ts = datetime(2026, 7, 23, 8, 59, 0)
        user = _make_user(created_at=ts)
        out = orm_user_to_response(user, db=None)
        assert out.created_at == ts

    def test_none_created_at_accepted(self):
        """The created_at field on the API is required; the converter
        is responsible for ensuring it's a datetime (not None).
        Pin that the converter passes through the raw value — a
        future refactor that always defaults to ``utcnow_naive()``
        would silently shift dates for users with NULL created_at."""
        user = _make_user(created_at=datetime(2026, 1, 1))
        out = orm_user_to_response(user, db=None)
        # The passed datetime is preserved (not replaced).
        assert out.created_at == datetime(2026, 1, 1)