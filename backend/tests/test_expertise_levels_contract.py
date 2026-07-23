"""Regression tests for the ``_EXPERTISE_LEVELS`` allowlist.

The allowlist gates the user-expertise_level field. A regression
that drops a canonical level would let users pick an invalid
level (the database column accepts arbitrary strings); a regression
that adds a non-canonical level would let users pick a level the
rest of the codebase doesn't recognize.

Pins:
  - All 5 canonical levels are in the set.
  - The set is exactly 5 levels (no extras, no duplicates).
  - Membership test: arbitrary non-canonical strings return False.
  - The set is iterable / hashable.
"""

from __future__ import annotations

import pytest

from arena.routes.auth import _EXPERTISE_LEVELS


class TestExpertiseLevelsContents:
    def test_all_five_canonical_levels_are_present(self):
        """The five canonical levels MUST be in the allowlist —
        a regression that drops one would let users pick an
        invalid level."""
        for level in ("none", "curious", "practitioner", "expert", "researcher"):
            assert level in _EXPERTISE_LEVELS, (
                f"canonical level {level!r} is missing from "
                f"_EXPERTISE_LEVELS"
            )

    def test_set_size_is_exactly_five(self):
        """Pin the exact size — a regression that adds a new level
        without updating downstream code would silently let
        users pick the new level."""
        assert len(_EXPERTISE_LEVELS) == 5

    def test_set_contains_only_lowercase_strings(self):
        """The levels are all lowercase strings. A regression
        that added uppercase variants would create duplicate
        membership cases (curious != Curious)."""
        for level in _EXPERTISE_LEVELS:
            assert level == level.lower()
            assert " " not in level


class TestExpertiseLevelsLookup:
    @pytest.mark.parametrize("non_level", [
        "Expert",       # case mismatch
        "EXPERT",
        "curious ",     # trailing space
        " curious",     # leading space
        "Curious",
        "beginner",     # not in the list
        "novice",
        "advanced",
        "",
        "   ",
        "curious\n",
        "curious\t",
    ])
    def test_non_canonical_returns_false(self, non_level: str):
        """A non-canonical string is NOT in the allowlist. Pin
        that case-folding + whitespace variants are NOT
        accepted — the caller is responsible for ``.strip().lower()``."""
        assert non_level not in _EXPERTISE_LEVELS


class TestExpertiseLevelsDataStructure:
    def test_is_a_set_or_frozenset(self):
        """The allowlist is a set/frozenset — O(1) lookup. A
        regression to a list would be O(n) lookup on every
        /auth/me-expertise update."""
        assert isinstance(_EXPERTISE_LEVELS, (set, frozenset))

    def test_no_duplicates_implicitly(self):
        """Pin no duplicates — the size assertion above covers this,
        but explicit membership test catches subtle bugs."""
        seen = set()
        for level in _EXPERTISE_LEVELS:
            assert level not in seen, f"duplicate level {level!r}"
            seen.add(level)

    def test_iteration_is_stable(self):
        """Iteration order is stable (set iteration order isn't
        guaranteed, but the SET OF ELEMENTS is what callers depend
        on). Pin the MEMBERSHIP, not the order."""
        levels = list(_EXPERTISE_LEVELS)
        assert len(levels) == 5
        # Sort for deterministic comparison.
        assert sorted(levels) == ["curious", "expert", "none", "practitioner", "researcher"]


class TestExpertiseLevelsDefensive:
    def test_lookups_do_not_raise(self):
        """Lookups against the allowlist do not raise on any input."""
        # Membership test on a variety of inputs.
        for value in (None, 42, [], {}, b"bytes", "curious"):
            try:
                _ = value in _EXPERTISE_LEVELS
            except TypeError:
                # Some non-hashable inputs may raise TypeError on
                # ``in`` — that's acceptable. The contract is that
                # STRING membership does not raise.
                if isinstance(value, str):
                    raise

    def test_string_membership_never_raises(self):
        """A string membership test MUST NOT raise — the caller
        uses ``level not in _EXPERTISE_LEVELS`` after stripping
        and lowercasing, which must always succeed."""
        for value in ("", " ", "anything", "curious", "expert", "🔥"):
            # Must not raise.
            _ = value in _EXPERTISE_LEVELS


class TestExpertiseLevelsIdempotence:
    def test_repeated_membership_queries_are_deterministic(self):
        """Pin idempotence — repeated ``in`` queries return the same result."""
        for _ in range(5):
            assert "curious" in _EXPERTISE_LEVELS
            assert "unknown" not in _EXPERTISE_LEVELS


class TestExpertiseLevelsExactSet:
    """Pin the EXACT set — operators add new expertise levels in
    migration scripts; this test catches an unintentional add that
    doesn't update the canonical list."""

    def test_exact_set_contents(self):
        # Frozen set for comparison — order doesn't matter.
        expected = frozenset({"none", "curious", "practitioner", "expert", "researcher"})
        assert _EXPERTISE_LEVELS == expected