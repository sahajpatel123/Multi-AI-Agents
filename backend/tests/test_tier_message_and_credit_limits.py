"""Regression tests for ``get_daily_limit`` + ``get_credit_budget``.

These helpers sit in front of every prompt + token-budget check. A
regression here would either let free-tier users send Pro-level
messages (cost overrun) or accidentally lock Pro users out
(revenue loss).

Pins:
  - Each tier returns its specific message count.
  - Each tier returns its specific token credit budget.
  - Default fallback for unknown tier is the FREE tier values.
  - String tier input normalizes via ``normalize_tier`` (case-folded,
    whitespace-stripped).
  - The default-deny for unknown tier ensures no escalation.
  - The constants are in the right order: GUEST ≤ FREE < PLUS < PRO.
"""

from __future__ import annotations

import pytest

from arena.core.tier_config import (
    TIER_DAILY_LIMITS,
    TIER_MESSAGE_LIMITS,
    UserTier,
    get_credit_budget,
    get_daily_limit,
)


class TestGetDailyLimitByTier:
    def test_guest_tier(self):
        assert get_daily_limit(UserTier.GUEST) == 3

    def test_free_tier(self):
        assert get_daily_limit(UserTier.FREE) == 5

    def test_plus_tier(self):
        assert get_daily_limit(UserTier.PLUS) == 15

    def test_pro_tier(self):
        assert get_daily_limit(UserTier.PRO) == 35

    @pytest.mark.parametrize("tier,expected", [
        ("free", 5),
        ("plus", 15),
        ("pro", 35),
        ("guest", 3),
    ])
    def test_string_tier_normalized(self, tier: str, expected: int):
        """String tier (from JWT/cookie/profile routes) is normalized
        via ``normalize_tier`` (case-folded, whitespace-stripped)."""
        assert get_daily_limit(tier) == expected

    def test_uppercase_string_tier(self):
        assert get_daily_limit("PRO") == 35

    def test_whitespace_padded_string_tier(self):
        assert get_daily_limit("  free  ") == 5

    def test_unknown_tier_defaults_to_free(self):
        """An unknown tier string falls back to the FREE tier
        (default-deny: never escalate silently)."""
        assert get_daily_limit("platinum") == TIER_MESSAGE_LIMITS[UserTier.FREE]

    def test_none_defaults_to_free(self):
        assert get_daily_limit(None) == TIER_MESSAGE_LIMITS[UserTier.FREE]

    def test_empty_string_defaults_to_free(self):
        assert get_daily_limit("") == TIER_MESSAGE_LIMITS[UserTier.FREE]


class TestGetCreditBudgetByTier:
    def test_guest_tier(self):
        assert get_credit_budget(UserTier.GUEST) == 25_000

    def test_free_tier(self):
        assert get_credit_budget(UserTier.FREE) == 25_000

    def test_plus_tier(self):
        assert get_credit_budget(UserTier.PLUS) == 100_000

    def test_pro_tier(self):
        assert get_credit_budget(UserTier.PRO) == 300_000

    @pytest.mark.parametrize("tier,expected", [
        ("free", 25_000),
        ("plus", 100_000),
        ("pro", 300_000),
    ])
    def test_string_tier_normalized(self, tier: str, expected: int):
        assert get_credit_budget(tier) == expected

    def test_unknown_tier_defaults_to_free(self):
        assert get_credit_budget("platinum") == TIER_DAILY_LIMITS[UserTier.FREE]

    def test_none_defaults_to_free(self):
        assert get_credit_budget(None) == TIER_DAILY_LIMITS[UserTier.FREE]

    def test_empty_string_defaults_to_free(self):
        assert get_credit_budget("") == TIER_DAILY_LIMITS[UserTier.FREE]


class TestTierLimitOrdering:
    """Pin the ordering — a regression that swaps the values would
    cause free-tier users to get Pro-level access or vice versa."""

    def test_pro_has_higher_message_limit_than_plus(self):
        assert TIER_MESSAGE_LIMITS[UserTier.PRO] > TIER_MESSAGE_LIMITS[UserTier.PLUS]

    def test_plus_has_higher_message_limit_than_free(self):
        assert TIER_MESSAGE_LIMITS[UserTier.PLUS] > TIER_MESSAGE_LIMITS[UserTier.FREE]

    def test_free_has_higher_message_limit_than_guest(self):
        assert TIER_MESSAGE_LIMITS[UserTier.FREE] > TIER_MESSAGE_LIMITS[UserTier.GUEST]

    def test_pro_has_higher_credit_budget_than_plus(self):
        assert TIER_DAILY_LIMITS[UserTier.PRO] > TIER_DAILY_LIMITS[UserTier.PLUS]

    def test_plus_has_higher_credit_budget_than_free(self):
        assert TIER_DAILY_LIMITS[UserTier.PLUS] > TIER_DAILY_LIMITS[UserTier.FREE]

    def test_guest_and_free_have_same_credit_budget(self):
        """Guest and Free share a credit budget — the only
        difference is message count, not token budget."""
        assert TIER_DAILY_LIMITS[UserTier.GUEST] == TIER_DAILY_LIMITS[UserTier.FREE]


class TestTierLimitExactConstants:
    """Pin the exact values — operators watch these on dashboards
    and the on-call escalates when they change."""

    def test_message_limit_constants(self):
        assert TIER_MESSAGE_LIMITS[UserTier.GUEST] == 3
        assert TIER_MESSAGE_LIMITS[UserTier.FREE] == 5
        assert TIER_MESSAGE_LIMITS[UserTier.PLUS] == 15
        assert TIER_MESSAGE_LIMITS[UserTier.PRO] == 35

    def test_credit_budget_constants(self):
        assert TIER_DAILY_LIMITS[UserTier.GUEST] == 25_000
        assert TIER_DAILY_LIMITS[UserTier.FREE] == 25_000
        assert TIER_DAILY_LIMITS[UserTier.PLUS] == 100_000
        assert TIER_DAILY_LIMITS[UserTier.PRO] == 300_000

    def test_every_tier_has_a_message_limit(self):
        """Sanity: every UserTier enum value has a mapping. A new
        tier added to the enum without a corresponding entry would
        silently use the FREE default."""
        for tier in UserTier:
            assert tier in TIER_MESSAGE_LIMITS, (
                f"UserTier.{tier.name} missing from TIER_MESSAGE_LIMITS — "
                "would default to FREE silently"
            )

    def test_every_tier_has_a_credit_budget(self):
        for tier in UserTier:
            assert tier in TIER_DAILY_LIMITS, (
                f"UserTier.{tier.name} missing from TIER_DAILY_LIMITS"
            )


class TestTierLimitDefensive:
    def test_returns_int_type(self):
        """The return type is always int — a regression that
        returned a float (1e3) would silently work in Python but
        break strict-typed callers."""
        result = get_daily_limit(UserTier.PRO)
        assert isinstance(result, int)
        assert not isinstance(result, bool)  # bool is a subclass of int

    def test_credit_budget_returns_int_type(self):
        result = get_credit_budget(UserTier.PRO)
        assert isinstance(result, int)
        assert not isinstance(result, bool)

    def test_message_limit_is_positive(self):
        """All message limits must be ≥ 1 — a regression to 0 would
        lock every user out."""
        for tier in UserTier:
            assert TIER_MESSAGE_LIMITS[tier] >= 1, f"{tier.name} limit is < 1"

    def test_credit_budget_is_positive(self):
        for tier in UserTier:
            assert TIER_DAILY_LIMITS[tier] >= 1, f"{tier.name} budget is < 1"