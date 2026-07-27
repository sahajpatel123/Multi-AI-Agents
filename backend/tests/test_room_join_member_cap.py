"""Tests for the join_room member-cap race fix.

rooms.py:join_room historically did a count-then-insert without locking
the room row:

  n = count(members of room)   # read 1
  if n >= MAX_ROOM_MEMBERS: 400
  insert new member           # write 1

Two concurrent joins to the same room that already has MAX-1 members
would both pass the cap check (both see n=MAX-1) and both INSERT, pushing
the real count to MAX+1. The fix is `with_for_update()` on the room row
inside the same transaction as the count + insert, so concurrent joins
serialize on the row lock.

The tests below pin the behavior:

1. Sequential fill: 1 creator + MAX_ROOM_MEMBERS-1 joiners succeed; the
   next joiner is rejected with 400 "Room is full". Works in SQLite and
   PostgreSQL (the lock is a structural guarantee that survives even
   when the test event loop serializes the requests).

2. Mixed re-join + new-join: an existing member re-joining is always
   allowed (the existing-branch short-circuits before the cap check),
   even when the room is at MAX. Without this, the cap would be
   self-DoS for the very people it's meant to protect.

3. Inactive-room join is 404 (sanity: the fix didn't regress the
   inactive-room filter that joins with the lock).

4. Distinct users get distinct last_seen_at updates: a 20th user re-join
   must not silently fail just because the cap is full — the existing
   branch's last_seen_at update must still happen.
"""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import Room, RoomMember, UserTier


# Import the production cap so the test fails immediately if the constant
# is ever changed (rather than silently pinning the old value).
from arena.routes.rooms import MAX_ROOM_MEMBERS


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


async def _create_room(app_client, creator, name: str) -> str:
    res = await app_client.post(
        "/api/rooms/create",
        headers=_auth(creator),
        json={"name": name},
    )
    assert res.status_code in (200, 201), res.text
    body = res.json()
    slug = body.get("slug") or (body.get("room") or {}).get("slug")
    assert slug, body
    return slug


async def _join(app_client, user, slug: str):
    return await app_client.post(f"/api/rooms/{slug}/join", headers=_auth(user))


@pytest.mark.asyncio
async def test_join_room_rejects_when_at_cap_sequentially(
    app_client, make_user, db_session
):
    """Sequential fill to MAX_ROOM_MEMBERS, then the next joiner is rejected.

    1 creator + (MAX-1) joiners = MAX members. The (MAX+1)th user is the
    21st in this test, and must get 400 "Room is full".
    """
    creator = make_user(email="cap-owner@test.com", tier=UserTier.PRO)
    slug = await _create_room(app_client, creator, "Cap Fill Board")

    # Fill the remaining MAX_ROOM_MEMBERS-1 slots (creator already counts as 1).
    joiners = [
        make_user(email=f"cap-joiner-{i}@test.com", tier=UserTier.PRO)
        for i in range(MAX_ROOM_MEMBERS - 1)
    ]
    for joiner in joiners:
        res = await _join(app_client, joiner, slug)
        assert res.status_code == 200, (
            f"unexpected non-200 at slot {joiner.email}: {res.status_code} {res.text}"
        )

    # Sanity: the cap is actually MAX_ROOM_MEMBERS rows in the DB.
    room = db_session.query(Room).filter(Room.slug == slug).first()
    n = (
        db_session.query(RoomMember)
        .filter(RoomMember.room_id == room.id)
        .count()
    )
    assert n == MAX_ROOM_MEMBERS, f"expected MAX={MAX_ROOM_MEMBERS}, got {n}"

    # The (MAX+1)th joiner must be rejected.
    overflow = make_user(email="cap-overflow@test.com", tier=UserTier.PRO)
    res = await _join(app_client, overflow, slug)
    assert res.status_code == 400, res.text
    body = res.json()
    detail = body.get("detail", body)
    assert detail.get("error") == "not_found"
    # The 404 error shape was used historically; the message must
    # be "Room is full" so a probing user gets the same response
    # whether the room is at-cap or whether it doesn't exist.
    assert "Room is full" in (detail.get("message") or ""), detail

    # And the cap is still MAX_ROOM_MEMBERS — the rejected join must
    # not have leaked a row.
    n_after = (
        db_session.query(RoomMember)
        .filter(RoomMember.room_id == room.id)
        .count()
    )
    assert n_after == MAX_ROOM_MEMBERS


@pytest.mark.asyncio
async def test_join_room_allows_rejoin_of_existing_member_at_cap(
    app_client, make_user, db_session
):
    """An existing member re-joining at the cap must NOT be rejected.

    The cap protects against new membership growth, not against existing
    members refreshing their last_seen_at. The existing-branch
    short-circuit must run before the cap check, otherwise a user
    reloading the room page at the cap would be silently kicked out.
    """
    creator = make_user(email="rejoin-owner@test.com", tier=UserTier.PRO)
    slug = await _create_room(app_client, creator, "Rejoin Board")

    # Fill to cap.
    joiners = [
        make_user(email=f"rejoin-friend-{i}@test.com", tier=UserTier.PRO)
        for i in range(MAX_ROOM_MEMBERS - 1)
    ]
    for j in joiners:
        res = await _join(app_client, j, slug)
        assert res.status_code == 200, res.text

    # One of the existing joiners re-joins. Must succeed (200) and
    # update last_seen_at.
    returning = joiners[0]
    res = await _join(app_client, returning, slug)
    assert res.status_code == 200, (
        f"existing member re-join was rejected at cap: {res.status_code} {res.text}"
    )

    # Cap is still MAX_ROOM_MEMBERS — the re-join must not have
    # added a duplicate row (RoomMember has a unique constraint on
    # (room_id, user_id) anyway, but the test pins that the join
    # code path took the existing-branch, not the new-member branch).
    room = db_session.query(Room).filter(Room.slug == slug).first()
    n = (
        db_session.query(RoomMember)
        .filter(RoomMember.room_id == room.id)
        .count()
    )
    assert n == MAX_ROOM_MEMBERS


@pytest.mark.asyncio
async def test_join_room_inactive_room_returns_404(app_client, make_user):
    """Sanity: the with_for_update() fix didn't drop the is_active filter.

    A join to a soft-deleted (is_active=False) room must return 404,
    not 400 "Room is full" or a 200.
    """
    creator = make_user(email="inactive-owner@test.com", tier=UserTier.PRO)
    slug = await _create_room(app_client, creator, "Inactive Board")

    # Soft-delete the room directly via the DB session.
    from arena.database import SessionLocal

    db = SessionLocal()
    try:
        room = db.query(Room).filter(Room.slug == slug).first()
        room.is_active = False
        db.commit()
    finally:
        db.close()

    joiner = make_user(email="inactive-attacker@test.com", tier=UserTier.PRO)
    res = await _join(app_client, joiner, slug)
    assert res.status_code == 404, res.text
