"""Tests for the feedback note field length bounds.

The note field in AgentFeedbackRequest and
AnswerAccuracyFeedbackBody historically had no max_length
at the Pydantic level. A 1MB note would be accepted by
Pydantic, then sliced to 1000 chars by the field validator.

Fix: bound note at the Pydantic level (max 1000 chars).
The field validator still runs (defense-in-depth: the
validator slices the trimmed value while the schema
enforces the per-field hard cap).

Tests pin:
- AgentFeedbackRequest.note: 1000 chars accepted (boundary)
- AgentFeedbackRequest.note: 1001 chars rejected
- AgentFeedbackRequest.note: 1MB rejected (DoS)
- AgentFeedbackRequest.note: None accepted (default)
- AgentFeedbackRequest.note: empty string accepted
- AnswerAccuracyFeedbackBody.note: same bounds apply
- Both body classes: typical short note accepted
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.agent import (
    AgentFeedbackRequest,
    AnswerAccuracyFeedbackBody,
)
from pydantic import ValidationError


# --- AgentFeedbackRequest.note (Optional, max 1000) ---


def test_agent_feedback_note_1000_accepted() -> None:
    req = AgentFeedbackRequest(task_id="task-abc-123", feedback="f", note="a" * 1000)
    assert len(req.note) == 1000


def test_agent_feedback_note_1001_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AgentFeedbackRequest(task_id="task-abc-123", feedback="f", note="a" * 1001)
    assert "note" in str(exc_info.value).lower()


def test_agent_feedback_note_1mb_rejected() -> None:
    """A 1MB note is rejected at parse time — the Pydantic
    cap closes the gap before the field validator's slice
    runs."""
    with pytest.raises(ValidationError):
        AgentFeedbackRequest(task_id="task-abc-123", feedback="f", note="a" * (1024 * 1024))


def test_agent_feedback_note_none_accepted() -> None:
    """None is the default (no note)."""
    req = AgentFeedbackRequest(task_id="task-abc-123", feedback="f")
    assert req.note is None


def test_agent_feedback_note_empty_rejected() -> None:
    """Empty string is rejected by the field validator
    ('note cannot be empty'). The Pydantic cap (max 1000)
    closes the length-based DoS surface; the field validator
    closes the empty-string surface.
    """
    with pytest.raises(ValidationError):
        AgentFeedbackRequest(task_id="task-abc-123", feedback="f", note="")


def test_agent_feedback_note_typical_accepted() -> None:
    """A typical 50-char note is accepted (no regression)."""
    req = AgentFeedbackRequest(
        task_id="task-abc-123",
        feedback="f",
        note="The answer missed the historical context.",
    )
    assert len(req.note) > 0


# --- AnswerAccuracyFeedbackBody.note (Optional, max 1000) ---


def test_answer_accuracy_note_1000_accepted() -> None:
    req = AnswerAccuracyFeedbackBody(verdict="v", note="a" * 1000)
    assert len(req.note) == 1000


def test_answer_accuracy_note_1001_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AnswerAccuracyFeedbackBody(verdict="v", note="a" * 1001)
    assert "note" in str(exc_info.value).lower()


def test_answer_accuracy_note_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        AnswerAccuracyFeedbackBody(verdict="v", note="a" * (1024 * 1024))


def test_answer_accuracy_note_none_accepted() -> None:
    req = AnswerAccuracyFeedbackBody(verdict="v")
    assert req.note is None
