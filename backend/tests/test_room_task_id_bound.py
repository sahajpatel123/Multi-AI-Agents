"""Tests for the CreateRoomBody.task_id and AddTaskBody.task_id length bounds.

Both task_id fields historically had no max_length at the
Pydantic level. A user could submit a 1MB string to amplify
the pydantic memory cost before the route handler's
ownership check runs.

Real task_id values are UUIDs (~36 chars); 100 chars is
generous. The Pydantic cap closes the gap at parse time
(422) so the per-task memory cost is bounded by the cap.

Tests pin:
- CreateRoomBody.task_id: 100 chars accepted (boundary)
- CreateRoomBody.task_id: 101 chars rejected
- CreateRoomBody.task_id: 1MB rejected (DoS)
- CreateRoomBody.task_id: None accepted (default)
- AddTaskBody.task_id: 100 chars accepted (boundary)
- AddTaskBody.task_id: 101 chars rejected
- AddTaskBody.task_id: 1MB rejected (DoS)
- AddTaskBody.task_id: None rejected (required)
- AddTaskBody.task_id: "" rejected (min_length=1)
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.rooms import AddTaskBody, CreateRoomBody
from pydantic import ValidationError


# --- CreateRoomBody.task_id (Optional, max 100) ---


def test_create_room_task_id_100_accepted() -> None:
    req = CreateRoomBody(name="r", task_id="a" * 100)
    assert len(req.task_id) == 100


def test_create_room_task_id_101_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        CreateRoomBody(name="r", task_id="a" * 101)
    assert "task_id" in str(exc_info.value).lower()


def test_create_room_task_id_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        CreateRoomBody(name="r", task_id="a" * (1024 * 1024))


def test_create_room_task_id_none_accepted() -> None:
    """None is the default (the room is created without an
    initial task)."""
    req = CreateRoomBody(name="r")
    assert req.task_id is None


def test_create_room_task_id_uuid_length_accepted() -> None:
    """A typical UUID-length string (36 chars) is accepted."""
    req = CreateRoomBody(name="r", task_id="a" * 36)
    assert len(req.task_id) == 36


# --- AddTaskBody.task_id (Required, min_length=1, max 100) ---


def test_add_task_task_id_100_accepted() -> None:
    req = AddTaskBody(task_id="a" * 100)
    assert len(req.task_id) == 100


def test_add_task_task_id_101_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AddTaskBody(task_id="a" * 101)
    assert "task_id" in str(exc_info.value).lower()


def test_add_task_task_id_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        AddTaskBody(task_id="a" * (1024 * 1024))


def test_add_task_task_id_missing_rejected() -> None:
    """Missing field is rejected (the field is required)."""
    with pytest.raises(ValidationError):
        AddTaskBody()  # type: ignore[call-arg]


def test_add_task_task_id_empty_rejected() -> None:
    """Empty string is rejected (min_length=1)."""
    with pytest.raises(ValidationError):
        AddTaskBody(task_id="")


def test_add_task_task_id_single_char_accepted() -> None:
    """A 1-char task_id is accepted (the realistic minimum)."""
    req = AddTaskBody(task_id="x")
    assert req.task_id == "x"
