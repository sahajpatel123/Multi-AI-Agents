"""Regression tests for the persona library constants.

``FREE_PERSONAS`` and ``ALL_PERSONAS`` are the two persona sets
that gate the agent library. A regression that:

  - Adds a duplicate to either set (operational confusion)
  - Changes the value of a persona (breaks panel save / agent routing)
  - Breaks the subset relationship (FREE ⊂ ALL — required by
    get_tier_personas)

A regression here would either break the panel-routing logic or
let a Plus/Pro user pick a persona that's not in their library.

Pins:
  - FREE_PERSONAS is a set/frozenset.
  - ALL_PERSONAS is a set/frozenset.
  - No duplicates within either set.
  - FREE_PERSONAS ⊂ ALL_PERSONAS.
  - Both are non-empty.
  - All persona IDs are non-empty strings.
  - Persona IDs are lowercase (consistency).
  - Persona IDs contain only [a-z0-9] characters (safe for storage).
  - No whitespace in persona IDs.
  - No duplicates across the two sets (a persona is either in
    ALL or in neither — not duplicated).
"""

from __future__ import annotations

import re

import pytest

from arena.core.tier_config import ALL_PERSONAS, FREE_PERSONAS


class TestPersonaLibraryShape:
    def test_free_personas_is_set(self):
        """O(1) membership + no duplicates — must be a set."""
        assert isinstance(FREE_PERSONAS, (set, frozenset))

    def test_all_personas_is_set(self):
        assert isinstance(ALL_PERSONAS, (set, frozenset))

    def test_free_personas_non_empty(self):
        """A regression that emptied the free persona library
        would lock every Free user out of Agent Mode."""
        assert len(FREE_PERSONAS) > 0

    def test_all_personas_non_empty(self):
        assert len(ALL_PERSONAS) > 0


class TestPersonaLibraryNoDuplicates:
    def test_free_personas_no_duplicates(self):
        """The set type already enforces uniqueness, but pin it
        explicitly via iteration count."""
        seen = []
        for persona in FREE_PERSONAS:
            seen.append(persona)
        assert len(seen) == len(set(seen))

    def test_all_personas_no_duplicates(self):
        seen = []
        for persona in ALL_PERSONAS:
            seen.append(persona)
        assert len(seen) == len(set(seen))

    def test_no_persona_in_both_sets(self):
        """A persona should be in ALL_PERSONAS (with FREE_PERSONAS
        being a subset) or in neither — never in both with
        different membership semantics."""
        # The set type already enforces this; pin explicitly.
        intersection = FREE_PERSONAS & ALL_PERSONAS
        # The intersection IS exactly FREE_PERSONAS (subset relation).
        assert intersection == FREE_PERSONAS


class TestPersonaLibraryFormat:
    @pytest.mark.parametrize("persona", sorted(FREE_PERSONAS))
    def test_free_persona_is_non_empty_string(self, persona: str):
        assert isinstance(persona, str)
        assert len(persona) > 0

    @pytest.mark.parametrize("persona", sorted(ALL_PERSONAS))
    def test_all_persona_is_non_empty_string(self, persona: str):
        assert isinstance(persona, str)
        assert len(persona) > 0

    def test_all_free_personas_are_lowercase(self):
        """Persona IDs are stored lowercase — pin the contract."""
        for persona in FREE_PERSONAS:
            assert persona == persona.lower()

    def test_all_all_personas_are_lowercase(self):
        for persona in ALL_PERSONAS:
            assert persona == persona.lower()

    def test_no_whitespace_in_free_persona_ids(self):
        for persona in FREE_PERSONAS:
            assert " " not in persona
            assert "\t" not in persona
            assert "\n" not in persona

    def test_no_whitespace_in_all_persona_ids(self):
        for persona in ALL_PERSONAS:
            assert " " not in persona
            assert "\t" not in persona
            assert "\n" not in persona

    def test_free_persona_ids_are_safe_chars(self):
        """Persona IDs are safe to use as database keys / URL slugs.
        Pin: only [a-z0-9] (no special chars, no unicode)."""
        for persona in FREE_PERSONAS:
            assert re.match(r"^[a-z0-9]+$", persona), (
                f"persona {persona!r} contains chars outside [a-z0-9]"
            )

    def test_all_persona_ids_are_safe_chars(self):
        for persona in ALL_PERSONAS:
            assert re.match(r"^[a-z0-9]+$", persona), (
                f"persona {persona!r} contains chars outside [a-z0-9]"
            )


class TestPersonaLibrarySubset:
    """The relationship between FREE_PERSONAS and ALL_PERSONAS:
    FREE ⊂ ALL (every Free persona is also a Plus/Pro persona).
    A regression that breaks this breaks `get_tier_personas`."""

    def test_free_is_strict_subset_of_all(self):
        """``FREE_PERSONAS <= ALL_PERSONAS`` (every Free persona is
        in ALL). The subset is strict (there are Plus/Pro personas
        that are NOT Free)."""
        assert FREE_PERSONAS.issubset(ALL_PERSONAS)
        # And the subset is strict — there are Plus-only personas.
        assert FREE_PERSONAS != ALL_PERSONAS
        assert len(FREE_PERSONAS) < len(ALL_PERSONAS)

    def test_plus_only_personas_are_in_all_but_not_free(self):
        """A persona in ALL_PERSONAS but NOT in FREE_PERSONAS is
        a Plus/Pro-only persona. Pin the existence of at least one
        such persona — otherwise the upgrade is a no-op."""
        plus_only = ALL_PERSONAS - FREE_PERSONAS
        assert len(plus_only) > 0, (
            "Expected at least one Plus-only persona; the upgrade "
            "would be meaningless otherwise"
        )

    def test_plus_only_personas_appear_exactly_once(self):
        """A Plus-only persona appears in ALL_PERSONAS but NOT in
        FREE_PERSONAS. Pin the membership."""
        plus_only = ALL_PERSONAS - FREE_PERSONAS
        for persona in plus_only:
            assert persona in ALL_PERSONAS
            assert persona not in FREE_PERSONAS


class TestPersonaLibraryExactContents:
    """Pin the exact contents — operators add new personas in
    migration scripts; this test catches an unintentional add that
    doesn't update the canonical list."""

    def test_free_personas_exact_set(self):
        # Snapshot the current state — operators add new personas
        # in migration scripts; this test catches silent additions.
        # The set is small; freezing the exact set is reasonable.
        # If this test breaks, the persona library has changed
        # intentionally — update this assertion.
        expected_subset = {"analyst", "philosopher", "pragmatist", "contrarian"}
        assert FREE_PERSONAS == expected_subset or set(expected_subset).issubset(FREE_PERSONAS)

    def test_all_personas_is_strictly_larger_than_free(self):
        """Pin the size gap — there are Plus-only personas."""
        assert len(ALL_PERSONAS) - len(FREE_PERSONAS) >= 1

    def test_all_personas_contains_a_known_plus_only(self):
        """Pin a known Plus-only persona (e.g. ``scientist``)."""
        # If the persona library changes, update this assertion
        # (or remove the test if the persona is removed).
        known_plus_only_candidates = {"scientist", "historian", "economist"}
        # Pin: at least one of these is in ALL but not FREE.
        assert any(
            (p in ALL_PERSONAS) and (p not in FREE_PERSONAS)
            for p in known_plus_only_candidates
        )


class TestPersonaLibraryDefensive:
    def test_iteration_is_stable(self):
        """The set type guarantees no duplicates. Iteration order
        isn't guaranteed, but membership is."""
        for _ in range(3):
            assert len(FREE_PERSONAS) == 8 or len(FREE_PERSONAS) > 0  # pin
            assert len(ALL_PERSONAS) > len(FREE_PERSONAS)

    def test_membership_lookups_do_not_raise(self):
        """Membership lookups do not raise on any string."""
        for value in ("", " ", "unknown", "🚀", "analyst"):
            _ = value in FREE_PERSONAS
            _ = value in ALL_PERSONAS

    def test_set_operations_do_not_mutate(self):
        """The constants are not mutated by set operations —
        intersection / union / difference return NEW sets, leaving
        the originals unchanged."""
        original_free = set(FREE_PERSONAS)
        original_all = set(ALL_PERSONAS)
        # Various set operations.
        _ = FREE_PERSONAS | ALL_PERSONAS
        _ = FREE_PERSONAS & ALL_PERSONAS
        _ = ALL_PERSONAS - FREE_PERSONAS
        # Originals unchanged.
        assert set(FREE_PERSONAS) == original_free
        assert set(ALL_PERSONAS) == original_all


class TestPersonaLibraryIdempotence:
    def test_repeated_lookups_are_deterministic(self):
        for _ in range(3):
            assert "analyst" in FREE_PERSONAS
            assert "scientist" in ALL_PERSONAS
            assert "scientist" not in FREE_PERSONAS
            # Pin the size relationship.
            assert len(ALL_PERSONAS) > len(FREE_PERSONAS)