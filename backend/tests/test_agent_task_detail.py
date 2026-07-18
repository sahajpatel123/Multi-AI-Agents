"""Agent task detail aggregator contract."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from arena.core.agent_memory import get_task_detail
from arena.core.auth import create_access_token
from arena.db_models import (
    AgentContradiction,
    AgentTask,
    UserTier,
)


def _make_task(*, suffix, user_id, insight=None):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return AgentTask(
        user_id=user_id,
        task_id=f"task-detail-{suffix}",
        title=f"Title {suffix}",
        task_text=f"Question {suffix}",
        final_answer=f"Answer {suffix}",
        insight_report=json.dumps(insight) if insight else None,
        created_at=now,
    )


def test_task_detail_aggregates_row_insight_and_contradictions(
    db_session, make_user
):
    user = make_user(email="detail-bob@test.com", tier=UserTier.PRO)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    task = _make_task(
        suffix=1,
        user_id=user.id,
        insight={"summary": "Key insight", "confidence": 0.9},
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    # Two contradictions, one as new_task and one as old_task.
    db_session.add(
        AgentContradiction(
            user_id=user.id,
            new_task_id=task.task_id,
            old_task_id="prior-task",
            contradiction_summary="contradicts 1",
            severity="major",
        )
    )
    db_session.add(
        AgentContradiction(
            user_id=user.id,
            new_task_id="later-task",
            old_task_id=task.task_id,
            contradiction_summary="contradicts 2",
            severity="minor",
        )
    )
    # An unrelated contradiction that must not appear.
    db_session.add(
        AgentContradiction(
            user_id=user.id,
            new_task_id="other-1",
            old_task_id="other-2",
            contradiction_summary="unrelated",
            severity="moderate",
        )
    )
    db_session.commit()

    payload = get_task_detail(db=db_session, user_id=user.id, task_id=task.task_id)
    assert payload is not None
    assert payload["task"]["task_id"] == task.task_id
    assert payload["task"]["title"] == "Title 1"
    assert payload["insight_report"] == {"summary": "Key insight", "confidence": 0.9}
    assert len(payload["contradictions"]) == 2
    summaries = {c["summary"] for c in payload["contradictions"]}
    assert summaries == {"contradicts 1", "contradicts 2"}
    # Direction labels are accurate.
    directions = {c["direction"] for c in payload["contradictions"]}
    assert directions == {"new", "old"}


def test_task_detail_returns_none_for_missing_or_other_user(
    db_session, make_user
):
    user = make_user(email="detail-alice@test.com", tier=UserTier.PRO)
    other = make_user(email="detail-other@test.com", tier=UserTier.PRO)
    db_session.add_all([user, other])
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(other)

    # Task owned by 'other' must not be visible to 'user'.
    db_session.add(_make_task(suffix=99, user_id=other.id))
    db_session.commit()

    assert get_task_detail(db=db_session, user_id=user.id, task_id="task-detail-99") is None
    assert get_task_detail(db=db_session, user_id=user.id, task_id="does-not-exist") is None


def test_task_detail_handles_missing_insight_report(db_session, make_user):
    user = make_user(email="detail-noins@test.com", tier=UserTier.PRO)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    task = _make_task(suffix=42, user_id=user.id, insight=None)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    payload = get_task_detail(db=db_session, user_id=user.id, task_id=task.task_id)
    assert payload["insight_report"] is None
    assert payload["contradictions"] == []


def test_task_detail_handles_malformed_insight_column(db_session, make_user):
    """A row with a non-JSON insight column should fall back to None,
    not raise, so a bad historical row doesn't break the detail page."""
    user = make_user(email="detail-badins@test.com", tier=UserTier.PRO)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    task = _make_task(suffix=43, user_id=user.id, insight="not-json")
    task.insight_report = "not-json"  # explicitly bypass _make_task's json.dumps
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    payload = get_task_detail(db=db_session, user_id=user.id, task_id=task.task_id)
    assert payload["insight_report"] is None


@pytest.mark.asyncio
async def test_task_detail_endpoint_requires_auth(app_client):
    res = await app_client.get("/api/agent/tasks/some-id/detail")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_task_detail_endpoint_returns_404_for_missing(app_client, make_user):
    user = make_user(email="detail-endpoint@test.com", tier=UserTier.PRO)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/tasks/does-not-exist/detail", headers=headers
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_task_detail_endpoint_gates_free_tier(app_client, make_user):
    free = make_user(email="detail-free@test.com", tier=UserTier.FREE)
    headers = {"Authorization": f"Bearer {create_access_token(free.id, free.email)}"}
    res = await app_client.get(
        "/api/agent/tasks/anything/detail", headers=headers
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_task_detail_endpoint_full_payload(
    app_client, make_user, db_session
):
    user = make_user(email="detail-full@test.com", tier=UserTier.PRO)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    task = _make_task(
        suffix=100,
        user_id=user.id,
        insight={"summary": "summary", "key": "value"},
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)
    db_session.add(
        AgentContradiction(
            user_id=user.id,
            new_task_id=task.task_id,
            old_task_id="prior",
            contradiction_summary="c1",
            severity="moderate",
        )
    )
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        f"/api/agent/tasks/{task.task_id}/detail", headers=headers
    )
    assert res.status_code == 200
    body = res.json()
    assert body["task"]["task_id"] == task.task_id
    assert body["insight_report"] == {"summary": "summary", "key": "value"}
    assert len(body["contradictions"]) == 1
    assert body["contradictions"][0]["other_task_id"] == "prior"