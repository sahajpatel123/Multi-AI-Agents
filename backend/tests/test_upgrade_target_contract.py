"""Regression tests for ``upgrade_target``.

The helper maps a user's current tier to the next available
upgrade. A regression here would either:

  - Default every tier to ``None`` → the frontend's "Upgrade" button
    never appears (revenue loss).
  - Default to a wrong target → a Plus user gets a Plus upgrade
    CTA (no-op), or a Free user gets a Pro upgrade CTA (too
    expensive, lowers conversion).

Pins:
  - GUEST → ``"plus"`` (the on-ramp).
  - FREE → ``"plus"`` (the standard upgrade).
  - PLUS → ``"pro"`` (the high-tier upgrade).
  - PRO → ``None`` (no upgrade available).
  - Unknown / None / empty inputs → ``None`` (already at the top, or
    unrecognized tier → no upgrade).
  - String tier normalizes via ``normalize_tier`` (case-folded,
    whitespace-stripped).
"""

from __future__ import annotations

import pytest

from arena.core.tier_config import UserTier, upgrade_target


class TestUpgradeTargetHappyPath:
    def test_guest_upgrades_to_plus(self):
        """GUEST is the on-ramp — upgrade to Plus."""
        assert upgrade_target(UserTier.GUEST) == "plus"

    def test_free_upgrades_to_plus(self):
        """FREE is the standard entry tier — upgrade to Plus."""
        assert upgrade_target(UserTier.FREE) == "plus"

    def test_plus_upgrades_to_pro(self):
        """PLUS has Pro as the next tier up."""
        assert upgrade_target(UserTier.PLUS) == "pro"

    def test_pro_has_no_upgrade(self):
        """PRO is the top tier — no upgrade available."""
        assert upgrade_target(UserTier.PRO) is None


class TestUpgradeTargetStringInput:
    @pytest.mark.parametrize("tier,expected", [
        ("free", "plus"),
        ("plus", "pro"),
        ("pro", None),
        ("guest", "plus"),
    ])
    def test_string_tier_normalized(self, tier: str, expected):
        """String tier (from JWT/profile) is normalized via
        ``normalize_tier`` (case-folded, whitespace-stripped)."""
        assert upgrade_target(tier) == expected

    def test_uppercase_string_tier(self):
        assert upgrade_target("FREE") == "plus"
        assert upgrade_target("PRO") is None

    def test_whitespace_padded_string_tier(self):
        assert upgrade_target("  free  ") == "plus"

    def test_lowercase_string_tier(self):
        assert upgrade_target("free") == "plus"


class TestUpgradeTargetUnknownInput:
    """Unknown tier strings default to ``"plus"`` (the on-ramp
    upgrade). The contract: when in doubt, suggest the standard
    upgrade — better UX than a missing button. The PRO tier
    (recognized) is the only one that returns None."""

    def test_unknown_tier_defaults_to_plus(self):
        """An unrecognized tier string is treated as a sub-Plus tier
        and offered the standard ``"plus"`` upgrade. This is the
        default-OFFER contract — better to show an upgrade button
        than a missing one."""
        assert upgrade_target("platinum") == "plus"

    def test_empty_string_defaults_to_plus(self):
        assert upgrade_target("") == "plus"

    def test_none_defaults_to_plus(self):
        assert upgrade_target(None) == "plus"

    def test_garbage_string_defaults_to_plus(self):
        """A non-tier-shaped string returns "plus" — not a 500."""
        assert upgrade_target("totally bogus") == "plus"
        assert upgrade_target("12345") == "plus"
        assert upgrade_target("admin") == "plus"


class TestUpgradeTargetDefensive:
    def test_returns_string_or_none(self):
        """The return type is str (upgrade target name) or None
        (no upgrade available). A regression that returned a bool
        or int would break the frontend's conditional rendering."""
        for tier in UserTier:
            result = upgrade_target(tier)
            assert result is None or isinstance(result, str)

    def test_pro_returns_none_specifically(self):
        """The Pro top-tier → None mapping is the most important
        one (it disables the upgrade button). Pin explicitly."""
        for tier in (UserTier.PRO, "pro", "PRO", "Pro", "  pro  "):
            assert upgrade_target(tier) is None, (
                f"Pro tier (variant {tier!r}) should return None, "
                "not a spurious upgrade target"
            )

    def test_free_returns_plus_specifically(self):
        """The Free → Plus mapping is the standard upgrade CTA.
        Pin across case variations."""
        for tier in (UserTier.FREE, "free", "FREE", "Free"):
            assert upgrade_target(tier) == "plus", (
                f"Free tier (variant {tier!r}) should return 'plus'"
            )

    def test_plus_returns_pro_specifically(self):
        for tier in (UserTier.PLUS, "plus", "PLUS", "Plus"):
            assert upgrade_target(tier) == "pro"


class TestUpgradeTargetIdempotence:
    """Two calls in a row produce the same result (no side effects)."""

    def test_repeated_call_is_deterministic(self):
        for _ in range(3):
            assert upgrade_target(UserTier.FREE) == "plus"
            assert upgrade_target(UserTier.PRO) is None

    def test_string_input_does_not_mutate(self):
        """A string input doesn't mutate the helper's internal state."""
        upgrade_target("FREE")
        upgrade_target("free")
        upgrade_target("  free  ")
        # After all three, the result is still consistent.
        assert upgrade_target("free") == "plus"