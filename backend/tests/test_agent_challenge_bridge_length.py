"""Tests for the AgentChallengeRequest and BridgeRequest field length bounds.

Both bodies have unbounded str fields. The field validators
cap them after Pydantic accepts the full string. The
Pydantic cap closes the gap at parse time (422) so the
per-field memory cost is bounded by the cap.

Tests pin:
- AgentChallengeRequest.task_id: 100 accepted (boundary),
  101 rejected, 1MB rejected
- AgentChallengeRequest.answer: 2000 accepted, 2001 rejected,
  1MB rejected, empty accepted
- AgentChallengeRequest.task: 2000 accepted, 2001 rejected,
  1MB rejected
- BridgeRequest.arena_answer: 2000 accepted, 2001 rejected,
  1MB rejected, missing rejected (required)
- BridgeRequest.original_question: same bounds
- BridgeRequest.winning_persona: 100 accepted, 101 rejected,
  1MB rejected, empty accepted (default)
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.agent import AgentChallengeRequest, BridgeRequest
from pydantic import ValidationError


# --- AgentChallengeRequest.task_id (max 100) ---


def test_agent_challenge_task_id_100_accepted() -> None:
    req = AgentChallengeRequest(task_id="a" * 100)
    assert len(req.task_id) == 100


def test_agent_challenge_task_id_101_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AgentChallengeRequest(task_id="a" * 101)
    assert "task_id" in str(exc_info.value).lower()


def test_agent_challenge_task_id_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        AgentChallengeRequest(task_id="a" * (1024 * 1024))


# --- AgentChallengeRequest.answer (max 2000) ---


def test_agent_challenge_answer_2000_accepted() -> None:
    req = AgentChallengeRequest(answer="a" * 2000)
    assert len(req.answer) == 2000


def test_agent_challenge_answer_2001_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AgentChallengeRequest(answer="a" * 2001)
    assert "answer" in str(exc_info.value).lower()


def test_agent_challenge_answer_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        AgentChallengeRequest(answer="a" * (1024 * 1024))


def test_agent_challenge_answer_empty_accepted() -> None:
    """Empty answer is accepted (the field validator
    short-circuits empty to "")."""
    req = AgentChallengeRequest(answer="")
    assert req.answer == ""


# --- AgentChallengeRequest.task (max 2000) ---


def test_agent_challenge_task_2000_accepted() -> None:
    req = AgentChallengeRequest(task="a" * 2000)
    assert len(req.task) == 2000


def test_agent_challenge_task_2001_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AgentChallengeRequest(task="a" * 2001)
    assert "task" in str(exc_info.value).lower()


def test_agent_challenge_task_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        AgentChallengeRequest(task="a" * (1024 * 1024))


# --- BridgeRequest.arena_answer (max 2000, required) ---


def test_bridge_arena_answer_2000_accepted() -> None:
    req = BridgeRequest(arena_answer="a" * 2000, original_question="q")
    assert len(req.arena_answer) == 2000


def test_bridge_arena_answer_2001_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        BridgeRequest(arena_answer="a" * 2001, original_question="q")
    assert "arena_answer" in str(exc_info.value).lower()


def test_bridge_arena_answer_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        BridgeRequest(arena_answer="a" * (1024 * 1024), original_question="q")


def test_bridge_arena_answer_missing_rejected() -> None:
    with pytest.raises(ValidationError):
        BridgeRequest(original_question="q")  # type: ignore[call-arg]


# --- BridgeRequest.original_question (max 2000, required) ---


def test_bridge_original_question_2000_accepted() -> None:
    req = BridgeRequest(arena_answer="a", original_question="q" * 2000)
    assert len(req.original_question) == 2000


def test_bridge_original_question_2001_rejected() -> None:
    with pytest.raises(ValidationError):
        BridgeRequest(arena_answer="a", original_question="q" * 2001)


def test_bridge_original_question_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        BridgeRequest(arena_answer="a", original_question="q" * (1024 * 1024))


# --- BridgeRequest.winning_persona (max 100, default "") ---


def test_bridge_winning_persona_100_accepted() -> None:
    req = BridgeRequest(arena_answer="a", original_question="q", winning_persona="a" * 100)
    assert len(req.winning_persona) == 100


def test_bridge_winning_persona_101_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        BridgeRequest(arena_answer="a", original_question="q", winning_persona="a" * 101)
    assert "winning_persona" in str(exc_info.value).lower()


def test_bridge_winning_persona_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        BridgeRequest(
            arena_answer="a", original_question="q",
            winning_persona="a" * (1024 * 1024),
        )


def test_bridge_winning_persona_empty_accepted() -> None:
    """Empty string is the default (no winning_persona)."""
    req = BridgeRequest(arena_answer="a", original_question="q")
    assert req.winning_persona == ""
