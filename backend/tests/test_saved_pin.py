"""Integration tests for pinning saved takes via PATCH /api/saved/{id}."""

from __future__ import annotations

from datetime import timedelta

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
async def test_pinned_sort_orders_by_pinned_at_not_saved_at(app_client, make_user, db_session):
    user = make_user(email="pin-order@test.com", tier=UserTier.PLUS)
    pinned_later = _seed(
        db_session,
        user_id=user.id,
        prompt="pinned-later",
        agent_id="agent-A",
        pinned_at=utcnow_naive(),
    )
    pinned_earlier = _seed(
        db_session,
        user_id=user.id,
        prompt="pinned-earlier",
        agent_id="agent-B",
        pinned_at=utcnow_naive() - timedelta(days=1),
    )
    # Give the later-pinned row the older saved_at so the two orderings
    # conflict: pinned_at must win over saved_at.
    pinned_later.saved_at = utcnow_naive() - timedelta(days=7)
    pinned_earlier.saved_at = utcnow_naive()
    db_session.add_all([pinned_later, pinned_earlier])
    db_session.commit()

    res = await app_client.get("/api/saved?sort=pinned", headers=_pro_headers(user))
    assert res.status_code == 200
    prompts = [item["prompt"] for item in res.json()["items"]]
    assert prompts == ["pinned-later", "pinned-earlier"]


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


@pytest.mark.asyncio
async def test_bulk_pin_and_unpin(app_client, make_user, db_session):
    user = make_user(email="bulk-pin@test.com", tier=UserTier.PLUS)
    rows = [
        _seed(db_session, user_id=user.id, prompt=f"bulk-{i}", agent_id=f"agent-{i}")
        for i in range(3)
    ]
    db_session.add_all(rows)
    db_session.commit()
    for row in rows:
        db_session.refresh(row)
    ids = [row.id for row in rows]

    res = await app_client.patch(
        "/api/saved/bulk-pin",
        json={"ids": ids, "pinned": True},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["requested"] == 3
    assert body["applied"] == 3
    assert set(body["ids"]) == set(ids)
    assert body["pinned"] is True
    assert body["pin_limit_reached"] is False

    res = await app_client.get("/api/saved", headers=_pro_headers(user))
    assert all(item["pinned"] is True for item in res.json()["items"])

    res = await app_client.patch(
        "/api/saved/bulk-pin",
        json={"ids": ids, "pinned": False},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200, res.text
    assert res.json()["applied"] == 3

    res = await app_client.get("/api/saved", headers=_pro_headers(user))
    assert all(item["pinned"] is False for item in res.json()["items"])


@pytest.mark.asyncio
async def test_bulk_pin_ignores_foreign_and_duplicate_ids(app_client, make_user, db_session):
    owner = make_user(email="bulk-owner@test.com", tier=UserTier.PLUS)
    attacker = make_user(email="bulk-attacker@test.com", tier=UserTier.PLUS)
    owner_row = _seed(db_session, user_id=owner.id, prompt="mine", agent_id="agent-A")
    foreign_row = _seed(db_session, user_id=attacker.id, prompt="theirs", agent_id="agent-B")
    db_session.add_all([owner_row, foreign_row])
    db_session.commit()
    db_session.refresh(owner_row)
    db_session.refresh(foreign_row)

    res = await app_client.patch(
        "/api/saved/bulk-pin",
        json={"ids": [owner_row.id, owner_row.id, foreign_row.id], "pinned": True},
        headers=_pro_headers(owner),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["requested"] == 2
    assert body["applied"] == 1
    assert body["ids"] == [owner_row.id]


@pytest.mark.asyncio
async def test_bulk_pin_reports_limit_reached(app_client, make_user, db_session):
    user = make_user(email="bulk-cap@test.com", tier=UserTier.PLUS)
    already_pinned = [
        _seed(
            db_session,
            user_id=user.id,
            prompt=f"already-{i}",
            agent_id=f"agent-pinned-{i}",
            pinned_at=utcnow_naive(),
        )
        for i in range(SAVED_PIN_MAX - 1)
    ]
    rows = [
        _seed(db_session, user_id=user.id, prompt=f"row-{i}", agent_id=f"agent-{i}")
        for i in range(SAVED_PIN_MAX)
    ]
    db_session.add_all([*already_pinned, *rows])
    db_session.commit()
    for row in [*already_pinned, *rows]:
        db_session.refresh(row)

    # There is exactly one slot left (SAVED_PIN_MAX - 1 already pinned).
    res = await app_client.patch(
        "/api/saved/bulk-pin",
        json={"ids": [r.id for r in rows], "pinned": True},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["applied"] == 1
    assert body["pin_limit_reached"] is True


@pytest.mark.asyncio
async def test_bulk_pin_requires_plus_and_valid_body(app_client, make_user, db_session):
    user = make_user(email="bulk-free@test.com", tier=UserTier.FREE)
    row = _seed(db_session, user_id=user.id, prompt="free")
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)

    res = await app_client.patch(
        "/api/saved/bulk-pin",
        json={"ids": [row.id], "pinned": True},
        headers=_pro_headers(user),
    )
    assert res.status_code == 403

    plus = make_user(email="bulk-invalid@test.com", tier=UserTier.PLUS)
    res = await app_client.patch(
        "/api/saved/bulk-pin",
        json={"ids": [], "pinned": True},
        headers=_pro_headers(plus),
    )
    assert res.status_code == 422
