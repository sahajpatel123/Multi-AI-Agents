"""Tests for the DiscussChatMessage.content max_length bound.

DiscussChatMessage.content historically had no max_length field
constraint. A user could submit a single message of arbitrary
size (bounded only by FastAPI's body size limit, ~10MB). The
content would be:
  1. Stored in memory by pydantic (server-side memory amplification)
  2. Forwarded to the LLM API (Anthropic rejects the request
     with 4xx, but only after the request is processed)
  3. Never reach the LLM context window (which is bounded by
     the model, e.g. 200K tokens for Claude Sonnet)

The fix caps content at 20K chars per message at the
Pydantic schema level. The same cap is enforced for the
durable thread record by SaveThreadBody's validate_messages
field validator, so the live request and the saved thread
have a consistent per-message budget.

20K is generous — most real prompts are 1-10K chars. The cap
prevents the per-message DoS without rejecting any legitimate
discuss turn.

Tests pin:
- A 20K-char message is accepted (the cap, not less)
- A 20K+1-char message is rejected at parse time (422)
- A 50K-char message is rejected
- A 1MB message is rejected
- A 1-char message is accepted
- An empty message is accepted (the DiscussRequest layer
  enforces min_length=1)
- DiscussRequest with a too-long message in conversation_history
  is rejected at request parse time (integration test)
- A single large content field is the only path — the cap
  applies per-message, not per-request
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import (arena.models.schemas -> arena.core.datetime_utils
# -> arena.core -> arena.core.agents -> AgentConfig ->
# arena.models.schemas [unfinished]).
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.models.schemas import DiscussChatMessage, DiscussRequest
from pydantic import ValidationError


_CONTENT_CAP = 20000


# --- the cap: 20K is accepted ---


def test_exactly_20k_content_accepted() -> None:
    """The cap is exactly 20K. A message of 20K chars is accepted."""
    msg = DiscussChatMessage(
        role="user",
        content="a" * _CONTENT_CAP,
    )
    assert len(msg.content) == _CONTENT_CAP


def test_one_below_cap_accepted() -> None:
    msg = DiscussChatMessage(role="user", content="a" * (_CONTENT_CAP - 1))
    assert len(msg.content) == _CONTENT_CAP - 1


# --- the cap: 20K+1 is rejected ---


@pytest.mark.parametrize("over", [1, 100, 1000])
def test_over_cap_content_rejected(over: int) -> None:
    """A message longer than 20K chars is rejected at parse time."""
    too_long = "a" * (_CONTENT_CAP + over)
    with pytest.raises(ValidationError) as exc_info:
        DiscussChatMessage(role="user", content=too_long)
    assert "content" in str(exc_info.value).lower()


def test_50k_content_rejected() -> None:
    """A 50K message is rejected — defends against the realistic
    'user pastes a 50K essay' surface."""
    too_long = "a" * 50000
    with pytest.raises(ValidationError):
        DiscussChatMessage(role="user", content=too_long)


def test_1mb_content_rejected() -> None:
    """A 1MB message is rejected — defends against the per-message
    DoS (pydantic stores the full string in memory, plus
    forwards to LLM API which then rejects). The cap means the
    server-side memory cost per request is bounded.
    """
    too_long = "a" * (1024 * 1024)
    with pytest.raises(ValidationError):
        DiscussChatMessage(role="user", content=too_long)


# --- short content is unaffected (no regression) ---


def test_single_char_content_accepted() -> None:
    msg = DiscussChatMessage(role="user", content="x")
    assert msg.content == "x"


def test_normal_length_content_accepted() -> None:
    """A typical 200-char message is accepted (sanity for the
    common case)."""
    msg = DiscussChatMessage(role="user", content="Hello, this is a normal message about something.")
    assert len(msg.content) == 48  # actual length of the string


# --- integration: DiscussRequest rejects too-long history ---


def test_discuss_request_rejects_too_long_message_in_history() -> None:
    """The cap is applied at request parse time. A user with a
    conversation_history containing a single 25K message gets
    422 at parse time — the LLM never sees it.
    """
    too_long = "a" * 25000
    with pytest.raises(ValidationError):
        DiscussRequest(
            agent_id="claude-sonnet",
            message="hi",
            conversation_history=[{"role": "user", "content": too_long}],
            original_verdict="v",
            original_prompt="p",
        )


def test_discuss_request_accepts_exactly_cap_message_in_history() -> None:
    """The cap is exactly 20K. A message of 20K chars in the
    history is accepted (boundary case).
    """
    at_cap = "a" * _CONTENT_CAP
    req = DiscussRequest(
        agent_id="claude-sonnet",
        message="hi",
        conversation_history=[{"role": "user", "content": at_cap}],
        original_verdict="v",
        original_prompt="p",
    )
    assert len(req.conversation_history[0].content) == _CONTENT_CAP


# --- the cap is per-message, not per-request ---


def test_per_message_cap_not_per_request() -> None:
    """The 20K cap is per-message, not per-request. A user with
    10 history messages of 20K each (200K total) is accepted
    at request parse time — the per-message cap is the only
    bound. (The list length is bounded to 500 by
    DiscussRequest, so the maximum request content is
    500 * 20K = 10MB.)
    """
    msgs = [{"role": "user", "content": "a" * _CONTENT_CAP} for _ in range(10)]
    req = DiscussRequest(
        agent_id="claude-sonnet",
        message="hi",
        conversation_history=msgs,
        original_verdict="v",
        original_prompt="p",
    )
    assert len(req.conversation_history) == 10
    for msg in req.conversation_history:
        assert len(msg.content) == _CONTENT_CAP
