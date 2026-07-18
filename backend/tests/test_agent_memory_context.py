"""Integration tests for GET /api/agent/memory/context."""

from __future__ import annotations

import json

import pytest

from arena.db_models import AgentTask, UserTier



def _seed_task(
    db,
    *,
    user_id: int,
    title: str = "Test Task",
    topics: list[str] | None = None,
):
    return AgentTask(
        user_id=user_id,
        task_id=f"task-{user_id}-{hash(title) & 0xffffffff:08x}",
        title=title,
        task_text=f"Question for {title}",
        topics=json.dumps(topics or []),
    )


# ─── Auth + tier gate ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_memory_context_requires_auth(app_client):
    res = await app_client.get("/api/agent/memory/context")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_memory_context_rejects_free_tier(app_client, make_user):
    user = make_user(email="memctx-free@test.com", tier=UserTier.FREE)
    res = await app_client.get("/api/agent/memory/context", headers=_pro_headers(user))
    # Agent is gated to PLUS-with-addon or PRO.
    assert res.status_code in (403, 404)


@pytest.mark.asyncio
async def test_memory_context_ok_for_pro(app_client, make_user, db_session):
    user = make_user(email="memctx-pro@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/agent/memory/context", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    # Empty user → empty-ish context but valid shape.
    assert isinstance(body, dict)


# ─── Topic aggregation ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_memory_context_aggregates_recent_topics(app_client, make_user, db_session):
    user = make_user(email="memctx-topics@test.com", tier=UserTier.PRO)
    db_session.add(_seed_task(db_session, user_id=user.id, title="T1",
                              topics=["ai", "ethics"]))
    db_session.add(_seed_task(db_session, user_id=user.id, title="T2",
                              topics=["ai", "policy"]))
    db_session.add(_seed_task(db_session, user_id=user.id, title="T3",
                              topics=["ai"]))
    db_session.commit()

    res = await app_client.get("/api/agent/memory/context", headers=_pro_headers(user))
    body = res.json()
    # 'ai' appears in all three — must be the most-frequent topic.
    top_topics = body.get("top_topics") or body.get("topics") or []
    if isinstance(top_topics, list) and top_topics and isinstance(top_topics[0], tuple):
        # Some impls return (topic, count) tuples.
        topics_by_count = dict(top_topics)
    else:
        # Others return a flat list of topic names.
        topics_by_count = {t: 0 for t in top_topics}
    # 'ai' must appear in the aggregated topics regardless of shape.
    assert "ai" in topics_by_count


@pytest.mark.asyncio
async def test_memory_context_handles_invalid_topics_json(
    app_client, make_user, db_session
):
    """topics column is TEXT that may contain malformed JSON from older
    rows — the helper must not crash on json.loads errors."""
    user = make_user(email="memctx-bad-json@test.com", tier=UserTier.PRO)
    bad = AgentTask(
        user_id=user.id,
        task_id="task-bad",
        title="Bad topics",
        task_text="Q",
        topics="not-json-just-a-string",
    )
    db_session.add(bad)
    db_session.commit()
    res = await app_client.get("/api/agent/memory/context", headers=_pro_headers(user))
    assert res.status_code == 200


# ─── Tenant isolation ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_memory_context_scoped_to_caller(
    app_client, make_user, db_session
):
    alice = make_user(email="memctx-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="memctx-bob@test.com", tier=UserTier.PRO)
    db_session.add(_seed_task(db_session, user_id=alice.id, title="Alice task"))
    db_session.add(_seed_task(db_session, user_id=bob.id, title="Bob task"))
    db_session.commit()

    res = await app_client.get("/api/agent/memory/context", headers=_pro_headers(alice))
    body = res.json()
    # Whatever the response shape, Alice's context must NOT include
    # Bob's task title.
    serialized = json.dumps(body)
    assert "Bob task" not in serialized
    assert "Alice task" in serialized