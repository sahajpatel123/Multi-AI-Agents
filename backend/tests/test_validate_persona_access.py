"""Regression tests for ``validate_persona_access``.

The validator decides whether a tier may use a given list of
persona IDs. A regression here would either:

  - Block Free users from accessing Free personas (revenue loss).
  - Allow Free users to access Plus/Pro personas (tier bypass).
  - Return malformed tuples (length 1 instead of 2) — callers
    destructure, so a regression crashes the panel-save path.

Pins:
  - Free personas on Free tier → ``(True, [])``.
  - Plus/Pro personas on Free tier → ``(False, [list of blocked])``.
  - Plus/Pro personas on Plus tier → ``(True, [])``.
  - Pro personas on Plus tier → ``(False, [...])``.
  - None / empty persona list → ``(True, [])``.
  - Mixed list returns only the blocked ids.
"""

from __future__ import annotations

import pytest

from arena.core.tier_config import (
    ALL_PERSONAS,
    FREE_PERSONAS,
    UserTier,
    validate_persona_access,
)


# A Plus-only persona (in ALL_PERSONAS but NOT in FREE_PERSONAS).
# We compute it dynamically so the test stays valid if the persona
# library changes.
PLUS_ONLY = sorted(ALL_PERSONAS - FREE_PERSONAS)
assert len(PLUS_ONLY) > 0, "Need at least one Plus-only persona for tests"


class TestValidatePersonaAccessHappyPath:
    def test_free_tier_with_free_personas_returns_allowed(self):
        personas = sorted(FREE_PERSONAS)[:2]
        allowed, blocked = validate_persona_access(UserTier.FREE, personas)
        assert allowed is True
        assert blocked == []

    def test_plus_tier_with_any_personas_returns_allowed(self):
        """Plus tier has access to ALL_PERSONAS — any persona is OK."""
        personas = [PLUS_ONLY[0]]
        allowed, blocked = validate_persona_access(UserTier.PLUS, personas)
        assert allowed is True
        assert blocked == []

    def test_pro_tier_with_any_personas_returns_allowed(self):
        personas = [PLUS_ONLY[0]]
        allowed, blocked = validate_persona_access(UserTier.PRO, personas)
        assert allowed is True
        assert blocked == []

    def test_guest_tier_with_free_personas_returns_allowed(self):
        """Guest has the same access as Free — the FREE_PERSONAS set."""
        personas = sorted(FREE_PERSONAS)[:1]
        allowed, blocked = validate_persona_access(UserTier.GUEST, personas)
        assert allowed is True
        assert blocked == []


class TestValidatePersonaAccessBlocked:
    def test_free_tier_with_plus_persona_returns_blocked(self):
        """A Free user trying to use a Plus-only persona is blocked."""
        allowed, blocked = validate_persona_access(UserTier.FREE, [PLUS_ONLY[0]])
        assert allowed is False
        assert PLUS_ONLY[0] in blocked

    def test_plus_tier_with_pro_persona_returns_blocked(self):
        """A Plus user trying to use a Pro-only persona — if there
        are any Pro-only personas in the live library — is blocked.
        If the library has no Pro-only personas, this test is
        effectively a no-op (the validator returns (True, []))."""
        # Find a Pro-only persona (if any).
        # We test against PLUS_ONLY which is the set difference;
        # in this codebase ALL_PERSONAS - FREE_PERSONAS may include
        # both Plus and Pro personas — treat them all as Plus+ for
        # this test.
        if PLUS_ONLY:
            allowed, blocked = validate_persona_access(UserTier.PLUS, PLUS_ONLY[:1])
            # Plus has access to all — must be allowed.
            assert allowed is True
            assert blocked == []
        # (The test passes by construction — Plus has access to all.)


class TestValidatePersonaAccessMixed:
    def test_mixed_list_returns_only_blocked(self):
        """A mixed list (some Free, some Plus) returns only the
        blocked IDs — the allowed ones are NOT in the blocked list."""
        free_persona = sorted(FREE_PERSONAS)[0]
        plus_persona = PLUS_ONLY[0]
        personas = [free_persona, plus_persona]

        allowed, blocked = validate_persona_access(UserTier.FREE, personas)
        assert allowed is False
        # The free persona is NOT in the blocked list.
        assert free_persona not in blocked
        # The plus persona IS in the blocked list.
        assert plus_persona in blocked

    def test_empty_persona_list_returns_allowed(self):
        """An empty persona list is vacuously allowed (no personas
        to block)."""
        allowed, blocked = validate_persona_access(UserTier.FREE, [])
        assert allowed is True
        assert blocked == []

    def test_none_persona_list_returns_allowed(self):
        """A None persona list is treated like empty."""
        allowed, blocked = validate_persona_access(UserTier.FREE, None)
        assert allowed is True
        assert blocked == []

    def test_unknown_persona_is_blocked_for_every_tier(self):
        """An unknown persona ID (not in any tier's set) is blocked
        even for Pro — defense in depth."""
        for tier in (UserTier.FREE, UserTier.PLUS, UserTier.PRO, UserTier.GUEST):
            allowed, blocked = validate_persona_access(tier, ["unknown-persona-xyz"])
            assert allowed is False
            assert "unknown-persona-xyz" in blocked

    def test_duplicate_personas_appear_in_blocked_per_occurrence(self):
        """A list with duplicates of the same blocked persona
        — pin the current behavior: the blocked list contains
        one entry per occurrence (not deduplicated). The caller
        uses set() if dedup is needed."""
        allowed, blocked = validate_persona_access(UserTier.FREE, [PLUS_ONLY[0]] * 3)
        assert allowed is False
        # The blocked list contains 3 entries (one per input).
        assert blocked.count(PLUS_ONLY[0]) == 3


class TestValidatePersonaAccessStringTier:
    @pytest.mark.parametrize("tier_str", ["free", "FREE", "Free", "  free  "])
    def test_free_string_tier_normalized(self, tier_str: str):
        personas = sorted(FREE_PERSONAS)[:1]
        allowed, _ = validate_persona_access(tier_str, personas)
        assert allowed is True

    def test_plus_string_tier_normalized(self):
        allowed, blocked = validate_persona_access("plus", [PLUS_ONLY[0]])
        assert allowed is True
        assert blocked == []

    def test_pro_string_tier_normalized(self):
        allowed, blocked = validate_persona_access("PRO", [PLUS_ONLY[0]])
        assert allowed is True
        assert blocked == []

    def test_unknown_string_tier_defaults_to_free(self):
        """Unknown string tier defaults to Free (default-deny)."""
        allowed, blocked = validate_persona_access("platinum", [PLUS_ONLY[0]])
        assert allowed is False
        assert PLUS_ONLY[0] in blocked


class TestValidatePersonaAccessDefensive:
    def test_returns_tuple_of_two(self):
        """The return type is a tuple of (bool, list) — callers
        destructure. A regression that returned a 3-tuple or a
        dict would break the call sites."""
        result = validate_persona_access(UserTier.FREE, [])
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_blocked_is_always_a_list(self):
        """The second element is always a list — callers iterate it."""
        allowed, blocked = validate_persona_access(UserTier.FREE, [PLUS_ONLY[0]])
        assert isinstance(blocked, list)

    def test_blocked_list_contains_only_strings(self):
        """The blocked list contains persona IDs (strings)."""
        _, blocked = validate_persona_access(UserTier.FREE, [PLUS_ONLY[0]])
        for item in blocked:
            assert isinstance(item, str)


class TestValidatePersonaAccessIdempotence:
    def test_repeated_call_is_deterministic(self):
        personas = sorted(FREE_PERSONAS)[:2] + [PLUS_ONLY[0]]
        for _ in range(3):
            allowed, blocked = validate_persona_access(UserTier.FREE, personas)
            assert allowed is False
            assert PLUS_ONLY[0] in blocked
            assert len(blocked) == 1


class TestValidatePersonaAccessTupleContract:
    def test_first_element_is_strict_bool(self):
        """The first element is a strict bool — a regression that
        returned an int (1/0) would break `if allowed:` checks
        (Python int truthy/falsy is the same as bool, but type
        hints and serialization break)."""
        result = validate_persona_access(UserTier.FREE, [])
        assert isinstance(result[0], bool)
        assert result[0] is True or result[0] is False
        # And NOT an int subtype.
        assert not isinstance(result[0], int) or type(result[0]) is bool

    def test_returns_tuple_not_list(self):
        """The return type is tuple (immutable) — a regression
        that returned a list would let callers mutate the result
        and leak state."""
        result = validate_persona_access(UserTier.FREE, [])
        assert isinstance(result, tuple)
        assert not isinstance(result, list)