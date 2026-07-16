"""Room member payloads must not leak email addresses.

GET /api/rooms/{slug} is reachable with only the slug (shareable link
model), including unauthenticated callers. Emitting member emails on
that payload would let anyone with the link scrape every collaborator's
address.
"""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


@pytest.mark.asyncio
async def test_get_room_members_have_no_email_field(
    app_client, make_user, isolated_db
):
    creator = make_user(email="room-creator@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/rooms/create",
        headers=_auth(creator),
        json={"name": "Privacy Board"},
    )
    assert res.status_code in (200, 201), res.text
    body = res.json()
    slug = body.get("slug") or (body.get("room") or {}).get("slug")
    assert slug, body

    # Unauthenticated GET — shareable link surface.
    public = await app_client.get(f"/api/rooms/{slug}")
    assert public.status_code == 200, public.text
    payload = public.json()
    members = payload.get("members") or []
    assert members, "expected at least the creator on the room"
    for m in members:
        assert "email" not in m, f"member payload leaked email: {m}"
        assert m.get("name"), m
        assert m.get("user_id") is not None


@pytest.mark.asyncio
async def test_join_members_list_has_no_email(
    app_client, make_user, isolated_db
):
    creator = make_user(email="join-owner@test.com", tier=UserTier.PRO)
    joiner = make_user(email="join-guest@test.com", tier=UserTier.PRO)
    created = await app_client.post(
        "/api/rooms/create",
        headers=_auth(creator),
        json={"name": "Join Board"},
    )
    assert created.status_code in (200, 201), created.text
    slug = created.json().get("slug") or (created.json().get("room") or {}).get("slug")
    assert slug

    joined = await app_client.post(
        f"/api/rooms/{slug}/join",
        headers=_auth(joiner),
    )
    assert joined.status_code == 200, joined.text
    members = joined.json().get("members") or []
    assert len(members) >= 2
    for m in members:
        assert "email" not in m, f"join response leaked email: {m}"
