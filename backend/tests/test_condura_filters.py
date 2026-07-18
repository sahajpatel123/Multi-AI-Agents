"""Integration tests for /api/condura handoff + draft filters."""

from __future__ import annotations

import json

import pytest

from arena.db_models import HandoffDraft, HandoffEvent, HandoffRecord, UserTier



def _seed_handoff(
    db,
    *,
    user_id: int,
    capability: str = "delegate_task",
    status: str = "dispatched",
):
    return HandoffRecord(
        user_id=user_id,
        capability=capability,
        execution_env="web",
        status=status,
        condura_run_id="run-1",
        session_id="sess-1",
        summary="summary",
    )


def _seed_event(db, *, handoff_id: int, event_kind: str = "progress", payload: dict | None = None):
    return HandoffEvent(
        handoff_id=handoff_id,
        event_kind=event_kind,
        payload=payload or {"k": "v"},
    )


def _seed_draft(
    db,
    *,
    user_id: int,
    capability: str = "delegate_task",
    payload: dict | None = None,
):
    return HandoffDraft(
        user_id=user_id,
        capability=capability,
        payload_json=json.dumps(payload or {"step": 1}),
    )


# ─── /handoffs list ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_handoffs_returns_envelope(app_client, make_user, db_session):
    user = make_user(email="con-list@test.com", tier=UserTier.PRO)
    db_session.add(_seed_handoff(db_session, user_id=user.id))
    db_session.commit()

    res = await app_client.get("/api/condura/handoffs", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert "handoffs" in body
    assert body["total"] == 1
    assert "filters" in body


@pytest.mark.asyncio
async def test_handoffs_capability_filter(app_client, make_user, db_session):
    user = make_user(email="con-cap@test.com", tier=UserTier.PRO)
    db_session.add(_seed_handoff(db_session, user_id=user.id, capability="delegate_task"))
    db_session.add(_seed_handoff(db_session, user_id=user.id, capability="hybrid_delegate"))
    db_session.commit()

    res = await app_client.get(
        "/api/condura/handoffs?capability=delegate_task", headers=_pro_headers(user)
    )
    body = res.json()
    caps = {h["capability"] for h in body["handoffs"]}
    assert caps == {"delegate_task"}


@pytest.mark.asyncio
async def test_handoffs_status_filter(app_client, make_user, db_session):
    user = make_user(email="con-status@test.com", tier=UserTier.PRO)
    db_session.add(_seed_handoff(db_session, user_id=user.id, status="dispatched"))
    db_session.add(_seed_handoff(db_session, user_id=user.id, status="completed"))
    db_session.commit()

    res = await app_client.get(
        "/api/condura/handoffs?status=completed", headers=_pro_headers(user)
    )
    body = res.json()
    statuses = {h["status"] for h in body["handoffs"]}
    assert statuses == {"completed"}


@pytest.mark.asyncio
async def test_handoffs_pagination(app_client, make_user, db_session):
    user = make_user(email="con-page@test.com", tier=UserTier.PRO)
    for i in range(5):
        db_session.add(_seed_handoff(db_session, user_id=user.id))
    db_session.commit()

    res = await app_client.get(
        "/api/condura/handoffs?per_page=2&page=2", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["total"] == 5
    assert body["total_pages"] == 3
    assert len(body["handoffs"]) == 2


@pytest.mark.asyncio
async def test_handoffs_filters_echo_in_response(app_client, make_user):
    user = make_user(email="con-echo@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/condura/handoffs?capability=delegate_task&status=dispatched",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["filters"]["capability"] == "delegate_task"
    assert body["filters"]["status"] == "dispatched"


@pytest.mark.asyncio
async def test_handoffs_scoped_to_caller(app_client, make_user, db_session):
    alice = make_user(email="con-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="con-bob@test.com", tier=UserTier.PRO)
    db_session.add(_seed_handoff(db_session, user_id=alice.id))
    db_session.add(_seed_handoff(db_session, user_id=bob.id))
    db_session.commit()

    res = await app_client.get("/api/condura/handoffs", headers=_pro_headers(alice))
    body = res.json()
    assert body["total"] == 1


# ─── /handoffs/{id} detail ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_handoff_detail_includes_events(app_client, make_user, db_session):
    user = make_user(email="con-detail@test.com", tier=UserTier.PRO)
    handoff = _seed_handoff(db_session, user_id=user.id)
    db_session.add(handoff)
    db_session.commit()
    db_session.refresh(handoff)

    db_session.add(_seed_event(db_session, handoff_id=handoff.id, event_kind="started",
                                payload={"step": 1}))
    db_session.add(_seed_event(db_session, handoff_id=handoff.id, event_kind="progress",
                                payload={"step": 2}))
    db_session.commit()

    res = await app_client.get(
        f"/api/condura/handoffs/{handoff.id}", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == handoff.id
    assert len(body["events"]) == 2
    # Events are chronological.
    assert body["events"][0]["event_kind"] == "started"
    assert body["events"][0]["payload"] == {"step": 1}


@pytest.mark.asyncio
async def test_handoff_detail_404_for_foreign(app_client, make_user, db_session):
    user = make_user(email="con-detail-for@test.com", tier=UserTier.PRO)
    other = make_user(email="con-detail-other@test.com", tier=UserTier.PRO)
    handoff = _seed_handoff(db_session, user_id=other.id)
    db_session.add(handoff)
    db_session.commit()
    db_session.refresh(handoff)

    res = await app_client.get(
        f"/api/condura/handoffs/{handoff.id}", headers=_pro_headers(user)
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_handoff_detail_404_for_missing(app_client, make_user):
    user = make_user(email="con-detail-miss@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/condura/handoffs/999999", headers=_pro_headers(user))
    assert res.status_code == 404


# ─── /handoff-drafts filter ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_drafts_capability_filter(app_client, make_user, db_session):
    user = make_user(email="drafts-cap@test.com", tier=UserTier.PRO)
    db_session.add(_seed_draft(db_session, user_id=user.id, capability="delegate_task"))
    db_session.add(_seed_draft(db_session, user_id=user.id, capability="hybrid_delegate"))
    db_session.commit()

    res = await app_client.get(
        "/api/condura/handoff-drafts?capability=delegate_task",
        headers=_pro_headers(user),
    )
    body = res.json()
    caps = {d["capability"] for d in body["drafts"]}
    assert caps == {"delegate_task"}


@pytest.mark.asyncio
async def test_drafts_returns_envelope(app_client, make_user, db_session):
    user = make_user(email="drafts-env@test.com", tier=UserTier.PRO)
    db_session.add(_seed_draft(db_session, user_id=user.id))
    db_session.commit()
    res = await app_client.get("/api/condura/handoff-drafts", headers=_pro_headers(user))
    body = res.json()
    assert "drafts" in body
    assert "total" in body
    assert body["total"] == 1


@pytest.mark.asyncio
async def test_drafts_pagination(app_client, make_user, db_session):
    user = make_user(email="drafts-page@test.com", tier=UserTier.PRO)
    for i in range(5):
        db_session.add(_seed_draft(db_session, user_id=user.id))
    db_session.commit()
    res = await app_client.get(
        "/api/condura/handoff-drafts?per_page=2&page=2", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["total"] == 5
    assert body["total_pages"] == 3


@pytest.mark.asyncio
async def test_drafts_scoped_to_caller(app_client, make_user, db_session):
    alice = make_user(email="drafts-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="drafts-bob@test.com", tier=UserTier.PRO)
    db_session.add(_seed_draft(db_session, user_id=alice.id))
    db_session.add(_seed_draft(db_session, user_id=bob.id))
    db_session.commit()
    res = await app_client.get("/api/condura/handoff-drafts", headers=_pro_headers(alice))
    body = res.json()
    assert body["total"] == 1


# ─── Auth ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_condura_endpoints_require_auth(app_client):
    for method, path in [
        ("GET", "/api/condura/handoffs"),
        ("GET", "/api/condura/handoffs/1"),
        ("GET", "/api/condura/handoff-drafts"),
    ]:
        res = await app_client.request(method, path)
        assert res.status_code == 401, f"{method} {path} returned {res.status_code}"