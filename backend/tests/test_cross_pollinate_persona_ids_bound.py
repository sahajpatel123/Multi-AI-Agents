"""Tests for the CrossPollinateRequest.persona_ids list-length bound.

CrossPollinateRequest.persona_ids historically had no
max_length on the list. A user could submit 1000 unknown
10K-char strings to amplify the cost of
_enforce_persona_access (which iterates the list) and the
downstream validate_persona_access lookup (which is O(n)
over the list).

Fix matches the PromptRequest/DiscussRequest/DebateRequest
fix from cycles 16/17:
- list max_length=4: matches the 4-slot agent design
- per-element 100 chars: already in place via the
  validate_persona_ids field validator

Tests pin:
- 4-entry persona_ids accepted (boundary)
- 5-entry persona_ids rejected
- 1000-entry persona_ids rejected (DoS)
- None / default / empty list accepted
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.agent import CrossPollinateRequest
from pydantic import ValidationError


# --- list-length cap: 4 is the max ---


def test_cross_pollinate_with_4_persona_ids_accepted() -> None:
    req = CrossPollinateRequest(
        task_id="task-abc-123",
        persona_ids=["a", "b", "c", "d"],
    )
    assert len(req.persona_ids) == 4


def test_cross_pollinate_with_5_persona_ids_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        CrossPollinateRequest(
            task_id="task-abc-123",
            persona_ids=["a", "b", "c", "d", "e"],
        )
    assert "persona_ids" in str(exc_info.value).lower()


def test_cross_pollinate_with_1000_persona_ids_rejected() -> None:
    """A 1000-entry persona_ids is rejected at parse time —
    the list-length cap fires before _enforce_persona_access
    iterates the list."""
    with pytest.raises(ValidationError):
        CrossPollinateRequest(
            task_id="task-abc-123",
            persona_ids=["a"] * 1000,
        )


# --- empty / None is the default ---


def test_cross_pollinate_with_no_persona_ids_accepted() -> None:
    req = CrossPollinateRequest(task_id="task-abc-123")
    assert req.persona_ids == []


def test_cross_pollinate_with_empty_list_accepted() -> None:
    req = CrossPollinateRequest(task_id="task-abc-123", persona_ids=[])
    assert req.persona_ids == []


# --- per-element cap (existing 100-char slice) ---


def test_cross_pollinate_with_100_char_string_accepted() -> None:
    req = CrossPollinateRequest(
        task_id="task-abc-123",
        persona_ids=["a" * 100],
    )
    assert req.persona_ids == ["a" * 100]
