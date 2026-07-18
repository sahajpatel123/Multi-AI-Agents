"""Integration tests for GET /api/agent/history (paginated list)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from arena.db_models import AgentTask, UserTier



def _seed(session, *, user_id: int, task_id: str, days_ago: int = 0, score: int | None = 80):
    row = AgentTask(
        user_id=user_id,
        task_id=task_id,
        task_text=f"Question for {task_id}",
        final_score=score,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days_ago),
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.asyncio
async def test_history_returns_paginated_dict(app_client, make_user, db_session):
    user = make_user(email="hist-paginate@test.com", tier=UserTier.PRO)
    for i in range(3):
        _seed(db_session, user_id=user.id, task_id=f"hist-{i}", days_ago=i)
    db_session.commit()

    res = await app_client.get("/api/agent/history", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert body["page"] == 1
    assert body["per_page"] == 200  # default
    assert body["total"] == 3
    assert len(body["tasks"]) == 3


@pytest.mark.asyncio
async def test_history_respects_page_param(app_client, make_user, db_session):
    user = make_user(email="hist-page@test.com", tier=UserTier.PRO)
    for i in range(5):
        _seed(db_session, user_id=user.id, task_id=f"hist-page-{i}", days_ago=i)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/history?page=2&per_page=2",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["page"] == 2
    assert body["per_page"] == 2
    assert body["total"] == 5
    assert len(body["tasks"]) == 2
    # total_pages = ceil(5/2) = 3
    assert body["total_pages"] == 3


@pytest.mark.asyncio
async def test_history_empty_for_new_user(app_client, make_user):
    user = make_user(email="hist-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/agent/history", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert body["tasks"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_history_only_returns_callers_tasks(app_client, make_user, db_session):
    """User-scoped query — Bob's tasks never bleed into Alice's response."""
    alice = make_user(email="hist-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="hist-bob@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=alice.id, task_id="alice-1")
    _seed(db_session, user_id=alice.id, task_id="alice-2")
    _seed(db_session, user_id=bob.id, task_id="bob-1")
    db_session.commit()

    res = await app_client.get("/api/agent/history", headers=_pro_headers(alice))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 2
    task_ids = {t["task_id"] for t in body["tasks"]}
    assert task_ids == {"alice-1", "alice-2"}


@pytest.mark.asyncio
async def test_history_rejects_invalid_per_page(app_client, make_user):
    """per_page > 200 must be rejected so a runaway client can't page through everything."""
    user = make_user(email="hist-cap@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/history?per_page=500",
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_history_rejects_invalid_page(app_client, make_user):
    user = make_user(email="hist-pagebad@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/history?page=0",
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_history_403_for_free_tier(app_client, make_user):
    user = make_user(email="hist-free@test.com", tier=UserTier.FREE)
    res = await app_client.get("/api/agent/history", headers=_pro_headers(user))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_history_requires_auth(app_client):
    res = await app_client.get("/api/agent/history")
    assert res.status_code == 401
