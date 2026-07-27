"""Tests for the OrchestrateRequest.questions list-length bound.

questions historically had no max_length at the Pydantic
level. The route handler validates 2-4 non-empty questions
(raises 400 otherwise), but a user could submit 1000
questions to amplify the per-question validation cost
(sanitize_model_text is called per question).

Fix: bound questions at the Pydantic level (max 4 entries).
The route handler's 2-4 check remains as the strict
allow-list (the Pydantic cap is the defense-in-depth outer
bound).

Tests pin:
- 4-entry questions accepted (boundary)
- 5-entry questions rejected
- 1000-entry questions rejected (DoS)
- None / default / empty list accepted
- Each question is sanitized to 2000 chars (no regression)
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.agent import OrchestrateRequest
from pydantic import ValidationError


# --- list-length cap: 4 is the max ---


def test_orchestrate_with_4_questions_accepted() -> None:
    req = OrchestrateRequest(questions=["q1", "q2", "q3", "q4"])
    assert len(req.questions) == 4


def test_orchestrate_with_5_questions_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        OrchestrateRequest(questions=["q1", "q2", "q3", "q4", "q5"])
    assert "questions" in str(exc_info.value).lower()


def test_orchestrate_with_1000_questions_rejected() -> None:
    """A 1000-entry list is rejected at parse time — the
    list-length cap fires before any per-question validation
    cost.
    """
    with pytest.raises(ValidationError):
        OrchestrateRequest(questions=["q"] * 1000)


def test_orchestrate_with_no_questions_accepted() -> None:
    """No questions (the field defaults to []). The route
    handler's 2-4 check rejects the empty list downstream.
    """
    req = OrchestrateRequest()
    assert req.questions == []


def test_orchestrate_with_empty_list_accepted() -> None:
    req = OrchestrateRequest(questions=[])
    assert req.questions == []


# --- per-question cap (existing 2000-char slice) ---


def test_orchestrate_with_2k_question_accepted() -> None:
    """A 2000-char question is accepted (the field validator
    sanitizes to 2000 chars)."""
    req = OrchestrateRequest(questions=["a" * 2000])
    assert len(req.questions[0]) == 2000


def test_orchestrate_with_5k_question_rejected() -> None:
    """A 5K-char question is rejected at parse time — the
    field validator raises ValueError, not a 500. This is
    defense-in-depth: the route handler also validates
    len(q) > 2000 (raises 400). The Pydantic-level reject
    closes the gap at parse time.
    """
    with pytest.raises(ValidationError):
        OrchestrateRequest(questions=["a" * 5000])
