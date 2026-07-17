"""Short-term session ownership: no hijack via client-chosen session_id."""

from __future__ import annotations

import pytest

from arena.core.memory import (
    SessionOwnershipError,
    ShortTermMemory,
    assert_session_owner,
)
from arena.models.schemas import AgentResponse, ScoredAgent


def _scored() -> ScoredAgent:
    resp = AgentResponse(
        agent_id="agent_1",
        agent_number=1,
        one_liner="Ship it.",
        verdict="Ship the smallest honest slice.",
        confidence=70,
        key_assumption="Latency is fine.",
    )
    return ScoredAgent(response=resp, score=80, is_winner=True)


def test_assert_session_owner_allows_anonymous_claim():
    assert_session_owner("anonymous", "42")
    assert_session_owner("", "42")
    assert_session_owner("42", "42")


def test_assert_session_owner_rejects_cross_user():
    with pytest.raises(SessionOwnershipError):
        assert_session_owner("1", "2")
    with pytest.raises(SessionOwnershipError):
        assert_session_owner("1", "anonymous")


def test_add_turn_rejects_hijack():
    mem = ShortTermMemory()
    mem.add_turn(
        session_id="s1",
        prompt="victim Q",
        prompt_category="question",
        scored_responses=[_scored()],
        winner_id="agent_1",
        winner_persona_id=None,
        user_id="10",
    )
    with pytest.raises(SessionOwnershipError):
        mem.add_turn(
            session_id="s1",
            prompt="attacker Q",
            prompt_category="question",
            scored_responses=[_scored()],
            winner_id="agent_1",
            winner_persona_id=None,
            user_id="99",
        )
    # Owner still bound; only one exchange.
    state = mem.get_session_state("s1")
    assert state is not None
    assert str(state["user_id"]) == "10"
    assert len(state["exchanges"]) == 1


def test_add_turn_allows_owner_continue():
    mem = ShortTermMemory()
    mem.add_turn(
        session_id="s2",
        prompt="Q1",
        prompt_category="question",
        scored_responses=[_scored()],
        winner_id="agent_1",
        winner_persona_id=None,
        user_id="7",
    )
    mem.add_turn(
        session_id="s2",
        prompt="Q2",
        prompt_category="question",
        scored_responses=[_scored()],
        winner_id="agent_1",
        winner_persona_id=None,
        user_id="7",
    )
    state = mem.get_session_state("s2")
    assert state is not None
    assert len(state["exchanges"]) == 2
    assert str(state["user_id"]) == "7"


def test_get_agent_memory_hides_other_users_takes():
    mem = ShortTermMemory()
    mem.add_turn(
        session_id="s3",
        prompt="secret",
        prompt_category="question",
        scored_responses=[_scored()],
        winner_id="agent_1",
        winner_persona_id=None,
        user_id="5",
    )
    # Owner can read
    assert mem.get_agent_memory("s3", "agent_1", user_id="5")
    # Attacker gets empty (no leak)
    assert mem.get_agent_memory("s3", "agent_1", user_id="99") == []
