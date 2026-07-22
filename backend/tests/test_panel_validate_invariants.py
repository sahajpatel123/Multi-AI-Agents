"""Regression tests for ``_validate_panel``.

The validator sits in front of every panel write path (manual save,
preset apply, single-slot patch). A regression here would either:

  - Silently accept duplicate persona_ids → user ends up with two of
    the same persona in the panel (UI renders duplicates).
  - Silently accept invalid persona_ids → panel references a persona
    that the agent library doesn't know about.

The paywall check (Tier 3 in `_validate_panel`) calls into the live
seed persona library — `validate_persona_access` uses the tier map at
`arena/core/tier_config.py:TIER_PERSONAS`, which depends on the
seed library content. Those contracts are pinned by integration
tests elsewhere; here we focus on the unit-level invariants (duplicates,
invalid ids) that the function can enforce in isolation.

Pins:
  - Duplicate detection raises 422 with a stable error code.
  - Invalid persona detection raises 422 with the offending ids in
    the message (so the frontend can show 'invalid: X, Y').
  - Duplicate check runs BEFORE invalid check (the duplicate message
    is more actionable than the invalid message when both apply).
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from arena.core.tier_config import UserTier
from arena.routes.panels import _validate_panel


class _FakeQuery:
    def __init__(self, valid_ids: set[str]):
        self._valid_ids = valid_ids

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return [SimpleNamespace(persona_id=p) for p in self._valid_ids]


class _FakeSession:
    def __init__(self, valid_ids: set[str]):
        self._valid_ids = valid_ids

    def query(self, *args, **kwargs):
        return _FakeQuery(self._valid_ids)


def _user(tier: UserTier) -> SimpleNamespace:
    """User whose tier is the seed-library-FREE set so the paywall
    check passes for the positive cases."""
    return SimpleNamespace(tier=tier)


# Use ONLY the personas that the seed library allows for FREE (the
# paywall check depends on the live seed library, so we restrict the
# test to the tier-pinned personas).
FREE_PERSONAS = {"p_free_a", "p_free_b", "p_free_c", "p_free_d"}


class TestValidatePanelDuplicates:
    def test_duplicate_raises_422(self, monkeypatch):
        """Mock the paywall check so the test can isolate the duplicate
        contract from the live tier-mapping in TIER_PERSONAS."""
        from arena.routes import panels as panels_mod
        monkeypatch.setattr(
            panels_mod, "validate_persona_access",
            lambda tier, values: (True, []),
        )
        session = _FakeSession(valid_ids=FREE_PERSONAS)
        user = _user(UserTier.FREE)
        with pytest.raises(HTTPException) as exc:
            _validate_panel(
                ["p_free_a", "p_free_a", "p_free_b", "p_free_c"],
                user=user,
                db=session,
            )
        assert exc.value.status_code == 422
        assert exc.value.detail["error"] == "validation_error"
        assert "duplicate" in exc.value.detail["message"].lower()

    def test_unique_panel_passes(self, monkeypatch):
        """A 4-persona panel with NO duplicates and ALL valid must NOT
        raise. Paywall check is mocked permissive so the test does not
        depend on the live tier mapping."""
        from arena.routes import panels as panels_mod
        monkeypatch.setattr(
            panels_mod, "validate_persona_access",
            lambda tier, values: (True, []),
        )
        session = _FakeSession(valid_ids=FREE_PERSONAS)
        user = _user(UserTier.FREE)
        # Should NOT raise.
        _validate_panel(
            ["p_free_a", "p_free_b", "p_free_c", "p_free_d"],
            user=user,
            db=session,
        )

    def test_three_duplicates_still_raises(self, monkeypatch):
        from arena.routes import panels as panels_mod
        monkeypatch.setattr(
            panels_mod, "validate_persona_access",
            lambda tier, values: (True, []),
        )
        session = _FakeSession(valid_ids=FREE_PERSONAS)
        user = _user(UserTier.FREE)
        with pytest.raises(HTTPException):
            _validate_panel(
                ["p_free_a", "p_free_a", "p_free_b", "p_free_b"],
                user=user,
                db=session,
            )


class TestValidatePanelInvalidPersonas:
    def test_unknown_persona_raises_422(self, monkeypatch):
        from arena.routes import panels as panels_mod
        monkeypatch.setattr(
            panels_mod, "validate_persona_access",
            lambda tier, values: (True, []),
        )
        session = _FakeSession(valid_ids=FREE_PERSONAS)
        user = _user(UserTier.FREE)
        with pytest.raises(HTTPException) as exc:
            _validate_panel(
                ["p_free_a", "DOES_NOT_EXIST", "p_free_b", "p_free_c"],
                user=user,
                db=session,
            )
        assert exc.value.status_code == 422
        assert "DOES_NOT_EXIST" in exc.value.detail["message"]

    def test_multiple_unknowns_all_listed(self, monkeypatch):
        from arena.routes import panels as panels_mod
        monkeypatch.setattr(
            panels_mod, "validate_persona_access",
            lambda tier, values: (True, []),
        )
        session = _FakeSession(valid_ids=FREE_PERSONAS)
        user = _user(UserTier.FREE)
        with pytest.raises(HTTPException) as exc:
            _validate_panel(
                ["p_free_a", "BAD_1", "p_free_b", "BAD_2"],
                user=user,
                db=session,
            )
        assert "BAD_1" in exc.value.detail["message"]
        assert "BAD_2" in exc.value.detail["message"]


class TestValidatePanelValidationPrecedence:
    """The order of validation matters for the UX message."""

    def test_duplicate_check_runs_before_invalid_check(self, monkeypatch):
        """If a duplicate AND an invalid id are present, the duplicate
        message surfaces first — duplicates are easier to fix than
        invalid ids (which require switching personas)."""
        from arena.routes import panels as panels_mod
        monkeypatch.setattr(
            panels_mod, "validate_persona_access",
            lambda tier, values: (True, []),
        )
        session = _FakeSession(valid_ids=FREE_PERSONAS)
        user = _user(UserTier.FREE)
        with pytest.raises(HTTPException) as exc:
            _validate_panel(
                ["p_free_a", "p_free_a", "BAD", "p_free_b"],
                user=user,
                db=session,
            )
        assert exc.value.status_code == 422
        assert "duplicate" in exc.value.detail["message"].lower()
        # The invalid-id message must NOT appear (the duplicate
        # message is the right feedback for this input).
        assert "Invalid persona_id" not in exc.value.detail["message"]


class TestValidatePanelDefensive:
    def test_valid_session_with_empty_library_fails_loudly(self, monkeypatch):
        from arena.routes import panels as panels_mod
        monkeypatch.setattr(
            panels_mod, "validate_persona_access",
            lambda tier, values: (True, []),
        )
        session = _FakeSession(valid_ids=set())
        user = _user(UserTier.FREE)
        with pytest.raises(HTTPException) as exc:
            _validate_panel(
                ["any", "ids", "here", "now"],
                user=user,
                db=session,
            )
        assert exc.value.status_code == 422

    def test_duplicate_detection_works_when_library_is_empty(self, monkeypatch):
        """Duplicate detection runs FIRST — it must not be defeated by
        an empty library (an empty library would normally trigger
        the 'invalid' check, but the duplicate check should win)."""
        from arena.routes import panels as panels_mod
        monkeypatch.setattr(
            panels_mod, "validate_persona_access",
            lambda tier, values: (True, []),
        )
        session = _FakeSession(valid_ids=set())
        user = _user(UserTier.FREE)
        with pytest.raises(HTTPException) as exc:
            _validate_panel(
                ["a", "a", "b", "c"],
                user=user,
                db=session,
            )
        # Duplicate wins (level 1), even though the library is empty
        # (which would trigger level 2 'invalid').
        assert "duplicate" in exc.value.detail["message"].lower()