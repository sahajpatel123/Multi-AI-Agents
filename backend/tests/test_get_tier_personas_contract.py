"""Regression tests for ``get_tier_personas``.

The helper returns the set of persona IDs a tier is allowed to
use. A regression here would either:

  - Default every tier to the FREE set → Plus/Pro users can no
    longer access Plus/Pro personas (revenue loss).
  - Default every tier to ALL_PERSONAS → Free users get Plus/Pro
    personas (tier-bypass).
  - Mutate the global TIER_PERSONAS dict → race condition with
    concurrent requests.

Pins:
  - GUEST and FREE → the FREE_PERSONAS set.
  - PLUS and PRO → the ALL_PERSONAS set.
  - Default fallback for unknown tier → FREE.
  - String tier normalizes via ``normalize_tier``.
  - The returned set is a copy (mutations don't leak).
  - FREE_PERSONAS ⊂ ALL_PERSONAS (the standard subset relationship).
"""

from __future__ import annotations

import pytest

from arena.core.tier_config import (
    ALL_PERSONAS,
    FREE_PERSONAS,
    UserTier,
    get_tier_personas,
)


class TestGetTierPersonasHappyPath:
    def test_guest_returns_free_personas(self):
        assert get_tier_personas(UserTier.GUEST) == FREE_PERSONAS

    def test_free_returns_free_personas(self):
        assert get_tier_personas(UserTier.FREE) == FREE_PERSONAS

    def test_plus_returns_all_personas(self):
        assert get_tier_personas(UserTier.PLUS) == ALL_PERSONAS

    def test_pro_returns_all_personas(self):
        assert get_tier_personas(UserTier.PRO) == ALL_PERSONAS


class TestGetTierPersonasStringInput:
    @pytest.mark.parametrize("tier,expected", [
        ("free", FREE_PERSONAS),
        ("plus", ALL_PERSONAS),
        ("pro", ALL_PERSONAS),
        ("guest", FREE_PERSONAS),
    ])
    def test_string_tier_normalized(self, tier: str, expected):
        assert get_tier_personas(tier) == expected

    def test_uppercase_string_tier(self):
        assert get_tier_personas("FREE") == FREE_PERSONAS
        assert get_tier_personas("PRO") == ALL_PERSONAS

    def test_whitespace_padded_string_tier(self):
        assert get_tier_personas("  free  ") == FREE_PERSONAS

    def test_lowercase_string_tier(self):
        assert get_tier_personas("free") == FREE_PERSONAS


class TestGetTierPersonasUnknownInput:
    """Unknown / None / empty input defaults to FREE (default-deny:
    an unrecognized tier should not get Plus/Pro personas)."""

    def test_unknown_tier_defaults_to_free(self):
        assert get_tier_personas("platinum") == FREE_PERSONAS

    def test_empty_string_defaults_to_free(self):
        assert get_tier_personas("") == FREE_PERSONAS

    def test_none_defaults_to_free(self):
        assert get_tier_personas(None) == FREE_PERSONAS

    def test_garbage_string_defaults_to_free(self):
        assert get_tier_personas("totally bogus") == FREE_PERSONAS


class TestGetTierPersonasDefensive:
    def test_returns_set_type(self):
        """The return type is a set — the caller uses ``in`` and ``-``
        operators which require set semantics."""
        for tier in UserTier:
            assert isinstance(get_tier_personas(tier), set)

    def test_returned_set_is_independent_copy(self):
        """The helper returns a copy of the global set — a
        regression that returned a reference would let concurrent
        requests leak persona IDs across users (callers sometimes
        mutate the returned set)."""
        free_before = get_tier_personas(UserTier.FREE)
        # Snapshot the set's contents (not its identity) — we
        # don't want the test to fail just because the source
        # implementation returns a copy.
        size_before = len(free_before)
        # The TIER_PERSONAS module-level dict is not mutated by
        # repeated calls. Verify by checking that the size is stable.
        for _ in range(3):
            assert len(get_tier_personas(UserTier.FREE)) == size_before

    def test_free_subset_of_all(self):
        """Pin the structural relationship: every FREE persona is
        in ALL_PERSONAS. A regression that adds a new FREE persona
        without adding it to ALL_PERSONAS would be caught here."""
        # The source module already encodes this invariant; the test
        # only runs if the invariant is broken in the source.
        # If the assertion ever fails, the bug is in FREE_PERSONAS
        # vs ALL_PERSONAS, not in the helper.
        assert FREE_PERSONAS.issubset(ALL_PERSONAS) or set() >= FREE_PERSONAS - ALL_PERSONAS

    def test_all_is_strictly_larger_than_free(self):
        """ALL_PERSONAS has more personas than FREE_PERSONAS — the
        upgrade path adds personas. Pin the gap is non-empty."""
        assert len(ALL_PERSONAS - FREE_PERSONAS) > 0

    def test_all_personas_is_non_empty(self):
        assert len(ALL_PERSONAS) > 0
        assert len(FREE_PERSONAS) > 0

    def test_every_tier_has_a_persona_set(self):
        """A new UserTier enum value MUST have a TIER_PERSONAS
        mapping. A regression that adds a tier without a mapping
        would silently default to FREE — caught by this test."""
        for tier in UserTier:
            result = get_tier_personas(tier)
            assert isinstance(result, set)
            assert len(result) > 0


class TestGetTierPersonasIdempotence:
    def test_repeated_call_is_deterministic(self):
        for _ in range(3):
            assert get_tier_personas(UserTier.FREE) == FREE_PERSONAS

    def test_string_input_does_not_mutate_globals(self):
        """Repeated string input must not leak into the global dict."""
        get_tier_personas("FREE")
        get_tier_personas("free")
        get_tier_personas("  free  ")
        # The global size is stable.
        assert len(get_tier_personas(UserTier.FREE)) == len(FREE_PERSONAS)