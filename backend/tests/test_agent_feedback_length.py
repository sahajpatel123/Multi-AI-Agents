"""Tests for the AgentFeedbackRequest.feedback and AnswerAccuracyFeedbackBody.verdict length bounds.

Both fields historically had no max_length constraint. A user
could submit a 5MB feedback string in either field. The
content is stored to the DB (FeedbackCalibrationInfo, etc.)
and amplified into calibration stats and the optional note
field.

Fix: cap both at 2000 chars (matches the existing pattern in
agent.py for free-form text — see the rebuttal_text validator
at line 311 and the task / original_verdict validators in
DebateRequest).

Tests pin:
- A 2000-char feedback accepted (boundary)
- A 2001-char feedback rejected
- A 50K-char feedback rejected
- A 1MB feedback rejected
- A 1-char feedback accepted (no regression)
- A 2000-char verdict accepted (AnswerAccuracyFeedbackBody)
- A 2001-char verdict rejected
- A 50K-char verdict rejected
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
# These schemas live in routes/agent.py (not in models/schemas.py).
from arena.routes.agent import (
    AgentFeedbackRequest,
    AnswerAccuracyFeedbackBody,
)
from pydantic import ValidationError


_CONTENT_CAP = 2000


# --- AgentFeedbackRequest.feedback ---


def test_feedback_exactly_2k_accepted() -> None:
    req = AgentFeedbackRequest(
        task_id="task-abc-123",
        feedback="a" * _CONTENT_CAP,
    )
    assert len(req.feedback) == _CONTENT_CAP


def test_feedback_2k_plus_1_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AgentFeedbackRequest(
            task_id="task-abc-123",
            feedback="a" * (_CONTENT_CAP + 1),
        )
    assert "feedback" in str(exc_info.value).lower()


def test_feedback_50k_rejected() -> None:
    """A 50K feedback is rejected (the realistic 'user pastes a
    50K essay' surface)."""
    with pytest.raises(ValidationError):
        AgentFeedbackRequest(
            task_id="task-abc-123",
            feedback="a" * 50000,
        )


def test_feedback_1mb_rejected() -> None:
    """A 1MB feedback is rejected (the DoS surface)."""
    with pytest.raises(ValidationError):
        AgentFeedbackRequest(
            task_id="task-abc-123",
            feedback="a" * (1024 * 1024),
        )


def test_feedback_single_char_accepted() -> None:
    """No regression: a 1-char feedback is accepted."""
    req = AgentFeedbackRequest(task_id="task-abc-123", feedback="x")
    assert req.feedback == "x"


def test_feedback_normal_length_accepted() -> None:
    """No regression: a typical 200-char feedback is accepted."""
    req = AgentFeedbackRequest(
        task_id="task-abc-123",
        feedback="Good answer. Concise and accurate. Would recommend.",
    )
    assert len(req.feedback) > 0


# --- AnswerAccuracyFeedbackBody.verdict ---


def test_verdict_exactly_2k_accepted() -> None:
    req = AnswerAccuracyFeedbackBody(verdict="a" * _CONTENT_CAP)
    assert len(req.verdict) == _CONTENT_CAP


def test_verdict_2k_plus_1_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AnswerAccuracyFeedbackBody(verdict="a" * (_CONTENT_CAP + 1))
    assert "verdict" in str(exc_info.value).lower()


def test_verdict_50k_rejected() -> None:
    with pytest.raises(ValidationError):
        AnswerAccuracyFeedbackBody(verdict="a" * 50000)


def test_verdict_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        AnswerAccuracyFeedbackBody(verdict="a" * (1024 * 1024))


def test_verdict_single_char_accepted() -> None:
    req = AnswerAccuracyFeedbackBody(verdict="x")
    assert req.verdict == "x"
