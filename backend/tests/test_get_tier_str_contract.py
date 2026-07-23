"""Regression tests for ``get_tier_str``.

The helper extracts a user's tier as a lowercase string. A
regression here would either:

  - Return the enum repr (``"UserTier.PRO"``) instead of ``"pro"``
    → breaks every `==` comparison the frontend does.
  - Not lowercase → a legacy uppercase tier (e.g. ``"PRO"``) would
    mismatch the canonical ``"pro"`` string.
  - Raise on a user missing the tier attribute → 500 on every
    `/me` request that goes through a half-constructed User row.

Pins:
  - Enum value (UserTier.PRO) → "pro".
  - String tier (legacy / pre-migration) → lowercased.
  - Missing tier attribute → ``""`` (empty string, not None).
  - ``tier=None`` → ``""``.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from arena.core.tier_config import UserTier, get_tier_str


class TestGetTierStrEnum:
    def test_pro_enum_returns_pro(self):
        user = SimpleNamespace(tier=UserTier.PRO)
        assert get_tier_str(user) == "pro"

    def test_plus_enum_returns_plus(self):
        user = SimpleNamespace(tier=UserTier.PLUS)
        assert get_tier_str(user) == "plus"

    def test_free_enum_returns_free(self):
        user = SimpleNamespace(tier=UserTier.FREE)
        assert get_tier_str(user) == "free"

    def test_guest_enum_returns_guest(self):
        user = SimpleNamespace(tier=UserTier.GUEST)
        assert get_tier_str(user) == "guest"

    def test_unknown_enum_value_lowercased(self):
        """A string-like enum value (e.g. a future tier) is
        lowercased verbatim. Pin the contract: enum values go
        through ``str(...).lower()`` without modification."""
        from enum import Enum

        class _CustomEnum(Enum):
            FUTURE_TIER = "FutureTier"

        user = SimpleNamespace(tier=_CustomEnum.FUTURE_TIER)
        assert get_tier_str(user) == "futuretier"


class TestGetTierStrString:
    def test_lowercase_string_tier(self):
        user = SimpleNamespace(tier="pro")
        assert get_tier_str(user) == "pro"

    def test_uppercase_string_tier_lowercased(self):
        """Legacy data may have uppercase tier strings — the
        helper must lowercase to match the canonical form."""
        user = SimpleNamespace(tier="PRO")
        assert get_tier_str(user) == "pro"

    def test_mixed_case_string_tier_lowercased(self):
        user = SimpleNamespace(tier="Plus")
        assert get_tier_str(user) == "plus"

    def test_legacy_registered_lowercased(self):
        user = SimpleNamespace(tier="REGISTERED")
        assert get_tier_str(user) == "registered"


class TestGetTierStrMissing:
    def test_missing_tier_attribute_returns_empty_string(self):
        """A user without a ``tier`` attribute returns ``""`` — not
        None (the frontend's tier-display component assumes string)."""
        user = SimpleNamespace()  # no tier attribute
        assert get_tier_str(user) == ""

    def test_none_tier_returns_empty_string(self):
        user = SimpleNamespace(tier=None)
        assert get_tier_str(user) == ""


class TestGetTierStrDefensive:
    def test_returns_str_type(self):
        """The return type is always ``str`` — never None or bytes.
        Pin the contract."""
        for tier in (UserTier.PRO, "pro", "PRO", None):
            user = SimpleNamespace(tier=tier)
            result = get_tier_str(user)
            assert isinstance(result, str)

    def test_does_not_raise_on_minimal_user(self):
        """A user with no attributes does not raise. Pin the
        defensive gettattr fallback."""
        user = SimpleNamespace()
        # Should NOT raise.
        assert get_tier_str(user) == ""

    def test_lowercase_is_always_returned(self):
        """A regression that returned the raw value (e.g. ``"PRO"``)
        would break every tier comparison. Pin that the result is
        ALWAYS lowercase."""
        for tier in (UserTier.PRO, "PRO", "Pro", "pRo"):
            user = SimpleNamespace(tier=tier)
            assert get_tier_str(user) == get_tier_str(user).lower()


class TestGetTierStrIdempotence:
    def test_repeated_call_is_deterministic(self):
        for _ in range(5):
            user = SimpleNamespace(tier=UserTier.PRO)
            assert get_tier_str(user) == "pro"

    def test_handles_complex_user_stub(self):
        """The helper uses ``getattr(user, 'tier', None)`` — works
        on any object that quacks like a User."""
        class _WeirdUser:
            tier = UserTier.PLUS

            def __init__(self):
                self.created_at = "2026-01-01"

        user = _WeirdUser()
        assert get_tier_str(user) == "plus"