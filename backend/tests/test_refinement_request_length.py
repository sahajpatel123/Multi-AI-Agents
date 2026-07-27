"""Tests for the RefinementRequest field length bounds.

task_id historically had no max_length at the Pydantic
level. A user could submit a 1MB string to amplify the
pydantic memory cost before the route handler's ownership
check runs.

message was bounded to 1000 chars by the field validator
but not at the Pydantic schema level. The Pydantic cap
closes the gap at parse time (422) so the per-field memory
cost is bounded by the cap.

Tests pin:
- task_id with 100 chars accepted (boundary)
- task_id with 101 chars rejected
- task_id with 1MB rejected (DoS)
- task_id missing rejected (required)
- task_id with empty string rejected (min_length=1)
- message with 1000 chars accepted (boundary)
- message with 1001 chars rejected
- message with 1MB rejected (DoS)
- message with empty string rejected (min_length=1)
- message with typical content accepted
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.agent import RefinementRequest
from pydantic import ValidationError


# --- task_id bound (max 100) ---


def test_refinement_task_id_100_accepted() -> None:
    req = RefinementRequest(task_id="a" * 100, message="hi")
    assert len(req.task_id) == 100


def test_refinement_task_id_101_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        RefinementRequest(task_id="a" * 101, message="hi")
    assert "task_id" in str(exc_info.value).lower()


def test_refinement_task_id_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        RefinementRequest(task_id="a" * (1024 * 1024), message="hi")


def test_refinement_task_id_missing_rejected() -> None:
    with pytest.raises(ValidationError):
        RefinementRequest(message="hi")  # type: ignore[call-arg]


def test_refinement_task_id_empty_rejected() -> None:
    """Empty string is rejected (min_length=1)."""
    with pytest.raises(ValidationError):
        RefinementRequest(task_id="", message="hi")


# --- message bound (max 1000) ---


def test_refinement_message_1000_accepted() -> None:
    req = RefinementRequest(task_id="t", message="a" * 1000)
    assert len(req.message) == 1000


def test_refinement_message_1001_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        RefinementRequest(task_id="t", message="a" * 1001)
    assert "message" in str(exc_info.value).lower()


def test_refinement_message_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        RefinementRequest(task_id="t", message="a" * (1024 * 1024))


def test_refinement_message_empty_rejected() -> None:
    """Empty string is rejected (min_length=1)."""
    with pytest.raises(ValidationError):
        RefinementRequest(task_id="t", message="")


def test_refinement_message_typical_accepted() -> None:
    """A typical 50-char message is accepted (no regression)."""
    req = RefinementRequest(
        task_id="t",
        message="Please make the answer more concise and add citations.",
    )
    assert len(req.message) > 0
