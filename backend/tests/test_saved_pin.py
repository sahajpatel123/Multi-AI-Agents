"""Integration tests for pinning saved takes via PATCH /api/saved/{id}."""

from __future__ import annotations

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import SavedResponse, UserTier
from arena.routes.saved import SAVED_PIN_MAX


def _seed(
    db,
    *,
    user_id: int,
    prompt: str,
    agent_id: str = "agent-A",
    pinned_at=None,
):
    return SavedResponse(
        user_id=user_id,
        session_id="sess-pin",
        agent_id=agent_id,
        persona_id="analyst",
        persona_name="Analyst",
        persona_color="#fff",
        prompt=prompt,
        one_liner=prompt[:80],
        verdict="verdict body",
        score=80,
        confidence=70,
        pinned_at=pinned_at,
    )


@pytest.mark.asyncio
async def test_get_returns_pinned_fields(app_client, make_user, db_session):
    user = make_user(email="pin-fields@test.com", tier=UserTier.PLUS)
    row = _seed(db_session, user_id=user.id, prompt="a")
    db_session.add(row)
    db_session.commit()

    res = await app_client.get("/api/saved", headers=_pro_headers(user))
    assert res.status_code == 200
    item = res.json()["items"][0]
    assert item["pinned"] is False
    assert item["pinned_at"] is None


@pytest.mark.asyncio
async def test_pin_and_unpin(app_client, make_user, db_session):
    user = make_user(email="pin-toggle@test.com", tier=UserTier.PLUS)
    row = _seed(db_session, user_id=user.id, prompt="pin me")
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)

    res = await app_client.patch(
        f"/api/saved/{row.id}",
        json={"pinned": True},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["pinned"] is True
    assert body["pinned_at"] is not None

    res = await app_client.get("/api/saved", headers=_pro_headers(user))
    assert res.json()["items"][0]["pinned"] is True

    res = await app_client.patch(
        f"/api/saved/{row.id}",
        json={"pinned": False},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.json()["pinned"] is False

    res = await app_client.get("/api/saved", headers=_pro_headers(user))
    assert res.json()["items"][0]["pinned"] is False


@pytest.mark.asyncio
async def test_pinned_sort_puts_pinned_first(app_client, make_user, db_session):
    user = make_user(email="pin-sort@test.com", tier=UserTier.PLUS)
    old = _seed(db_session, user_id=user.id, prompt="old", agent_id="agent-A")
    new = _seed(db_session, user_id=user.id, prompt="new", agent_id="agent-B")
    pinned = _seed(
        db_session,
        user_id=user.id,
        prompt="pinned",
        agent_id="agent-C",
        pinned_at=utcnow_naive(),
    )
    db_session.add_all([old, new, pinned])
    db_session.commit()

    res = await app_client.get("/api/saved?sort=pinned", headers=_pro_headers(user))
    assert res.status_code == 200
    prompts = [item["prompt"] for item in res.json()["items"]]
    assert prompts[0] == "pinned"
    assert set(prompts) == {"old", "new", "pinned"}


@pytest.mark.asyncio
async def test_pin_foreign_row_is_404(app_client, make_user, db_session):
    owner = make_user(email="pin-owner@test.com", tier=UserTier.PLUS)
    attacker = make_user(email="pin-attacker@test.com", tier=UserTier.PLUS)
    row = _seed(db_session, user_id=owner.id, prompt="secret")
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)

    res = await app_client.patch(
        f"/api/saved/{row.id}",
        json={"pinned": True},
        headers=_pro_headers(attacker),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_pin_requires_plus(app_client, make_user, db_session):
    user = make_user(email="pin-free@test.com", tier=UserTier.FREE)
    row = _seed(db_session, user_id=user.id, prompt="free")
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)

    res = await app_client.patch(
        f"/api/saved/{row.id}",
        json={"pinned": True},
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_pin_rejects_invalid_body(app_client, make_user):
    user = make_user(email="pin-invalid@test.com", tier=UserTier.PLUS)
    res = await app_client.patch(
        "/api/saved/1",
        json={"foo": "bar"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_pin_cap_enforced(app_client, make_user, db_session):
    user = make_user(email="pin-cap@test.com", tier=UserTier.PLUS)
    rows = [
        _seed(db_session, user_id=user.id, prompt=f"row-{i}", agent_id=f"agent-{i}")
        for i in range(SAVED_PIN_MAX)
    ]
    db_session.add_all(rows)
    db_session.commit()

    for row in rows:
        db_session.refresh(row)
        res = await app_client.patch(
            f"/api/saved/{row.id}",
            json={"pinned": True},
            headers=_pro_headers(user),
        )
        assert res.status_code == 200, res.text

    extra = _seed(db_session, user_id=user.id, prompt="extra", agent_id="agent-extra")
    db_session.add(extra)
    db_session.commit()
    db_session.refresh(extra)

    res = await app_client.patch(
        f"/api/saved/{extra.id}",
        json={"pinned": True},
        headers=_pro_headers(user),
    )
    assert res.status_code == 400
    assert res.json()["detail"]["error"] == "pin_limit_reached"
