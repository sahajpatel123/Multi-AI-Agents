"""Tests for the AgentRebuttalRequest field length bounds.

task, answer, challenge historically had no max_length at
the Pydantic level. A 1MB string would be accepted by
Pydantic, then sliced to 2000 chars by the field validator.
The Pydantic cap closes the gap at parse time (422) so
the per-field memory cost is bounded by the cap.

Tests pin:
- task with 2000 chars accepted (boundary)
- task with 2001 chars rejected
- task with 1MB rejected (DoS)
- task with empty string accepted (the field validator
  short-circuits empty values to "")
- answer with 2000 chars accepted (boundary)
- answer with 2001 chars rejected
- answer with 1MB rejected (DoS)
- answer with empty string accepted
- challenge with same bounds apply
- All fields default to "" (omitted from request)
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.agent import AgentRebuttalRequest
from pydantic import ValidationError


# --- task bound (max 2000) ---


def test_rebuttal_task_2000_accepted() -> None:
    req = AgentRebuttalRequest(task="a" * 2000)
    assert len(req.task) == 2000


def test_rebuttal_task_2001_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AgentRebuttalRequest(task="a" * 2001)
    assert "task" in str(exc_info.value).lower()


def test_rebuttal_task_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        AgentRebuttalRequest(task="a" * (1024 * 1024))


def test_rebuttal_task_empty_accepted() -> None:
    """Empty task is accepted (the field validator's
    short-circuit returns "" for empty values)."""
    req = AgentRebuttalRequest(task="")
    assert req.task == ""


# --- answer bound (max 2000) ---


def test_rebuttal_answer_2000_accepted() -> None:
    req = AgentRebuttalRequest(answer="a" * 2000)
    assert len(req.answer) == 2000


def test_rebuttal_answer_2001_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AgentRebuttalRequest(answer="a" * 2001)
    assert "answer" in str(exc_info.value).lower()


def test_rebuttal_answer_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        AgentRebuttalRequest(answer="a" * (1024 * 1024))


def test_rebuttal_answer_empty_rejected() -> None:
    """Empty string is rejected by the field validator
    ('answer cannot be empty'). The Pydantic cap (max 2000)
    closes the length-based DoS surface; the field validator
    closes the empty-string surface.
    """
    with pytest.raises(ValidationError):
        AgentRebuttalRequest(answer="")


# --- challenge bound (max 2000) ---


def test_rebuttal_challenge_2000_accepted() -> None:
    req = AgentRebuttalRequest(challenge="a" * 2000)
    assert len(req.challenge) == 2000


def test_rebuttal_challenge_2001_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AgentRebuttalRequest(challenge="a" * 2001)
    assert "challenge" in str(exc_info.value).lower()


def test_rebuttal_challenge_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        AgentRebuttalRequest(challenge="a" * (1024 * 1024))


# --- all fields default to "" ---


def test_rebuttal_all_fields_default_empty() -> None:
    """All fields default to "" (omitted from request)."""
    req = AgentRebuttalRequest()
    assert req.task == ""
    assert req.answer == ""
    assert req.challenge == ""
