"""Tests for the DiscussRequest and DebateRequest persona_ids length bounds.

DiscussRequest.persona_ids and DebateRequest.persona_ids
historically had no max_length on either the list or the
per-element string. A user could submit 1000 unknown 10K-char
strings to amplify the validation cost
(validate_persona_access rejects unknown ids, but the
rejection cost is O(n) over the list).

Fix matches the PromptRequest cycle 16 fix:
- list max_length=4: matches the 4-slot agent design
- per-element 50 chars: persona_ids are short slugs

Tests pin (parallel to test_prompt_persona_ids_bound):
- 4-entry persona_ids accepted on both DiscussRequest and
  DebateRequest
- 5-entry persona_ids rejected on both
- 1000-entry persona_ids rejected at parse time
- None / default / empty list accepted
- 50-char string accepted (boundary)
- 51-char string truncated to 50 (field-validator slice)
- 10K-char string truncated to 50 (DoS payload)
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.models.schemas import DebateRequest, DiscussRequest
from pydantic import ValidationError


# --- DiscussRequest ---


def test_discuss_request_with_4_persona_ids_accepted() -> None:
    req = DiscussRequest(
        agent_id="claude-sonnet",
        message="hi",
        original_verdict="v",
        original_prompt="p",
        persona_ids=["a", "b", "c", "d"],
    )
    assert len(req.persona_ids) == 4


def test_discuss_request_with_5_persona_ids_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        DiscussRequest(
            agent_id="claude-sonnet",
            message="hi",
            original_verdict="v",
            original_prompt="p",
            persona_ids=["a", "b", "c", "d", "e"],
        )
    assert "persona_ids" in str(exc_info.value).lower()


def test_discuss_request_with_1000_persona_ids_rejected() -> None:
    with pytest.raises(ValidationError):
        DiscussRequest(
            agent_id="claude-sonnet",
            message="hi",
            original_verdict="v",
            original_prompt="p",
            persona_ids=["a"] * 1000,
        )


def test_discuss_request_persona_ids_none_accepted() -> None:
    req = DiscussRequest(
        agent_id="claude-sonnet",
        message="hi",
        original_verdict="v",
        original_prompt="p",
        persona_ids=None,
    )
    assert req.persona_ids is None


def test_discuss_request_persona_ids_empty_list_accepted() -> None:
    req = DiscussRequest(
        agent_id="claude-sonnet",
        message="hi",
        original_verdict="v",
        original_prompt="p",
        persona_ids=[],
    )
    assert req.persona_ids == []


def test_discuss_request_persona_ids_50_char_accepted() -> None:
    req = DiscussRequest(
        agent_id="claude-sonnet",
        message="hi",
        original_verdict="v",
        original_prompt="p",
        persona_ids=["a" * 50],
    )
    assert req.persona_ids == ["a" * 50]


def test_discuss_request_persona_ids_51_char_truncated() -> None:
    req = DiscussRequest(
        agent_id="claude-sonnet",
        message="hi",
        original_verdict="v",
        original_prompt="p",
        persona_ids=["a" * 51],
    )
    assert len(req.persona_ids[0]) == 50


def test_discuss_request_persona_ids_10k_char_truncated() -> None:
    req = DiscussRequest(
        agent_id="claude-sonnet",
        message="hi",
        original_verdict="v",
        original_prompt="p",
        persona_ids=["a" * 10000],
    )
    assert len(req.persona_ids[0]) == 50


# --- DebateRequest ---


def test_debate_request_with_4_persona_ids_accepted() -> None:
    req = DebateRequest(
        original_prompt="p",
        challenged_agent_id="claude-sonnet",
        challenged_verdict="v",
        persona_ids=["a", "b", "c", "d"],
    )
    assert len(req.persona_ids) == 4


def test_debate_request_with_5_persona_ids_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        DebateRequest(
            original_prompt="p",
            challenged_agent_id="claude-sonnet",
            challenged_verdict="v",
            persona_ids=["a", "b", "c", "d", "e"],
        )
    assert "persona_ids" in str(exc_info.value).lower()


def test_debate_request_with_1000_persona_ids_rejected() -> None:
    with pytest.raises(ValidationError):
        DebateRequest(
            original_prompt="p",
            challenged_agent_id="claude-sonnet",
            challenged_verdict="v",
            persona_ids=["a"] * 1000,
        )


def test_debate_request_persona_ids_none_accepted() -> None:
    req = DebateRequest(
        original_prompt="p",
        challenged_agent_id="claude-sonnet",
        challenged_verdict="v",
        persona_ids=None,
    )
    assert req.persona_ids is None


def test_debate_request_persona_ids_50_char_accepted() -> None:
    req = DebateRequest(
        original_prompt="p",
        challenged_agent_id="claude-sonnet",
        challenged_verdict="v",
        persona_ids=["a" * 50],
    )
    assert req.persona_ids == ["a" * 50]


def test_debate_request_persona_ids_51_char_truncated() -> None:
    req = DebateRequest(
        original_prompt="p",
        challenged_agent_id="claude-sonnet",
        challenged_verdict="v",
        persona_ids=["a" * 51],
    )
    assert len(req.persona_ids[0]) == 50


def test_debate_request_persona_ids_10k_char_truncated() -> None:
    req = DebateRequest(
        original_prompt="p",
        challenged_agent_id="claude-sonnet",
        challenged_verdict="v",
        persona_ids=["a" * 10000],
    )
    assert len(req.persona_ids[0]) == 50
