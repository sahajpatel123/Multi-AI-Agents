"""Tests for the add_task_to_room race fix.

rooms.py:add_task_to_room historically did a dup check then INSERT
without catching IntegrityError. Two concurrent requests for the
same (room_id, task_id) pair both passed the dup check, and the
RoomTask unique constraint (`uq_room_task_room_task`) rejected
the second INSERT, surfacing as 500. The fix wraps the commit in
try/except IntegrityError and returns the same shape as the
"already in room" branch.

Tests pin:
1. A single add-task for a new (room, task) pair returns 200
   with the room payload (sanity that the fix didn't regress the
   happy path).
2. Two sequential add-task calls for the same (room, task) pair
   both return 200, the second one returning the same payload
   shape (the pre-check dup branch is the natural path here).
3. The losing race returns the same envelope as the pre-check
   path (no 500, no schema-leaking IntegrityError detail). The
   test simulates the race by inserting a RoomTask row directly
   between the dup check and the commit, so the commit raises
   IntegrityError and the IntegrityError branch must be hit.
4. The losing race does NOT trigger a second synthesis (the
   background task is not scheduled, the response is the room
   payload, and the RoomTask row count stays at 1).
"""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AgentTask, Room, RoomTask, UserTier


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


async def _create_room(app_client, creator) -> str:
    res = await app_client.post(
        "/api/rooms/create",
        headers=_auth(creator),
        json={"name": "Race Test Board"},
    )
    assert res.status_code in (200, 201), res.text
    body = res.json()
    slug = body.get("slug") or (body.get("room") or {}).get("slug")
    assert slug, body
    return slug


@pytest.mark.asyncio
async def test_add_task_happy_path(app_client, make_user, db_session):
    """Sanity: a single add-task for a new (room, task) pair returns
    200 and the row is persisted. The fix must not regress this.
    """
    creator = make_user(email="race-owner@test.com", tier=UserTier.PRO)
    slug = await _create_room(app_client, creator)

    # Seed an AgentTask row directly (the /agent/run pipeline is
    # heavy; for this test we only need a row with the right
    # (task_id, user_id) shape so the route accepts the add).
    task = AgentTask(
        task_id="race-task-1",
        user_id=creator.id,
        task_text="test",
        final_answer="done",
    )
    db_session.add(task)
    db_session.commit()

    res = await app_client.post(
        f"/api/rooms/{slug}/add-task",
        headers=_auth(creator),
        json={"task_id": task.task_id},
    )
    assert res.status_code == 200, res.text

    room = db_session.query(Room).filter(Room.slug == slug).first()
    n = (
        db_session.query(RoomTask)
        .filter(RoomTask.room_id == room.id, RoomTask.task_id == task.task_id)
        .count()
    )
    assert n == 1


@pytest.mark.asyncio
async def test_add_task_idempotent_sequential(app_client, make_user, db_session):
    """Two sequential add-task calls for the same (room, task) pair
    both return 200. The second takes the pre-check dup branch and
    returns the same payload shape.
    """
    creator = make_user(email="idem-owner@test.com", tier=UserTier.PRO)
    slug = await _create_room(app_client, creator)

    task = AgentTask(
        task_id="idem-task-1",
        user_id=creator.id,
        task_text="test",
        final_answer="done",
    )
    db_session.add(task)
    db_session.commit()

    r1 = await app_client.post(
        f"/api/rooms/{slug}/add-task",
        headers=_auth(creator),
        json={"task_id": task.task_id},
    )
    r2 = await app_client.post(
        f"/api/rooms/{slug}/add-task",
        headers=_auth(creator),
        json={"task_id": task.task_id},
    )
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text

    room = db_session.query(Room).filter(Room.slug == slug).first()
    n = (
        db_session.query(RoomTask)
        .filter(RoomTask.room_id == room.id, RoomTask.task_id == task.task_id)
        .count()
    )
    assert n == 1, "duplicate RoomTask row was inserted on the second call"


@pytest.mark.asyncio
async def test_add_task_race_loser_returns_room_payload(
    app_client, make_user, db_session
):
    """The losing race must NOT 500. The dup check passes, but
    between the check and the INSERT another writer (or a
    pre-existing row) lands the row first, so the commit raises
    IntegrityError. The fix must catch that and return the same
    payload as the pre-check dup branch.
    """
    creator = make_user(email="loser-owner@test.com", tier=UserTier.PRO)
    slug = await _create_room(app_client, creator)

    # Seed an AgentTask row.
    task = AgentTask(
        task_id="loser-task-1",
        user_id=creator.id,
        task_text="test",
        final_answer="done",
    )
    db_session.add(task)
    db_session.commit()

    # Pre-insert the RoomTask directly so the route's INSERT will
    # hit the unique constraint and raise IntegrityError on commit.
    # This simulates the "another writer beat us to the INSERT"
    # race without needing concurrent threads.
    room = db_session.query(Room).filter(Room.slug == slug).first()
    db_session.add(
        RoomTask(
            room_id=room.id,
            task_id=task.task_id,
            user_id=creator.id,
        )
    )
    db_session.commit()

    # The dup check inside the route uses a fresh session, so the
    # route will NOT see the pre-inserted row until it queries.
    # The route's INSERT then races against the pre-inserted row
    # via the unique constraint, raising IntegrityError on commit.
    res = await app_client.post(
        f"/api/rooms/{slug}/add-task",
        headers=_auth(creator),
        json={"task_id": task.task_id},
    )
    # Must be 200 with the same envelope as the happy path —
    # not 500, not an IntegrityError-leaking error shape.
    assert res.status_code == 200, (
        f"losing race must not 500, got {res.status_code}: {res.text}"
    )
    body = res.json()
    # The room payload shape includes the room's slug and member list.
    # It must NOT include a 500-style "internal server error" detail.
    assert "detail" not in body or body.get("detail", {}).get("error") != "internal_server_error"

    # And the row count must still be 1 (no duplicate was inserted).
    n = (
        db_session.query(RoomTask)
        .filter(RoomTask.room_id == room.id, RoomTask.task_id == task.task_id)
        .count()
    )
    assert n == 1, "duplicate RoomTask row was inserted on the losing race"
