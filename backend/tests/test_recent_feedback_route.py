"""Integration tests for GET /api/agent/feedback/recent."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AgentTask, AnswerFeedback, UserTier


@pytest.fixture
def pro_user(make_user):
    return make_user(email="rf-pro@test.com", tier=UserTier.PRO)


@pytest.fixture
def pro_headers(pro_user):
    return {"Authorization": f"Bearer {create_access_token(pro_user.id, pro_user.email)}"}


def _seed_task(session, *, user_id: int, task_id: str, title: str, task_text: str) -> AgentTask:
    row = AgentTask(
        user_id=user_id,
        task_id=task_id,
        title=title,
        task_text=task_text,
    )
    session.add(row)
    session.flush()
    return row


def _seed_feedback(
    session,
    *,
    user_id: int,
    task_id: str,
    verdict: str,
    note: str | None = None,
    created_at: datetime | None = None,
) -> AnswerFeedback:
    row = AnswerFeedback(
        user_id=user_id,
        task_id=task_id,
        verdict=verdict,
        note=note,
        created_at=created_at or datetime.now(timezone.utc).replace(tzinfo=None),
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.asyncio
async def test_recent_returns_seeded_items_newest_first(app_client, pro_user, pro_headers, db_session):
    base = datetime.now(timezone.utc).replace(tzinfo=None)
    _seed_task(db_session, user_id=pro_user.id, task_id="t1", title="Quantum intro", task_text="Explain qubits")
    _seed_task(db_session, user_id=pro_user.id, task_id="t2", title="Ethics of AI", task_text="Discuss agency")
    _seed_feedback(db_session, user_id=pro_user.id, task_id="t1", verdict="accurate", created_at=base - timedelta(days=1))
    _seed_feedback(
        db_session,
        user_id=pro_user.id,
        task_id="t2",
        verdict="inaccurate",
        note="Got the premise wrong",
        created_at=base,
    )
    db_session.commit()

    res = await app_client.get("/api/agent/feedback/recent", headers=pro_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["count"] == 2
    items = body["items"]
    assert items[0]["task_id"] == "t2"  # newest first
    assert items[0]["title"] == "Ethics of AI"
    assert items[0]["verdict"] == "inaccurate"
    assert items[0]["note"] == "Got the premise wrong"
    assert items[1]["task_id"] == "t1"
    assert items[1]["title"] == "Quantum intro"


@pytest.mark.asyncio
async def test_recent_falls_back_to_snippet_when_title_null(
    app_client, pro_user, pro_headers, db_session
):
    """Task that survived the feedback but lost its title still renders."""
    _seed_task(
        db_session,
        user_id=pro_user.id,
        task_id="t3",
        title=None,
        task_text="Explain the offside rule in plain English, please.",
    )
    _seed_feedback(db_session, user_id=pro_user.id, task_id="t3", verdict="partial")
    db_session.commit()

    res = await app_client.get("/api/agent/feedback/recent", headers=pro_headers)
    assert res.status_code == 200
    item = res.json()["items"][0]
    assert item["task_id"] == "t3"
    assert item["title"] is None
    assert item["task_text"].startswith("Explain the offside rule")


@pytest.mark.asyncio
async def test_recent_returns_item_when_task_cascade_deleted(app_client, pro_user, pro_headers, db_session):
    """A feedback whose task was cascade-deleted still surfaces with title=None, task_text=None."""
    _seed_feedback(db_session, user_id=pro_user.id, task_id="orphan-task", verdict="wrong")
    db_session.commit()

    res = await app_client.get("/api/agent/feedback/recent", headers=pro_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 1
    item = body["items"][0]
    assert item["task_id"] == "orphan-task"
    assert item["title"] is None
    assert item["task_text"] is None


@pytest.mark.asyncio
async def test_recent_clamps_limit_at_ceiling(app_client, pro_user, pro_headers, db_session):
    """limit=200 is the public ceiling; passing it must return 200."""
    res = await app_client.get(
        "/api/agent/feedback/recent?limit=200",
        headers=pro_headers,
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_recent_rejects_tier_without_agent_access(app_client, make_user):
    """FREE tier user gets 403 — same gate as other /api/agent routes."""
    free_user = make_user(email="rf-free@test.com", tier=UserTier.FREE)
    headers = {"Authorization": f"Bearer {create_access_token(free_user.id, free_user.email)}"}

    res = await app_client.get("/api/agent/feedback/recent", headers=headers)
    assert res.status_code == 403
    detail = res.json().get("detail", res.json())
    assert detail["error"] == "agent_not_available"


@pytest.mark.asyncio
async def test_recent_requires_auth(app_client):
    res = await app_client.get("/api/agent/feedback/recent")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_recent_only_returns_callers_own_feedback(
    app_client, make_user, db_session
):
    """Two users, two feedback sets — caller sees only theirs."""
    alice = make_user(email="alice-rf@test.com", tier=UserTier.PRO)
    bob = make_user(email="bob-rf@test.com", tier=UserTier.PRO)
    _seed_task(db_session, user_id=alice.id, task_id="a1", title="Alice's task", task_text="A")
    _seed_task(db_session, user_id=bob.id, task_id="b1", title="Bob's task", task_text="B")
    _seed_feedback(db_session, user_id=alice.id, task_id="a1", verdict="accurate")
    _seed_feedback(db_session, user_id=bob.id, task_id="b1", verdict="wrong")
    db_session.commit()

    alice_token = create_access_token(alice.id, alice.email)
    res = await app_client.get(
        "/api/agent/feedback/recent",
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["task_id"] == "a1"
