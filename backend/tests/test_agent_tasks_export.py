"""Agent tasks JSONL export endpoint contract."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

import json
from datetime import datetime, timezone

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AgentTask, UserTier


def _make_task(*, suffix, user_id, verdict=None, topics=None, title=None):
    now = utcnow_naive()
    return AgentTask(
        user_id=user_id,
        task_id=f"task-export-{suffix}",
        title=title or f"Title {suffix}",
        task_text=f"Question text {suffix}",
        final_answer=f"Answer {suffix}",
        final_score=80 + int(suffix) % 20,
        final_confidence=0.6 + (int(suffix) % 4) * 0.05,
        topics=json.dumps(topics or []),
        user_feedback=verdict,
        is_live=False,
        created_at=now,
    )


@pytest.mark.asyncio
async def test_export_jsonl_streams_one_row_per_line(app_client, db_session, make_user):
    user = make_user(email="export-stream@test.com", tier=UserTier.PRO)
    for i in range(3):
        db_session.add(_make_task(suffix=i, user_id=user.id))
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/agent/tasks/export.jsonl", headers=headers)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/x-ndjson")
    assert "attachment" in res.headers["content-disposition"]

    lines = [line for line in res.text.split("\n") if line]
    assert len(lines) == 3
    parsed = [json.loads(line) for line in lines]
    # Same created_at across all three rows in this test → ordering by
    # task_id is a stable secondary sort. We assert set membership
    # rather than exact order so the contract is robust to secondary
    # tiebreakers.
    ids = sorted(row["task_id"] for row in parsed)
    assert ids == ["task-export-0", "task-export-1", "task-export-2"]
    for row in parsed:
        assert row["final_answer"].startswith("Answer ")
        assert row["is_live"] is False


@pytest.mark.asyncio
async def test_export_jsonl_scopes_to_caller(app_client, db_session, make_user):
    a = make_user(email="export-scope-a@test.com", tier=UserTier.PRO)
    b = make_user(email="export-scope-b@test.com", tier=UserTier.PRO)
    db_session.add(_make_task(suffix=1, user_id=a.id))
    db_session.add(_make_task(suffix=2, user_id=a.id))
    db_session.add(_make_task(suffix=3, user_id=b.id))
    db_session.commit()

    headers_a = {"Authorization": f"Bearer {create_access_token(a.id, a.email)}"}
    res = await app_client.get("/api/agent/tasks/export.jsonl", headers=headers_a)
    parsed = [json.loads(line) for line in res.text.split("\n") if line]
    assert len(parsed) == 2
    assert all(row["task_id"].startswith("task-export-") for row in parsed)
    assert sorted(row["task_id"] for row in parsed) == [
        "task-export-1",
        "task-export-2",
    ]


@pytest.mark.asyncio
async def test_export_jsonl_respects_feedback_filter(app_client, db_session, make_user):
    user = make_user(email="export-filter@test.com", tier=UserTier.PRO)
    db_session.add(_make_task(suffix=1, user_id=user.id, verdict="positive"))
    db_session.add(_make_task(suffix=2, user_id=user.id, verdict="negative"))
    db_session.add(_make_task(suffix=3, user_id=user.id))
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/tasks/export.jsonl?feedback=positive", headers=headers
    )
    parsed = [json.loads(line) for line in res.text.split("\n") if line]
    assert len(parsed) == 1
    assert parsed[0]["user_feedback"] == "positive"


@pytest.mark.asyncio
async def test_export_jsonl_requires_auth(app_client):
    res = await app_client.get("/api/agent/tasks/export.jsonl")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_export_jsonl_empty_state_returns_empty_body(app_client, make_user):
    user = make_user(email="export-empty@test.com", tier=UserTier.PRO)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/agent/tasks/export.jsonl", headers=headers)
    assert res.status_code == 200
    assert res.text == ""


@pytest.mark.asyncio
async def test_export_jsonl_handles_malformed_topics(app_client, db_session, make_user):
    user = make_user(email="export-malformed@test.com", tier=UserTier.PRO)
    task = AgentTask(
        user_id=user.id,
        task_id="task-export-malformed",
        task_text="q",
        final_answer="a",
        topics="not-json",  # invalid JSON
        created_at=utcnow_naive(),
    )
    db_session.add(task)
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/agent/tasks/export.jsonl", headers=headers)
    parsed = [json.loads(line) for line in res.text.split("\n") if line]
    assert len(parsed) == 1
    assert parsed[0]["topics"] == []


@pytest.mark.asyncio
async def test_export_jsonl_search_filter(app_client, db_session, make_user):
    user = make_user(email="export-search@test.com", tier=UserTier.PRO)
    db_session.add(
        _make_task(
            suffix=1,
            user_id=user.id,
            title="Quantum research",
            topics=["ai"],
        )
    )
    db_session.add(
        _make_task(
            suffix=2,
            user_id=user.id,
            title="Cooking recipes",
            topics=["food"],
        )
    )
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/tasks/export.jsonl?search=quantum", headers=headers
    )
    parsed = [json.loads(line) for line in res.text.split("\n") if line]
    assert len(parsed) == 1
    assert parsed[0]["title"] == "Quantum research"


@pytest.mark.asyncio
async def test_export_jsonl_rate_limit_blocks_runaway(app_client, make_user):
    """Full-history export is rate-limited (30/hour) so an authenticated
    client cannot pin the DB with concurrent bulk downloads."""
    import time as _time
    from collections import deque

    from arena.core import rate_limits as _rl

    if hasattr(_rl.rate_limiter, "_events"):
        _rl.rate_limiter._events.clear()

    user = make_user(email="export-rl@test.com", tier=UserTier.PRO)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

    # Under the limit: a few exports must succeed.
    for i in range(3):
        res = await app_client.get("/api/agent/tasks/export.jsonl", headers=headers)
        assert res.status_code == 200, (
            "request %d should pass under limit, got %d"
            % (i + 1, res.status_code)
        )

    # Pre-fill the bucket to the production limit (30/hour) using a
    # real deque so InMemoryRateLimiter.hit can popleft safely.
    _rl.rate_limiter._events.clear()
    key = "user:agent_tasks_export_jsonl:%s" % user.id
    base = _time.time()
    _rl.rate_limiter._events[key] = deque([base] * 30)
    res = await app_client.get("/api/agent/tasks/export.jsonl", headers=headers)
    assert res.status_code == 429, (
        "31st export in the window should be 429, got %d body=%s"
        % (res.status_code, res.text[:200])
    )
    detail = res.json().get("detail", {})
    assert detail.get("error") == "rate_limit_exceeded"
    _rl.rate_limiter._events.clear()
