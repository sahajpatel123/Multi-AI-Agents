"""GET /api/rooms/{slug} must not auto-join authenticated viewers.

Membership is an intentional action (POST /join). Auto-join on every GET
let any logged-in user (or bot looping slugs) fill rooms to capacity
without consent and without calling the join endpoint.
"""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import RoomMember, UserTier


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _slug_from_create(body: dict) -> str:
    return body.get("slug") or (body.get("room") or {}).get("slug") or ""


@pytest.mark.asyncio
async def test_get_room_does_not_auto_join_viewer(
    app_client, make_user, isolated_db
):
    creator = make_user(email="room-owner@test.com", tier=UserTier.PRO)
    viewer = make_user(email="room-viewer@test.com", tier=UserTier.PRO)

    created = await app_client.post(
        "/api/rooms/create",
        headers=_auth(creator),
        json={"name": "No Auto Join"},
    )
    assert created.status_code in (200, 201), created.text
    slug = _slug_from_create(created.json())
    assert slug

    # Authenticated GET must not enroll the viewer.
    res = await app_client.get(f"/api/rooms/{slug}", headers=_auth(viewer))
    assert res.status_code == 200, res.text
    members = res.json().get("members") or []
    member_ids = {m.get("user_id") for m in members}
    assert viewer.id not in member_ids, (
        "GET /rooms/{slug} auto-joined the viewer — membership must require POST /join"
    )
    assert creator.id in member_ids

    # DB-level confirmation (not just payload).
    SessionLocal = isolated_db
    s = SessionLocal()
    try:
        row = (
            s.query(RoomMember)
            .filter(RoomMember.user_id == viewer.id)
            .first()
        )
        assert row is None
    finally:
        s.close()


@pytest.mark.asyncio
async def test_explicit_join_adds_member(app_client, make_user, isolated_db):
    creator = make_user(email="join-owner2@test.com", tier=UserTier.PRO)
    joiner = make_user(email="join-me@test.com", tier=UserTier.PRO)
    created = await app_client.post(
        "/api/rooms/create",
        headers=_auth(creator),
        json={"name": "Explicit Join"},
    )
    assert created.status_code in (200, 201), created.text
    slug = _slug_from_create(created.json())
    assert slug

    joined = await app_client.post(
        f"/api/rooms/{slug}/join",
        headers=_auth(joiner),
    )
    assert joined.status_code == 200, joined.text
    members = joined.json().get("members") or []
    assert joiner.id in {m.get("user_id") for m in members}

    # Subsequent GET still works and does not double-join.
    again = await app_client.get(f"/api/rooms/{slug}", headers=_auth(joiner))
    assert again.status_code == 200
    ids = [m.get("user_id") for m in (again.json().get("members") or [])]
    assert ids.count(joiner.id) == 1


@pytest.mark.asyncio
async def test_get_room_updates_last_seen_for_existing_member_only(
    app_client, make_user, isolated_db
):
    creator = make_user(email="seen-owner@test.com", tier=UserTier.PRO)
    created = await app_client.post(
        "/api/rooms/create",
        headers=_auth(creator),
        json={"name": "Presence Room"},
    )
    slug = _slug_from_create(created.json())
    assert slug

    SessionLocal = isolated_db
    s = SessionLocal()
    try:
        before = (
            s.query(RoomMember)
            .filter(RoomMember.user_id == creator.id)
            .first()
        )
        assert before is not None
        before_ts = before.last_seen_at
    finally:
        s.close()

    # Heartbeat via GET for existing member.
    res = await app_client.get(f"/api/rooms/{slug}", headers=_auth(creator))
    assert res.status_code == 200

    s = SessionLocal()
    try:
        after = (
            s.query(RoomMember)
            .filter(RoomMember.user_id == creator.id)
            .first()
        )
        assert after is not None
        assert after.last_seen_at is not None
        # last_seen should be at least as recent as before
        if before_ts is not None:
            assert after.last_seen_at >= before_ts
    finally:
        s.close()
