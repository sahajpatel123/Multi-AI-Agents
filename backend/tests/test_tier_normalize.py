"""Regression tests for ``normalize_tier`` and ``get_tier_str``.

These two helpers are the universal front-door to every tier-gated
feature in the codebase. A regression here — e.g. dropping a legacy
mapping or upper-casing too aggressively — would silently move every
Free user into a paid tier (or vice versa) across the entire app.

Pins:
  - ``normalize_tier`` returns the enum (not a string).
  - All canonical strings map correctly (FREE / PLUS / PRO / GUEST).
  - The legacy alias ``REGISTERED`` maps to FREE (pre-launch tier name).
  - Empty / None / unknown values default to FREE (default-deny).
  - Whitespace and case are stripped before lookup.
  - Passing a ``UserTier`` enum is idempotent.
  - ``get_tier_str`` handles enum, plain string, None, and missing attr.
"""

from __future__ import annotations

import pytest

from arena.core.tier_config import UserTier, get_tier_str, normalize_tier


class TestNormalizeTier:
    @pytest.mark.parametrize("value,expected", [
        ("FREE", UserTier.FREE),
        ("PLUS", UserTier.PLUS),
        ("PRO", UserTier.PRO),
        ("GUEST", UserTier.GUEST),
    ])
    def test_canonical_strings_map_to_enums(self, value, expected):
        result = normalize_tier(value)
        assert isinstance(result, UserTier)
        assert result is expected

    def test_legacy_registered_maps_to_free(self):
        """``REGISTERED`` was the pre-launch tier name. The mapping to
        FREE is a contract — removing it would lock out any pre-launch
        account whose row still has the legacy value."""
        assert normalize_tier("REGISTERED") is UserTier.FREE

    def test_lowercase_strings_normalize(self):
        """OAuth/profile routes may pass lowercase strings; case folding
        must happen BEFORE the lookup."""
        assert normalize_tier("free") is UserTier.FREE
        assert normalize_tier("plus") is UserTier.PLUS
        assert normalize_tier("pro") is UserTier.PRO
        assert normalize_tier("guest") is UserTier.GUEST

    def test_whitespace_is_stripped(self):
        """Trailing newline from a curl-pipe upload must not 500."""
        assert normalize_tier("  FREE\n") is UserTier.FREE
        assert normalize_tier("\tplus\t") is UserTier.PLUS

    @pytest.mark.parametrize("value", [None, "", "   "])
    def test_missing_or_empty_default_to_free(self, value):
        """Default-deny: a missing tier must NOT escalate to PLUS/PRO."""
        assert normalize_tier(value) is UserTier.FREE

    @pytest.mark.parametrize("value", ["ANONYMOUS", "ENTERPRISE", "foo", "0", "1"])
    def test_unknown_strings_default_to_free(self, value):
        """Unknown tier strings must NOT silently grant access."""
        assert normalize_tier(value) is UserTier.FREE

    def test_passing_enum_is_idempotent(self):
        """Idempotency: caller may already hold a UserTier from a previous
        normalize_tier call. The function must not blow up on enum input."""
        assert normalize_tier(UserTier.PLUS) is UserTier.PLUS
        assert normalize_tier(UserTier.FREE) is UserTier.FREE
        assert normalize_tier(UserTier.PRO) is UserTier.PRO
        assert normalize_tier(UserTier.GUEST) is UserTier.GUEST

    def test_integer_tier_value_normalizes(self):
        """Some legacy rows might store the enum value as an int.
        ``str(int)`` yields the digit, which is unknown → must default
        to FREE, not raise."""
        assert normalize_tier(0) is UserTier.FREE  # "0" → unknown → FREE
        assert normalize_tier(1) is UserTier.FREE


class TestGetTierStr:
    def test_returns_lowercase_for_enum_value(self):
        class _StubUser:
            tier = UserTier.PRO
        assert get_tier_str(_StubUser()) == "pro"

    def test_returns_lowercase_for_plain_string(self):
        class _StubUser:
            tier = "PLUS"
        assert get_tier_str(_StubUser()) == "plus"

    def test_returns_empty_string_when_no_tier_attribute(self):
        class _StubUser:
            pass
        assert get_tier_str(_StubUser()) == ""

    def test_returns_empty_string_when_tier_is_none(self):
        class _StubUser:
            tier = None
        assert get_tier_str(_StubUser()) == ""

    def test_handles_user_without_tier_attribute_gracefully(self):
        """Defensive: a half-constructed User must not raise AttributeError
        in get_tier_str — call sites may run before the row is fully
        populated (e.g. during a transaction rollback path)."""
        class _HalfUser:
            id = 1
        assert get_tier_str(_HalfUser()) == ""

    def test_returns_lowercase_for_unknown_enum_like_string(self):
        """An unknown string tier is returned as-is, lowercased. Callers
        are expected to feed the result through ``normalize_tier`` for
        default-deny semantics."""
        class _StubUser:
            tier = "Enterprise"
        assert get_tier_str(_StubUser()) == "enterprise"