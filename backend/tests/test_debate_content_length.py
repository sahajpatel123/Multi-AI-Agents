"""Tests for the DebateMessage.content max_length bound.

DebateMessage.content historically had no max_length field
constraint. A user could submit a single message of arbitrary
size (bounded only by FastAPI's body size limit, ~10MB) in
the debate_history of a DebateRequest. The content is then
appended to the LLM context via _build_debate_context
("  [{speaker}]: {msg.content}") and forwarded to the LLM
API, which rejects the request after the server has already
paid the memory cost.

Fix: cap content at 20K chars per message at the Pydantic
schema level. The cap matches DiscussChatMessage.content
(cycle 13 fix) and the realistic LLM context budget.

Tests pin:
- A 20K-char message is accepted (the cap, not less)
- A 20K+1-char message is rejected at parse time
- A 50K-char message is rejected
- A 1MB message is rejected
- A 1-char message is accepted
- DebateRequest with a too-long history message is rejected
  at request parse time (integration test - the LLM never
  sees it)
- DebateRequest with a 20K history message is accepted
- The cap is per-message, not per-request
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import (arena.models.schemas -> arena.core.datetime_utils
# -> arena.core -> arena.core.agents -> AgentConfig ->
# arena.models.schemas [unfinished]).
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.models.schemas import DebateMessage, DebateRequest
from pydantic import ValidationError


_CONTENT_CAP = 20000


# --- the cap: 20K is accepted ---


def test_exactly_20k_content_accepted() -> None:
    msg = DebateMessage(
        agent_id="claude-sonnet",
        content="a" * _CONTENT_CAP,
        round_number=1,
    )
    assert len(msg.content) == _CONTENT_CAP


def test_one_below_cap_accepted() -> None:
    msg = DebateMessage(
        agent_id="claude-sonnet",
        content="a" * (_CONTENT_CAP - 1),
        round_number=1,
    )
    assert len(msg.content) == _CONTENT_CAP - 1


# --- the cap: 20K+1 is rejected ---


@pytest.mark.parametrize("over", [1, 100, 1000])
def test_over_cap_content_rejected(over: int) -> None:
    too_long = "a" * (_CONTENT_CAP + over)
    with pytest.raises(ValidationError) as exc_info:
        DebateMessage(
            agent_id="claude-sonnet",
            content=too_long,
            round_number=1,
        )
    assert "content" in str(exc_info.value).lower()


def test_50k_content_rejected() -> None:
    with pytest.raises(ValidationError):
        DebateMessage(
            agent_id="claude-sonnet",
            content="a" * 50000,
            round_number=1,
        )


def test_1mb_content_rejected() -> None:
    with pytest.raises(ValidationError):
        DebateMessage(
            agent_id="claude-sonnet",
            content="a" * (1024 * 1024),
            round_number=1,
        )


# --- short content is unaffected (no regression) ---


def test_single_char_content_accepted() -> None:
    msg = DebateMessage(agent_id="claude-sonnet", content="x", round_number=1)
    assert msg.content == "x"


def test_normal_length_content_accepted() -> None:
    """A typical 100-char message is accepted."""
    msg = DebateMessage(
        agent_id="claude-sonnet",
        content="I disagree because the data shows otherwise.",
        round_number=1,
    )
    assert len(msg.content) == 44  # actual length of the string


# --- integration: DebateRequest rejects too-long history ---


def test_debate_request_rejects_too_long_message_in_history() -> None:
    too_long = "a" * 25000
    with pytest.raises(ValidationError):
        DebateRequest(
            original_prompt="p",
            challenged_agent_id="claude-sonnet",
            challenged_verdict="v",
            debate_history=[
                {
                    "agent_id": "claude-sonnet",
                    "content": too_long,
                    "round_number": 1,
                }
            ],
        )


def test_debate_request_accepts_exactly_cap_message_in_history() -> None:
    """The cap is exactly 20K. A message of 20K chars in the
    history is accepted (boundary case).
    """
    at_cap = "a" * _CONTENT_CAP
    req = DebateRequest(
        original_prompt="p",
        challenged_agent_id="claude-sonnet",
        challenged_verdict="v",
        debate_history=[
            {
                "agent_id": "claude-sonnet",
                "content": at_cap,
                "round_number": 1,
            }
        ],
    )
    assert len(req.debate_history[0].content) == _CONTENT_CAP


# --- the cap is per-message, not per-request ---


def test_per_message_cap_not_per_request() -> None:
    """The 20K cap is per-message, not per-request. A user with
    10 history messages of 20K each (200K total) is accepted
    at request parse time.
    """
    msgs = [
        {
            "agent_id": "claude-sonnet",
            "content": "a" * _CONTENT_CAP,
            "round_number": i,
        }
        for i in range(10)
    ]
    req = DebateRequest(
        original_prompt="p",
        challenged_agent_id="claude-sonnet",
        challenged_verdict="v",
        debate_history=msgs,
    )
    assert len(req.debate_history) == 10
    for msg in req.debate_history:
        assert len(msg.content) == _CONTENT_CAP
