"""Integration tests for /api/rooms my-rooms pagination, discover, and members."""

from __future__ import annotations

import uuid

import pytest

from arena.core.auth import create_access_token
from arena.db_models import Room, RoomMember, User, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_room(db, *, slug: str, creator_id: int, name: str = "Room", is_active: bool = True):
    return Room(
        slug=slug,
        name=name,
        creator_id=creator_id,
        is_active=is_active,
        synthesis=None,
    )


def _seed_member(db, *, room_id: int, user_id: int, role: str = "member"):
    return RoomMember(
        room_id=room_id,
        user_id=user_id,
    )


# ─── /my-rooms pagination ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_my_rooms_returns_envelope(app_client, make_user, db_session):
    user = make_user(email="my-rooms-env@test.com", tier=UserTier.PRO)
    room = _seed_room(db_session, slug=f"r-{uuid.uuid4()}", creator_id=user.id)
    db_session.add(room)
    db_session.commit()
    db_session.refresh(room)
    db_session.add(_seed_member(db_session, room_id=room.id, user_id=user.id))
    db_session.commit()

    res = await app_client.get("/api/rooms/my-rooms", headers=_pro_headers(user))
    body = res.json()
    assert "rooms" in body
    assert "total" in body
    assert "page" in body
    assert body["total"] == 1


@pytest.mark.asyncio
async def test_my_rooms_pagination(app_client, make_user, db_session):
    """Previously hard-capped at 5; now paginated so a user with 50+
    rooms can browse them all."""
    user = make_user(email="my-rooms-page@test.com", tier=UserTier.PRO)
    for i in range(5):
        room = _seed_room(db_session, slug=f"r-{i}-{uuid.uuid4()}", creator_id=user.id)
        db_session.add(room)
        db_session.commit()
        db_session.refresh(room)
        db_session.add(_seed_member(db_session, room_id=room.id, user_id=user.id))
    db_session.commit()

    res = await app_client.get(
        "/api/rooms/my-rooms?per_page=2&page=2", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["total"] == 5
    assert body["total_pages"] == 3
    assert len(body["rooms"]) == 2


@pytest.mark.asyncio
async def test_my_rooms_excludes_inactive(app_client, make_user, db_session):
    user = make_user(email="my-rooms-inactive@test.com", tier=UserTier.PRO)
    active = _seed_room(db_session, slug=f"act-{uuid.uuid4()}", creator_id=user.id)
    inactive = _seed_room(db_session, slug=f"inact-{uuid.uuid4()}", creator_id=user.id, is_active=False)
    db_session.add_all([active, inactive])
    db_session.commit()
    for r in (active, inactive):
        db_session.refresh(r)
    db_session.add(_seed_member(db_session, room_id=active.id, user_id=user.id))
    db_session.add(_seed_member(db_session, room_id=inactive.id, user_id=user.id))
    db_session.commit()

    res = await app_client.get("/api/rooms/my-rooms", headers=_pro_headers(user))
    body = res.json()
    slugs = [r["slug"] for r in body["rooms"]]
    assert active.slug in slugs
    assert inactive.slug not in slugs


# ─── /discover ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_discover_returns_envelope(app_client, make_user, db_session):
    user = make_user(email="discover-env@test.com", tier=UserTier.PRO)
    room = _seed_room(db_session, slug=f"disc-{uuid.uuid4()}", creator_id=user.id)
    db_session.add(room)
    db_session.commit()
    res = await app_client.get("/api/rooms/discover", headers=_pro_headers(user))
    body = res.json()
    assert "rooms" in body
    assert "total" in body
    assert "filters" in body


@pytest.mark.asyncio
async def test_discover_excludes_already_joined(app_client, make_user, db_session):
    """Discover must surface only rooms the caller hasn't joined yet —
    otherwise it duplicates the 'my-rooms' list."""
    user = make_user(email="discover-excl@test.com", tier=UserTier.PRO)
    other = make_user(email="discover-other@test.com", tier=UserTier.PRO)

    # Caller's own room.
    mine = _seed_room(db_session, slug=f"mine-{uuid.uuid4()}", creator_id=user.id)
    # Room the caller is a member of but didn't create.
    joined = _seed_room(db_session, slug=f"joined-{uuid.uuid4()}", creator_id=other.id)
    # Room the caller has never seen.
    new = _seed_room(db_session, slug=f"new-{uuid.uuid4()}", creator_id=other.id)

    db_session.add_all([mine, joined, new])
    db_session.commit()
    for r in (mine, joined, new):
        db_session.refresh(r)
    db_session.add_all([
        _seed_member(db_session, room_id=mine.id, user_id=user.id),
        _seed_member(db_session, room_id=joined.id, user_id=user.id),
    ])
    db_session.commit()

    res = await app_client.get("/api/rooms/discover", headers=_pro_headers(user))
    body = res.json()
    slugs = {r["slug"] for r in body["rooms"]}
    assert slugs == {new.slug}


@pytest.mark.asyncio
async def test_discover_search_matches_name_or_slug(app_client, make_user, db_session):
    user = make_user(email="discover-search@test.com", tier=UserTier.PRO)
    other = make_user(email="discover-search-other@test.com", tier=UserTier.PRO)
    db_session.add(_seed_room(db_session, slug=f"alpha-{uuid.uuid4()}",
                              creator_id=other.id, name="Quantum Physics Lab"))
    db_session.add(_seed_room(db_session, slug=f"budget-{uuid.uuid4()}",
                              creator_id=other.id, name="Budget Memo"))
    db_session.commit()

    res = await app_client.get(
        "/api/rooms/discover?search=quantum", headers=_pro_headers(user)
    )
    body = res.json()
    names = [r["name"] for r in body["rooms"]]
    assert "Quantum Physics Lab" in names


@pytest.mark.asyncio
async def test_discover_search_escapes_wildcards(app_client, make_user, db_session):
    """100% must NOT match every room — wildcards are escaped."""
    user = make_user(email="discover-wild@test.com", tier=UserTier.PRO)
    other = make_user(email="discover-wild-other@test.com", tier=UserTier.PRO)
    db_session.add(_seed_room(db_session, slug=f"effort-{uuid.uuid4()}",
                              creator_id=other.id, name="100% effort sprint"))
    db_session.add(_seed_room(db_session, slug=f"pct-{uuid.uuid4()}",
                              creator_id=other.id, name="fifty percent"))
    db_session.commit()

    res = await app_client.get(
        "/api/rooms/discover?search=100%25", headers=_pro_headers(user)
    )
    body = res.json()
    names = [r["name"] for r in body["rooms"]]
    assert "100% effort sprint" in names
    assert "fifty percent" not in names


@pytest.mark.asyncio
async def test_discover_pagination(app_client, make_user, db_session):
    user = make_user(email="discover-page@test.com", tier=UserTier.PRO)
    other = make_user(email="discover-page-other@test.com", tier=UserTier.PRO)
    for i in range(5):
        db_session.add(_seed_room(db_session, slug=f"d-{i}-{uuid.uuid4()}",
                                  creator_id=other.id))
    db_session.commit()

    res = await app_client.get(
        "/api/rooms/discover?per_page=2&page=2", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["total"] == 5
    assert body["total_pages"] == 3


# ─── /{slug}/members ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_members_lists_room_members(app_client, make_user, db_session):
    owner = make_user(email="members-owner@test.com", tier=UserTier.PRO)
    member = make_user(email="members-other@test.com", tier=UserTier.PRO)
    room = _seed_room(db_session, slug=f"m-{uuid.uuid4()}", creator_id=owner.id)
    db_session.add(room)
    db_session.commit()
    db_session.refresh(room)
    db_session.add(_seed_member(db_session, room_id=room.id, user_id=owner.id))
    db_session.add(_seed_member(db_session, room_id=room.id, user_id=member.id))
    db_session.commit()

    res = await app_client.get(
        f"/api/rooms/{room.slug}/members", headers=_pro_headers(owner)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 2
    user_ids = {m["user_id"] for m in body["members"]}
    assert user_ids == {owner.id, member.id}
    # Creator marked as creator.
    creator_rows = [m for m in body["members"] if m["is_creator"]]
    assert len(creator_rows) == 1
    assert creator_rows[0]["user_id"] == owner.id


@pytest.mark.asyncio
async def test_members_404_for_non_member(app_client, make_user, db_session):
    """Non-members must look like not-found (no existence oracle)."""
    owner = make_user(email="members-priv-owner@test.com", tier=UserTier.PRO)
    intruder = make_user(email="members-priv-intruder@test.com", tier=UserTier.PRO)
    room = _seed_room(db_session, slug=f"private-{uuid.uuid4()}", creator_id=owner.id)
    db_session.add(room)
    db_session.commit()
    db_session.refresh(room)
    db_session.add(_seed_member(db_session, room_id=room.id, user_id=owner.id))
    db_session.commit()

    res = await app_client.get(
        f"/api/rooms/{room.slug}/members", headers=_pro_headers(intruder)
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_members_404_for_missing_room(app_client, make_user):
    user = make_user(email="members-miss@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/rooms/does-not-exist/members", headers=_pro_headers(user)
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_members_404_for_inactive_room(app_client, make_user, db_session):
    user = make_user(email="members-inactive@test.com", tier=UserTier.PRO)
    room = _seed_room(db_session, slug=f"dead-{uuid.uuid4()}",
                      creator_id=user.id, is_active=False)
    db_session.add(room)
    db_session.commit()
    db_session.refresh(room)
    db_session.add(_seed_member(db_session, room_id=room.id, user_id=user.id))
    db_session.commit()

    res = await app_client.get(
        f"/api/rooms/{room.slug}/members", headers=_pro_headers(user)
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_members_omits_email(app_client, make_user, db_session):
    """Members endpoint must NOT include email — PII surface is intentional
    so a UI can't accidentally display or scrape contact info."""
    owner = make_user(email="members-no-pii-owner@test.com", tier=UserTier.PRO)
    room = _seed_room(db_session, slug=f"no-pii-{uuid.uuid4()}", creator_id=owner.id)
    db_session.add(room)
    db_session.commit()
    db_session.refresh(room)
    db_session.add(_seed_member(db_session, room_id=room.id, user_id=owner.id, role="owner"))
    db_session.commit()

    res = await app_client.get(
        f"/api/rooms/{room.slug}/members", headers=_pro_headers(owner)
    )
    body = res.json()
    for member in body["members"]:
        assert "email" not in member


# ─── Auth ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_room_endpoints_require_auth(app_client):
    for path in [
        "/api/rooms/my-rooms",
        "/api/rooms/discover",
        "/api/rooms/anything/members",
    ]:
        res = await app_client.get(path)
        assert res.status_code == 401, f"{path} returned {res.status_code}"