"""Tests for the conversation_history and debate_history list-length bounds.

DiscussRequest.conversation_history and DebateRequest.debate_history
historically had no max_length on the list. Combined with the
per-message content caps (cycle 13 / 14 fixes), a user could
submit:

  DiscussRequest: 100K history entries * 20K content = 2GB
  DebateRequest:  100K history entries * 20K content = 2GB

The list-length cap bounds the per-request memory cost
independently of the per-message cap. The numbers are
chosen to match the per-message 20K cap and the realistic
LLM context budget (200K tokens ~ 800K chars).

Tests pin:
- conversation_history exactly at the cap (500) is accepted
- conversation_history one over the cap (501) is rejected
- conversation_history with a single message is accepted
  (no lower bound, the existing min_length=1 on the
  message field applies)
- conversation_history with an empty list is accepted
- debate_history exactly at the cap (32) is accepted
- debate_history one over the cap (33) is rejected
- debate_history with an empty list is accepted
- A user with cap+1 history messages at exactly 20K content
  each is rejected (the list-length cap fires, not the
  per-message cap)
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import (arena.models.schemas -> arena.core.datetime_utils
# -> arena.core -> arena.core.agents -> AgentConfig ->
# arena.models.schemas [unfinished]).
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.models.schemas import DebateMessage, DebateRequest, DiscussChatMessage, DiscussRequest
from pydantic import ValidationError


# --- DiscussRequest.conversation_history bounds ---


_CONVERSATION_HISTORY_CAP = 500


def _make_conversation_history(n: int) -> list[dict]:
    """Build a conversation_history of n entries, each within
    the 20K per-message cap.
    """
    return [
        {"role": "user", "content": f"message {i}"}
        for i in range(n)
    ]


def test_conversation_history_exactly_at_cap_accepted() -> None:
    """500 entries is the cap. Exactly 500 is accepted."""
    req = DiscussRequest(
        agent_id="claude-sonnet",
        message="hi",
        conversation_history=_make_conversation_history(_CONVERSATION_HISTORY_CAP),
        original_verdict="v",
        original_prompt="p",
    )
    assert len(req.conversation_history) == _CONVERSATION_HISTORY_CAP


def test_conversation_history_one_over_cap_rejected() -> None:
    """501 entries is one over the cap. Rejected at parse time
    (422), so the LLM never sees the over-sized list.
    """
    with pytest.raises(ValidationError) as exc_info:
        DiscussRequest(
            agent_id="claude-sonnet",
            message="hi",
            conversation_history=_make_conversation_history(_CONVERSATION_HISTORY_CAP + 1),
            original_verdict="v",
            original_prompt="p",
        )
    assert "conversation_history" in str(exc_info.value).lower()


def test_conversation_history_single_entry_accepted() -> None:
    req = DiscussRequest(
        agent_id="claude-sonnet",
        message="hi",
        conversation_history=[{"role": "user", "content": "hi"}],
        original_verdict="v",
        original_prompt="p",
    )
    assert len(req.conversation_history) == 1


def test_conversation_history_empty_list_accepted() -> None:
    req = DiscussRequest(
        agent_id="claude-sonnet",
        message="hi",
        conversation_history=[],
        original_verdict="v",
        original_prompt="p",
    )
    assert req.conversation_history == []


def test_conversation_history_1000_entries_rejected() -> None:
    """A user with 1000 entries is rejected — the list-length
    cap fires (not the per-message cap, which is 20K each).
    """
    with pytest.raises(ValidationError):
        DiscussRequest(
            agent_id="claude-sonnet",
            message="hi",
            conversation_history=_make_conversation_history(1000),
            original_verdict="v",
            original_prompt="p",
        )


# --- DebateRequest.debate_history bounds ---


_DEBATE_HISTORY_CAP = 32


def _make_debate_history(n: int) -> list[dict]:
    """Build a debate_history of n entries, each within the
    20K per-message cap.
    """
    return [
        {
            "agent_id": "claude-sonnet",
            "content": f"message {i}",
            "round_number": 1,
        }
        for i in range(n)
    ]


def test_debate_history_exactly_at_cap_accepted() -> None:
    req = DebateRequest(
        original_prompt="p",
        challenged_agent_id="claude-sonnet",
        challenged_verdict="v",
        debate_history=_make_debate_history(_DEBATE_HISTORY_CAP),
    )
    assert len(req.debate_history) == _DEBATE_HISTORY_CAP


def test_debate_history_one_over_cap_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        DebateRequest(
            original_prompt="p",
            challenged_agent_id="claude-sonnet",
            challenged_verdict="v",
            debate_history=_make_debate_history(_DEBATE_HISTORY_CAP + 1),
        )
    assert "debate_history" in str(exc_info.value).lower()


def test_debate_history_empty_list_accepted() -> None:
    req = DebateRequest(
        original_prompt="p",
        challenged_agent_id="claude-sonnet",
        challenged_verdict="v",
        debate_history=[],
    )
    assert req.debate_history == []


def test_debate_history_100_entries_rejected() -> None:
    with pytest.raises(ValidationError):
        DebateRequest(
            original_prompt="p",
            challenged_agent_id="claude-sonnet",
            challenged_verdict="v",
            debate_history=_make_debate_history(100),
        )


# --- the cap is on LIST length, not on TOTAL content ---


def test_conversation_history_at_cap_with_at_cap_content_accepted() -> None:
    """500 entries * 20K content each (10MB total) is the
    maximum per-request memory cost. The per-message cap
    (20K) and the list-length cap (500) both pass; the
    total cost is 10MB which is well within the body size
    limit.
    """
    history = [
        {"role": "user", "content": "a" * 20000}
        for _ in range(_CONVERSATION_HISTORY_CAP)
    ]
    req = DiscussRequest(
        agent_id="claude-sonnet",
        message="hi",
        conversation_history=history,
        original_verdict="v",
        original_prompt="p",
    )
    assert len(req.conversation_history) == _CONVERSATION_HISTORY_CAP
    for msg in req.conversation_history:
        assert len(msg.content) == 20000
