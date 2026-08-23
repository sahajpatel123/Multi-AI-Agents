"""Integration tests for POST /api/rooms/{slug}/leave.

Leaving a room removes only the caller's membership. The room, its
tasks, and its synthesis stay intact, and the creator may leave without
deactivating the room. Non-members and unknown/inactive rooms share one
404 shape so the endpoint cannot probe room existence.
"""

from __future__ import annotations

import uuid

import pytest

from arena.db_models import AgentTask, Room, RoomMember, RoomTask, UserTier


def _seed_room(db, *, slug: str, creator_id: int, name: str = "Room", is_active: bool = True):
    room = Room(
        slug=slug,
        name=name,
        creator_id=creator_id,
        is_active=is_active,
        synthesis=None,
    )
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


def _seed_member(db, *, room_id: str, user_id: int) -> RoomMember:
    member = RoomMember(room_id=room_id, user_id=user_id)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def _leave_url(slug: str) -> str:
    return f"/api/rooms/{slug}/leave"


@pytest.mark.asyncio
async def test_leave_requires_auth(app_client):
    res = await app_client.post(_leave_url("anything"))
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_member_leaves_and_membership_is_removed(app_client, make_user, db_session):
    owner = make_user(email="leave-owner@test.com", tier=UserTier.PRO)
    member = make_user(email="leave-member@test.com", tier=UserTier.PRO)
    room = _seed_room(db_session, slug=f"leave-{uuid.uuid4()}", creator_id=owner.id)
    _seed_member(db_session, room_id=room.id, user_id=owner.id)
    _seed_member(db_session, room_id=room.id, user_id=member.id)

    res = await app_client.post(_leave_url(room.slug), headers=_pro_headers(member))
    assert res.status_code == 200
    body = res.json()
    assert body == {"status": "left", "slug": room.slug}

    remaining = (
        db_session.query(RoomMember)
        .filter(RoomMember.room_id == room.id)
        .all()
    )
    assert [rm.user_id for rm in remaining] == [owner.id]


@pytest.mark.asyncio
async def test_creator_can_leave_room_stays_active(app_client, make_user, db_session):
    owner = make_user(email="leave-creator@test.com", tier=UserTier.PRO)
    other = make_user(email="leave-creator-other@test.com", tier=UserTier.PRO)
    room = _seed_room(db_session, slug=f"creator-{uuid.uuid4()}", creator_id=owner.id)
    _seed_member(db_session, room_id=room.id, user_id=owner.id)
    _seed_member(db_session, room_id=room.id, user_id=other.id)

    res = await app_client.post(_leave_url(room.slug), headers=_pro_headers(owner))
    assert res.status_code == 200

    still_there = (
        db_session.query(Room)
        .filter(Room.slug == room.slug, Room.is_active.is_(True))
        .first()
    )
    assert still_there is not None
    members = (
        db_session.query(RoomMember)
        .filter(RoomMember.room_id == room.id)
        .all()
    )
    assert [rm.user_id for rm in members] == [other.id]


@pytest.mark.asyncio
async def test_leave_keeps_shared_tasks(app_client, make_user, db_session):
    owner = make_user(email="leave-tasks-owner@test.com", tier=UserTier.PRO)
    member = make_user(email="leave-tasks-member@test.com", tier=UserTier.PRO)
    room = _seed_room(db_session, slug=f"tasks-{uuid.uuid4()}", creator_id=owner.id)
    _seed_member(db_session, room_id=room.id, user_id=owner.id)
    _seed_member(db_session, room_id=room.id, user_id=member.id)

    task = AgentTask(
        user_id=member.id,
        task_id=f"t-{uuid.uuid4()}",
        title="Shared research",
        task_text="Will this stay after I leave?",
        final_answer="Yes — the board is shared.",
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)
    db_session.add(RoomTask(room_id=room.id, task_id=task.task_id, user_id=member.id))
    db_session.commit()

    res = await app_client.post(_leave_url(room.slug), headers=_pro_headers(member))
    assert res.status_code == 200

    room_tasks = (
        db_session.query(RoomTask)
        .filter(RoomTask.room_id == room.id)
        .all()
    )
    assert [rt.task_id for rt in room_tasks] == [task.task_id]


@pytest.mark.asyncio
async def test_non_member_gets_404(app_client, make_user, db_session):
    owner = make_user(email="leave-nm-owner@test.com", tier=UserTier.PRO)
    stranger = make_user(email="leave-nm-stranger@test.com", tier=UserTier.PRO)
    room = _seed_room(db_session, slug=f"nm-{uuid.uuid4()}", creator_id=owner.id)
    _seed_member(db_session, room_id=room.id, user_id=owner.id)

    res = await app_client.post(_leave_url(room.slug), headers=_pro_headers(stranger))
    assert res.status_code == 404
    assert res.json()["detail"]["error"] == "not_found"


@pytest.mark.asyncio
async def test_missing_and_inactive_rooms_404(app_client, make_user, db_session):
    user = make_user(email="leave-missing@test.com", tier=UserTier.PRO)
    inactive = _seed_room(
        db_session,
        slug=f"dead-{uuid.uuid4()}",
        creator_id=user.id,
        is_active=False,
    )
    _seed_member(db_session, room_id=inactive.id, user_id=user.id)

    missing = await app_client.post(_leave_url("never-existed"), headers=_pro_headers(user))
    dead = await app_client.post(_leave_url(inactive.slug), headers=_pro_headers(user))
    assert missing.status_code == 404
    assert dead.status_code == 404
    assert missing.json()["detail"]["message"] == dead.json()["detail"]["message"]


@pytest.mark.asyncio
async def test_rejoin_after_leave_restores_membership(app_client, make_user, db_session):
    owner = make_user(email="leave-rejoin-owner@test.com", tier=UserTier.PRO)
    member = make_user(email="leave-rejoin-member@test.com", tier=UserTier.PRO)
    room = _seed_room(db_session, slug=f"rejoin-{uuid.uuid4()}", creator_id=owner.id)
    _seed_member(db_session, room_id=room.id, user_id=owner.id)
    _seed_member(db_session, room_id=room.id, user_id=member.id)

    leave = await app_client.post(_leave_url(room.slug), headers=_pro_headers(member))
    assert leave.status_code == 200

    join = await app_client.post(
        f"/api/rooms/{room.slug}/join", headers=_pro_headers(member)
    )
    assert join.status_code == 200
    user_ids = {m["user_id"] for m in join.json()["members"]}
    assert member.id in user_ids


@pytest.mark.asyncio
async def test_leave_is_rate_limited(app_client, make_user, db_session):
    """Leave uses its own budget so it cannot starve join/delete calls."""
    owner = make_user(email="leave-rl-owner@test.com", tier=UserTier.PRO)
    member = make_user(email="leave-rl-member@test.com", tier=UserTier.PRO)
    room = _seed_room(db_session, slug=f"rl-{uuid.uuid4()}", creator_id=owner.id)
    _seed_member(db_session, room_id=room.id, user_id=owner.id)
    _seed_member(db_session, room_id=room.id, user_id=member.id)

    statuses = []
    for _ in range(30):
        res = await app_client.post(_leave_url(room.slug), headers=_pro_headers(member))
        statuses.append(res.status_code)
        if res.status_code == 200:
            _seed_member(db_session, room_id=room.id, user_id=member.id)

    assert statuses.count(200) == 30
    blocked = await app_client.post(_leave_url(room.slug), headers=_pro_headers(member))
    assert blocked.status_code == 429
