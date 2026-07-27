"""Tests for the PromptRequest.persona_ids length bounds.

PromptRequest.persona_ids historically had no max_length on
either the list or the per-element string. A user could
submit 1000 unknown 10K-char strings to amplify the
validation cost (validate_persona_access has to look up
each one against the persona registry) and the DB write
cost before _enforce_persona_access returns.

Fix:
- list max_length=4: matches the 4-slot agent design
  (slots 1-4)
- per-element max 50 chars: persona_ids are short slugs
  like "philosopher" or "claude_opus"

Tests pin:
- persona_ids with 4 entries accepted
- persona_ids with 5 entries rejected
- persona_ids with 50-char string accepted
- persona_ids with 51-char string truncated to 50 (the
  field validator slices rather than rejects — the existing
  pattern in save_thread_messages)
- persona_ids = None accepted (default)
- persona_ids = [] accepted
- persona_ids with 1000 entries rejected at parse time
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import (arena.models.schemas -> arena.core.datetime_utils
# -> arena.core -> arena.core.agents -> AgentConfig ->
# arena.models.schemas [unfinished]).
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.models.schemas import PromptRequest
from pydantic import ValidationError


# --- list-length cap: 4 is the max ---


def test_persona_ids_with_4_entries_accepted() -> None:
    req = PromptRequest(
        prompt="hi",
        persona_ids=["a", "b", "c", "d"],
    )
    assert len(req.persona_ids) == 4


def test_persona_ids_with_5_entries_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        PromptRequest(
            prompt="hi",
            persona_ids=["a", "b", "c", "d", "e"],
        )
    assert "persona_ids" in str(exc_info.value).lower()


def test_persona_ids_with_1000_entries_rejected() -> None:
    """A user with 1000 entries is rejected at parse time —
    the list-length cap fires before any downstream processing."""
    with pytest.raises(ValidationError):
        PromptRequest(
            prompt="hi",
            persona_ids=["a"] * 1000,
        )


# --- empty / None is the default ---


def test_persona_ids_none_accepted() -> None:
    req = PromptRequest(prompt="hi", persona_ids=None)
    assert req.persona_ids is None


def test_persona_ids_default_is_none() -> None:
    req = PromptRequest(prompt="hi")
    assert req.persona_ids is None


def test_persona_ids_empty_list_accepted() -> None:
    req = PromptRequest(prompt="hi", persona_ids=[])
    assert req.persona_ids == []


# --- per-element cap: 50 chars is the max, longer is truncated ---


def test_persona_ids_with_50_char_string_accepted() -> None:
    req = PromptRequest(
        prompt="hi",
        persona_ids=["a" * 50],
    )
    assert req.persona_ids == ["a" * 50]


def test_persona_ids_with_51_char_string_truncated() -> None:
    """A 51-char string is silently truncated to 50 chars by the
    field validator. The existing pattern in save_thread_messages
    is to slice, not reject, so a user with a slightly-long
    persona id is fixed up at the schema level rather than
    getting a 422.

    Note: this differs from DiscussChatMessage.content
    (cycle 13) which REJECTS over-cap content. The difference
    is that persona_ids are short slugs that downstream
    validate_persona_access has to look up — a truncated slug
    is still a valid (short) lookup key. Over-cap content in
    a chat message is qualitatively different (the user typed
    prose, not a slug).
    """
    req = PromptRequest(
        prompt="hi",
        persona_ids=["a" * 51],
    )
    assert len(req.persona_ids[0]) == 50


def test_persona_ids_with_10k_char_string_truncated_to_50() -> None:
    """A 10K-char string (the DoS payload) is truncated to 50
    chars. The downstream validation cost is now bounded at
    50 chars per element * 4 elements = 200 chars total."""
    req = PromptRequest(
        prompt="hi",
        persona_ids=["a" * 10000],
    )
    assert len(req.persona_ids[0]) == 50


# --- composition: 4 entries * 50 chars each ---


def test_persona_ids_max_safe_accepted() -> None:
    """The composition of the two caps: 4 entries * 50 chars
    each. Both caps pass; the request is accepted."""
    req = PromptRequest(
        prompt="hi",
        persona_ids=["a" * 50, "b" * 50, "c" * 50, "d" * 50],
    )
    assert len(req.persona_ids) == 4
    for persona_id in req.persona_ids:
        assert len(persona_id) == 50
