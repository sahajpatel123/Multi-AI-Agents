"""Tests for the BridgeRequest.arena_score length bound.

arena_score historically had no ge/le bounds at the Pydantic
level. A user could submit 999999999999 to amplify the
downstream score-handling work. Arena scores are always
in [0, 100]; the Pydantic cap closes the gap at parse
time (422).

Tests pin:
- arena_score=0 accepted (boundary, default)
- arena_score=100 accepted (boundary, max realistic)
- arena_score=-1 rejected (Pydantic ge=0)
- arena_score=101 rejected (Pydantic le=100)
- arena_score=999999999999 rejected (overflow / DoS)
- arena_score=None accepted as 0 (Pydantic default)
- arena_score="not a number" rejected (Pydantic int)
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.agent import BridgeRequest
from pydantic import ValidationError


def _build(arena_score):
    return BridgeRequest(
        arena_answer="a", original_question="q", arena_score=arena_score,
    )


def test_arena_score_0_accepted() -> None:
    """arena_score=0 is the default (the realistic minimum)."""
    req = _build(0)
    assert req.arena_score == 0


def test_arena_score_100_accepted() -> None:
    """arena_score=100 is the boundary (the realistic maximum)."""
    req = _build(100)
    assert req.arena_score == 100


def test_arena_score_negative_rejected() -> None:
    """arena_score=-1 is rejected (Pydantic ge=0)."""
    with pytest.raises(ValidationError) as exc_info:
        _build(-1)
    assert "arena_score" in str(exc_info.value).lower()


def test_arena_score_over_100_rejected() -> None:
    """arena_score=101 is rejected (Pydantic le=100)."""
    with pytest.raises(ValidationError) as exc_info:
        _build(101)
    assert "arena_score" in str(exc_info.value).lower()


def test_arena_score_huge_rejected() -> None:
    """A 999999999999 arena_score is rejected at parse time
    (Pydantic ge=0/le=100). The previous behavior accepted
    any int, allowing amplification of the downstream
    score-handling work."""
    with pytest.raises(ValidationError):
        _build(999999999999)


def test_arena_score_default_zero() -> None:
    """When arena_score is not provided, the Pydantic default
    is 0 (per the field declaration)."""
    req = BridgeRequest(arena_answer="a", original_question="q")
    assert req.arena_score == 0


def test_arena_score_non_int_rejected() -> None:
    """A non-integer arena_score is rejected (Pydantic int)."""
    with pytest.raises(ValidationError):
        _build("not a number")
