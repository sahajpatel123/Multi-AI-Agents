"""Integration tests for /api/calibration history, retract, and delete."""

from __future__ import annotations

import uuid

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AgentTask, ConfidenceRating, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _make_task(
    db,
    *,
    user_id: int,
    task_id: str | None = None,
    intelligence_score: dict | None = None,
):
    """Seed an AgentTask with the given intelligence_score so delta can be
    computed deterministically."""
    return AgentTask(
        user_id=user_id,
        task_id=task_id or f"task-{uuid.uuid4()}",
        task_text=f"question for {task_id}",
        final_score=80,
        final_confidence=0.8,
        intelligence_score=intelligence_score or {"total_score": 60},
    )


def _seed_rating(
    db,
    *,
    user_id: int,
    task_id: str,
    user_rating: int = 3,
    system_score: int = 60,
):
    delta = int(system_score - user_rating * 20)
    return ConfidenceRating(
        user_id=user_id,
        task_id=task_id,
        user_rating=user_rating,
        system_score=system_score,
        delta=delta,
    )


# ─── History list ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_history_returns_envelope(app_client, make_user, db_session):
    user = make_user(email="cal-list@test.com", tier=UserTier.PRO)
    task = _make_task(db_session, user_id=user.id)
    db_session.add(task)
    db_session.add(_seed_rating(db_session, user_id=user.id, task_id=task.task_id))
    db_session.commit()

    res = await app_client.get("/api/calibration/history", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, dict)
    assert "ratings" in body
    assert body["total"] == 1


@pytest.mark.asyncio
async def test_history_ordered_newest_first(app_client, make_user, db_session):
    user = make_user(email="cal-order@test.com", tier=UserTier.PRO)
    task1 = _make_task(db_session, user_id=user.id, task_id="t1")
    task2 = _make_task(db_session, user_id=user.id, task_id="t2")
    db_session.add_all([task1, task2])
    db_session.add(_seed_rating(db_session, user_id=user.id, task_id="t1"))
    db_session.commit()
    db_session.add(_seed_rating(db_session, user_id=user.id, task_id="t2"))
    db_session.commit()

    res = await app_client.get("/api/calibration/history", headers=_pro_headers(user))
    body = res.json()
    task_ids = [r["task_id"] for r in body["ratings"]]
    # t2 was inserted second → most recent → first.
    assert task_ids[0] == "t2"


@pytest.mark.asyncio
async def test_history_filter_min_delta(app_client, make_user, db_session):
    """min_delta=N shows rows with delta >= N. With user_rating=3 → user_scaled=60,
    system_score values 80/40 produce deltas +20 and -20. min_delta=0
    filters out the -20 case."""
    user = make_user(email="cal-mind@test.com", tier=UserTier.PRO)
    task_pos = _make_task(db_session, user_id=user.id, task_id="pos")
    task_neg = _make_task(db_session, user_id=user.id, task_id="neg")
    db_session.add_all([task_pos, task_neg])
    db_session.add(_seed_rating(db_session, user_id=user.id, task_id="pos",
                                user_rating=3, system_score=80))
    db_session.add(_seed_rating(db_session, user_id=user.id, task_id="neg",
                                user_rating=3, system_score=40))
    db_session.commit()

    res = await app_client.get(
        "/api/calibration/history?min_delta=0", headers=_pro_headers(user)
    )
    body = res.json()
    task_ids = {r["task_id"] for r in body["ratings"]}
    assert task_ids == {"pos"}


@pytest.mark.asyncio
async def test_history_filter_max_delta(app_client, make_user, db_session):
    """max_delta=N shows rows with delta <= N — surfaces overestimates."""
    user = make_user(email="cal-maxd@test.com", tier=UserTier.PRO)
    task_pos = _make_task(db_session, user_id=user.id, task_id="pos")
    task_neg = _make_task(db_session, user_id=user.id, task_id="neg")
    db_session.add_all([task_pos, task_neg])
    db_session.add(_seed_rating(db_session, user_id=user.id, task_id="pos",
                                user_rating=3, system_score=80))
    db_session.add(_seed_rating(db_session, user_id=user.id, task_id="neg",
                                user_rating=3, system_score=40))
    db_session.commit()

    res = await app_client.get(
        "/api/calibration/history?max_delta=0", headers=_pro_headers(user)
    )
    body = res.json()
    task_ids = {r["task_id"] for r in body["ratings"]}
    assert task_ids == {"neg"}


@pytest.mark.asyncio
async def test_history_sort_delta_desc(app_client, make_user, db_session):
    user = make_user(email="cal-sort@test.com", tier=UserTier.PRO)
    for tid, sys_score in [("a", 30), ("b", 90), ("c", 60)]:
        task = _make_task(db_session, user_id=user.id, task_id=tid)
        db_session.add(task)
        db_session.add(_seed_rating(db_session, user_id=user.id, task_id=tid,
                                    user_rating=3, system_score=sys_score))
    db_session.commit()

    res = await app_client.get(
        "/api/calibration/history?sort=delta_desc", headers=_pro_headers(user)
    )
    body = res.json()
    task_ids = [r["task_id"] for r in body["ratings"]]
    # deltas: a=-30, b=+30, c=0. Sorted desc: b, c, a.
    assert task_ids == ["b", "c", "a"]


@pytest.mark.asyncio
async def test_history_sort_unknown_falls_back_to_newest(
    app_client, make_user, db_session
):
    user = make_user(email="cal-unk@test.com", tier=UserTier.PRO)
    task = _make_task(db_session, user_id=user.id)
    db_session.add(task)
    db_session.add(_seed_rating(db_session, user_id=user.id, task_id=task.task_id))
    db_session.commit()
    res = await app_client.get(
        "/api/calibration/history?sort=banana", headers=_pro_headers(user)
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_history_pagination(app_client, make_user, db_session):
    user = make_user(email="cal-page@test.com", tier=UserTier.PRO)
    for i in range(5):
        task = _make_task(db_session, user_id=user.id, task_id=f"t{i}")
        db_session.add(task)
        db_session.add(_seed_rating(db_session, user_id=user.id, task_id=f"t{i}"))
    db_session.commit()

    res = await app_client.get(
        "/api/calibration/history?per_page=2&page=2", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["total"] == 5
    assert body["total_pages"] == 3
    assert len(body["ratings"]) == 2


@pytest.mark.asyncio
async def test_history_scoped_to_caller(app_client, make_user, db_session):
    alice = make_user(email="cal-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="cal-bob@test.com", tier=UserTier.PRO)
    for u, tid in [(alice, "alice-1"), (bob, "bob-1")]:
        task = _make_task(db_session, user_id=u.id, task_id=tid)
        db_session.add(task)
        db_session.add(_seed_rating(db_session, user_id=u.id, task_id=tid))
    db_session.commit()

    res = await app_client.get("/api/calibration/history", headers=_pro_headers(alice))
    body = res.json()
    task_ids = {r["task_id"] for r in body["ratings"]}
    assert task_ids == {"alice-1"}


# ─── Retract & re-rate ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_retract_replaces_existing_rating(app_client, make_user, db_session):
    user = make_user(email="cal-retr@test.com", tier=UserTier.PRO)
    task = _make_task(db_session, user_id=user.id,
                      intelligence_score={"total_score": 60})
    db_session.add(task)
    db_session.add(_seed_rating(db_session, user_id=user.id, task_id=task.task_id,
                                user_rating=5, system_score=60))
    db_session.commit()

    # Re-rate from 5 (delta = 60 - 100 = -40) to 3 (delta = 60 - 60 = 0).
    res = await app_client.post(
        f"/api/calibration/rate/{task.task_id}/retract",
        json={"rating": 3},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "replaced"
    assert body["user_rating"] == 3
    assert body["delta"] == 0
    assert body["verdict"] == "Well calibrated"

    # Confirm there's still exactly one rating — old one was replaced,
    # not duplicated.
    listing = await app_client.get(
        "/api/calibration/history", headers=_pro_headers(user)
    )
    assert listing.json()["total"] == 1


@pytest.mark.asyncio
async def test_retract_404_when_no_existing_rating(app_client, make_user, db_session):
    user = make_user(email="cal-retr-miss@test.com", tier=UserTier.PRO)
    task = _make_task(db_session, user_id=user.id)
    db_session.add(task)
    db_session.commit()
    res = await app_client.post(
        f"/api/calibration/rate/{task.task_id}/retract",
        json={"rating": 3},
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_retract_404_for_foreign_task(app_client, make_user, db_session):
    """User can't retract a rating on someone else's task."""
    user = make_user(email="cal-retr-for@test.com", tier=UserTier.PRO)
    other = make_user(email="cal-retr-other@test.com", tier=UserTier.PRO)
    task = _make_task(db_session, user_id=other.id)
    db_session.add(task)
    db_session.add(_seed_rating(db_session, user_id=other.id, task_id=task.task_id))
    db_session.commit()
    res = await app_client.post(
        f"/api/calibration/rate/{task.task_id}/retract",
        json={"rating": 3},
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_retract_rejects_out_of_range_rating(app_client, make_user, db_session):
    user = make_user(email="cal-retr-bad@test.com", tier=UserTier.PRO)
    task = _make_task(db_session, user_id=user.id)
    db_session.add(task)
    db_session.add(_seed_rating(db_session, user_id=user.id, task_id=task.task_id))
    db_session.commit()
    res = await app_client.post(
        f"/api/calibration/rate/{task.task_id}/retract",
        json={"rating": 99},
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


# ─── Delete ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_removes_rating(app_client, make_user, db_session):
    user = make_user(email="cal-del@test.com", tier=UserTier.PRO)
    task = _make_task(db_session, user_id=user.id)
    db_session.add(task)
    db_session.add(_seed_rating(db_session, user_id=user.id, task_id=task.task_id))
    db_session.commit()

    res = await app_client.delete(
        f"/api/calibration/rating/{task.task_id}", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    assert res.json() == {"status": "deleted", "task_id": task.task_id}

    listing = await app_client.get(
        "/api/calibration/history", headers=_pro_headers(user)
    )
    assert listing.json()["total"] == 0


@pytest.mark.asyncio
async def test_delete_404_for_foreign_task(app_client, make_user, db_session):
    """Foreign task_ids must look like not-found (no existence oracle)."""
    user = make_user(email="cal-del-for@test.com", tier=UserTier.PRO)
    other = make_user(email="cal-del-other@test.com", tier=UserTier.PRO)
    task = _make_task(db_session, user_id=other.id)
    db_session.add(task)
    db_session.add(_seed_rating(db_session, user_id=other.id, task_id=task.task_id))
    db_session.commit()

    res = await app_client.delete(
        f"/api/calibration/rating/{task.task_id}", headers=_pro_headers(user)
    )
    assert res.status_code == 404
    # Other's row still there.
    listing = await app_client.get(
        "/api/calibration/history", headers=_pro_headers(other)
    )
    assert listing.json()["total"] == 1


@pytest.mark.asyncio
async def test_delete_404_for_missing_task(app_client, make_user):
    user = make_user(email="cal-del-miss@test.com", tier=UserTier.PRO)
    res = await app_client.delete(
        "/api/calibration/rating/never-existed", headers=_pro_headers(user)
    )
    assert res.status_code == 404


# ─── Auth ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_calibration_endpoints_require_auth(app_client):
    for method, path in [
        ("GET", "/api/calibration/history"),
        ("DELETE", "/api/calibration/rating/x"),
    ]:
        res = await app_client.request(method, path)
        assert res.status_code == 401, f"{method} {path} returned {res.status_code}"