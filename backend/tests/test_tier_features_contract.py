"""Regression tests for the ``TIER_FEATURES`` access matrix.

The matrix is the per-tier per-feature access control. A regression
that flips a single feature (e.g. `agent_mode` for FREE → True) would
silently grant tier-bypass to every free user.

Pins:
  - GUEST has NO features enabled.
  - FREE has NO features enabled.
  - PLUS has core features (debate, discuss, memory, etc.) but
    NOT agent_mode / agent_orchestrate / scoring_audit / unlimited_debates.
  - PRO has ALL features enabled.
  - Every tier has the SAME set of feature keys (catches the
    "missing feature key" regression).
  - Feature values are strict bools.
  - PRO is a strict superset of PLUS (every PLUS-True is PRO-True).
"""

from __future__ import annotations

import pytest

from arena.core.tier_config import TIER_FEATURES, UserTier


class TestTierFeaturesHappyPath:
    def test_guest_has_no_features(self):
        for feature, value in TIER_FEATURES[UserTier.GUEST].items():
            assert value is False, (
                f"GUEST has {feature}={value}; expected False"
            )

    def test_free_has_no_features(self):
        for feature, value in TIER_FEATURES[UserTier.FREE].items():
            assert value is False, (
                f"FREE has {feature}={value}; expected False"
            )

    def test_pro_has_all_features(self):
        for feature, value in TIER_FEATURES[UserTier.PRO].items():
            assert value is True, (
                f"PRO has {feature}={value}; expected True"
            )

    def test_plus_has_core_features(self):
        """Plus has the core features but NOT agent_mode / scoring."""
        for feature in ("debate", "discuss", "memory", "saved_responses",
                        "full_history", "agent_watchlist"):
            assert TIER_FEATURES[UserTier.PLUS][feature] is True, (
                f"PLUS.{feature} should be True"
            )

    def test_plus_does_not_have_agent_features(self):
        """Plus does NOT have agent_mode / agent_orchestrate /
        scoring_audit / unlimited_debates — these are Pro-only."""
        for feature in ("agent_mode", "agent_orchestrate", "scoring_audit",
                        "unlimited_debates"):
            assert TIER_FEATURES[UserTier.PLUS][feature] is False, (
                f"PLUS.{feature} should be False (Pro-only)"
            )


class TestTierFeaturesShape:
    """The matrix must have the same set of feature keys per tier
    — a regression that adds a feature to one tier without updating
    the others would crash the `has_feature` lookup with KeyError."""

    def test_all_tiers_have_same_keys(self):
        reference_keys = set(TIER_FEATURES[UserTier.FREE].keys())
        for tier in (UserTier.GUEST, UserTier.PLUS, UserTier.PRO):
            tier_keys = set(TIER_FEATURES[tier].keys())
            assert tier_keys == reference_keys, (
                f"{tier.name} has different keys: missing "
                f"{reference_keys - tier_keys}, extra {tier_keys - reference_keys}"
            )

    def test_every_tier_has_a_feature_set(self):
        for tier in UserTier:
            assert tier in TIER_FEATURES, (
                f"UserTier.{tier.name} missing from TIER_FEATURES"
            )

    def test_feature_count_is_consistent(self):
        """Pin the exact number of features — operators watch this
        on dashboards. A regression that drops a feature
        (e.g. removes "unlimited_debates") would silently disable
        the Pro upgrade CTA."""
        reference_count = len(TIER_FEATURES[UserTier.FREE])
        for tier in UserTier:
            assert len(TIER_FEATURES[tier]) == reference_count


class TestTierFeaturesStrictBool:
    """The values are strict booleans (not int 0/1, not None,
    not str). A regression that stored a non-bool would break
    the `if TIER_FEATURES[tier][feature]:` check (truthy on
    non-zero ints, falsy on None → silent escalation)."""

    def test_all_values_are_strict_bools(self):
        for tier in UserTier:
            for feature, value in TIER_FEATURES[tier].items():
                assert isinstance(value, bool)
                # And NOT a regular int (bool IS a subclass of int).
                assert type(value) is bool


class TestTierFeaturesOrdering:
    """Pin the order: PRO is a strict superset of PLUS; PLUS is
    a strict superset of FREE. A regression that demotes a
    PLUS-True to PLUS-False would break the upgrade funnel."""

    def test_pro_is_superset_of_plus(self):
        for feature in TIER_FEATURES[UserTier.PLUS]:
            if TIER_FEATURES[UserTier.PLUS][feature] is True:
                assert TIER_FEATURES[UserTier.PRO][feature] is True, (
                    f"PRO.{feature} should be True (PLUS-True is a subset of PRO)"
                )

    def test_plus_is_superset_of_free(self):
        for feature in TIER_FEATURES[UserTier.FREE]:
            if TIER_FEATURES[UserTier.FREE][feature] is True:
                assert TIER_FEATURES[UserTier.PLUS][feature] is True, (
                    f"PLUS.{feature} should be True (FREE-True is a subset of PLUS)"
                )

    def test_free_and_guest_have_same_features(self):
        """FREE and GUEST have the same feature set (both have
        NO features enabled)."""
        for feature in TIER_FEATURES[UserTier.FREE]:
            assert TIER_FEATURES[UserTier.GUEST][feature] == TIER_FEATURES[UserTier.FREE][feature]


class TestTierFeaturesAgentFamily:
    """The "agent" features are the highest-stakes — a regression
    that grants agent_mode to FREE users would let them use
    Pro-tier features without paying. Pin each agent feature
    explicitly."""

    def test_agent_mode_is_pro_only(self):
        assert TIER_FEATURES[UserTier.GUEST]["agent_mode"] is False
        assert TIER_FEATURES[UserTier.FREE]["agent_mode"] is False
        assert TIER_FEATURES[UserTier.PLUS]["agent_mode"] is False
        assert TIER_FEATURES[UserTier.PRO]["agent_mode"] is True

    def test_agent_orchestrate_is_pro_only(self):
        assert TIER_FEATURES[UserTier.GUEST]["agent_orchestrate"] is False
        assert TIER_FEATURES[UserTier.FREE]["agent_orchestrate"] is False
        assert TIER_FEATURES[UserTier.PLUS]["agent_orchestrate"] is False
        assert TIER_FEATURES[UserTier.PRO]["agent_orchestrate"] is True

    def test_agent_watchlist_is_plus_and_up(self):
        """Watchlist is Plus+ (not Pro-only) — pin the boundary."""
        assert TIER_FEATURES[UserTier.GUEST]["agent_watchlist"] is False
        assert TIER_FEATURES[UserTier.FREE]["agent_watchlist"] is False
        assert TIER_FEATURES[UserTier.PLUS]["agent_watchlist"] is True
        assert TIER_FEATURES[UserTier.PRO]["agent_watchlist"] is True

    def test_scoring_audit_is_pro_only(self):
        assert TIER_FEATURES[UserTier.GUEST]["scoring_audit"] is False
        assert TIER_FEATURES[UserTier.FREE]["scoring_audit"] is False
        assert TIER_FEATURES[UserTier.PLUS]["scoring_audit"] is False
        assert TIER_FEATURES[UserTier.PRO]["scoring_audit"] is True

    def test_unlimited_debates_is_pro_only(self):
        assert TIER_FEATURES[UserTier.GUEST]["unlimited_debates"] is False
        assert TIER_FEATURES[UserTier.FREE]["unlimited_debates"] is False
        assert TIER_FEATURES[UserTier.PLUS]["unlimited_debates"] is False
        assert TIER_FEATURES[UserTier.PRO]["unlimited_debates"] is True

    def test_saved_responses_is_plus_and_up(self):
        """Saved responses is Plus+."""
        for tier in (UserTier.GUEST, UserTier.FREE):
            assert TIER_FEATURES[tier]["saved_responses"] is False
        for tier in (UserTier.PLUS, UserTier.PRO):
            assert TIER_FEATURES[tier]["saved_responses"] is True

    def test_full_history_is_plus_and_up(self):
        for tier in (UserTier.GUEST, UserTier.FREE):
            assert TIER_FEATURES[tier]["full_history"] is False
        for tier in (UserTier.PLUS, UserTier.PRO):
            assert TIER_FEATURES[tier]["full_history"] is True


class TestTierFeaturesDefensive:
    def test_lookup_does_not_raise(self):
        """A lookup for any (tier, feature) key MUST NOT raise."""
        for tier in UserTier:
            for feature in TIER_FEATURES[tier]:
                # Should NOT raise.
                _ = TIER_FEATURES[tier][feature]

    def test_lookup_unknown_feature_raises_keyerror(self):
        """A lookup for an unknown feature raises KeyError (the
        caller is expected to check `feature in TIER_FEATURES[tier]`
        first)."""
        with pytest.raises(KeyError):
            _ = TIER_FEATURES[UserTier.PRO]["unknown_feature_xyz"]

    def test_lookup_unknown_tier_raises_keyerror(self):
        """A lookup for an unknown tier raises KeyError."""
        with pytest.raises(KeyError):
            _ = TIER_FEATURES["platinum"]  # type: ignore[arg-type]


class TestTierFeaturesIdempotence:
    def test_repeated_lookup_is_deterministic(self):
        for _ in range(3):
            assert TIER_FEATURES[UserTier.PRO]["agent_mode"] is True
            assert TIER_FEATURES[UserTier.FREE]["agent_mode"] is False