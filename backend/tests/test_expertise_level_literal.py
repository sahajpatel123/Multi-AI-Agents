"""Tests for the expertise_level Literal allowlist.

The expertise_level field historically had type `str` with a
default of "curious" — any string was accepted. The route
handler normalized to lowercase and defaulted empty to
"curious", but a free-form value like "<script>alert(1)</script>"
or "drop table users" would be stored in
AgentTaskRow.expertise_level and forwarded to the LLM
context as the agent's expertise signal.

The auth route already pins the allowlist via the
_EXPERTISE_LEVELS set (auth.py:158):
  {"none", "curious", "practitioner", "expert", "researcher"}

The agent route should pin the same allowlist at the
Pydantic level so any value outside the set is rejected at
parse time (422). The route handler's default-to-"curious"
fallback is preserved (the Literal has "curious" as the
default, so a missing field still defaults to "curious").

Tests pin:
- All 5 allowlist values accepted
- All other values rejected at parse time
- Default is "curious" (the missing-field fallback)
- Case-sensitive (the route handler does .lower() AFTER
  Pydantic validation, so uppercase values are rejected;
  the agent pipeline calls .lower() to handle legacy data)
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.agent import (
    AgentTaskRequest,
    CrossPollinateRequest,
    WatchlistCreateBody,
    WatchlistPatchBody,
)
from pydantic import ValidationError


# --- AgentTaskRequest.expertise_level ---


_ALLOWED = ["none", "curious", "practitioner", "expert", "researcher"]


@pytest.mark.parametrize("level", _ALLOWED)
def test_agent_task_request_expertise_level_allowed(level: str) -> None:
    req = AgentTaskRequest(task="hi", expertise_level=level)
    assert req.expertise_level == level


@pytest.mark.parametrize(
    "level",
    [
        "beginner",     # close but not allowed
        "expert_ai",    # close but not allowed
        "<script>alert(1)</script>",  # XSS attempt
        "drop table users",  # SQL injection attempt
        "CURIOS",       # case-sensitive
        "Curious",      # case-sensitive
        "",             # empty (the default is "curious" so empty would be the default)
        " ",            # whitespace only
        "a" * 1000,     # length
    ],
)
def test_agent_task_request_expertise_level_rejected(level: str) -> None:
    """Values outside the allowlist are rejected at parse time."""
    with pytest.raises(ValidationError) as exc_info:
        AgentTaskRequest(task="hi", expertise_level=level)
    assert "expertise_level" in str(exc_info.value).lower()


def test_agent_task_request_expertise_level_default_is_curious() -> None:
    """The default is "curious" (the missing-field fallback)."""
    req = AgentTaskRequest(task="hi")
    assert req.expertise_level == "curious"


# --- WatchlistCreateBody.expertise_level ---


@pytest.mark.parametrize("level", _ALLOWED)
def test_watchlist_create_expertise_level_allowed(level: str) -> None:
    req = WatchlistCreateBody(question="q", interval_hours=24, expertise_level=level)
    assert req.expertise_level == level


def test_watchlist_create_expertise_level_rejected() -> None:
    with pytest.raises(ValidationError):
        WatchlistCreateBody(
            question="q", interval_hours=24, expertise_level="invalid",
        )


# --- WatchlistPatchBody.expertise_level ---


def test_watchlist_patch_expertise_level_rejected() -> None:
    """WatchlistPatchBody currently has no expertise_level
    field — but the pattern applies to any future
    expertise_level field on patch endpoints. This test
    documents the current state: the field doesn't exist,
    so there's nothing to validate. If a future patch adds
    the field, the Literal allowlist should apply.
    """
    req = WatchlistPatchBody(interval_hours=24)
    # No expertise_level field exists. This test just
    # documents the current state.
    assert not hasattr(req, "expertise_level")


# --- CrossPollinateRequest has no expertise_level field ---


def test_cross_pollinate_no_expertise_level() -> None:
    """CrossPollinateRequest has no expertise_level field.
    This test documents the current state.
    """
    req = CrossPollinateRequest(task_id="t")
    assert not hasattr(req, "expertise_level")
