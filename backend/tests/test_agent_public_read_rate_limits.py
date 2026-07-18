"""Integration tests for the cycle-33 rate-limit additions to public
capability-metadata GETs and GET /api/agent/tasks/{id}/feedback.

Endpoints covered:
  IP rate-limit (60/min):
    GET /api/agent/templates
    GET /api/agent/capabilities
    GET /api/agent/capabilities/docs
    GET /api/agent/capabilities/docs/{capability_id}
    GET /api/agent/capabilities/examples
    GET /api/agent/capabilities/stats
  User rate-limit (120/min):
    GET /api/agent/tasks/{task_id}/feedback
"""

from __future__ import annotations

from collections import deque
import json
import time

import pytest

from arena.core import rate_limits as _rl
from arena.db_models import AgentTask, UserTier


# ─── Public capability-metadata IP rate-limits ──────────────────────────────


PUBLIC_ROUTES = [
    ("/api/agent/templates", "agent_templates", 60),
    ("/api/agent/capabilities", "agent_capabilities", 60),
    ("/api/agent/capabilities/docs", "agent_capability_docs", 60),
    ("/api/agent/capabilities/docs/agent.research", "agent_capability_doc_by_id", 60),
    ("/api/agent/capabilities/examples", "agent_capability_examples", 60),
    ("/api/agent/capabilities/stats", "agent_capability_stats", 60),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("path,scope,limit", PUBLIC_ROUTES)
async def test_public_route_ok_under_limit(app_client, path, scope, limit):
    """Smoke test: a fresh IP can hit each public route and get a 200."""
    if hasattr(_rl.rate_limiter, "_events"):
        _rl.rate_limiter._events.clear()
    res = await app_client.get(path)
    assert res.status_code == 200, (
        f"{path} should be reachable anonymously, got {res.status_code} body={res.text[:200]}"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("path,scope,limit", PUBLIC_ROUTES)
async def test_public_route_rate_limit_blocks_runaway(app_client, path, scope, limit):
    """Pre-fill the IP rate-limiter bucket and assert the next call 429s.

    These public routes return capability/taxonomy metadata — the cost is
    low per call but a scraping loop could pin a worker indefinitely. The
    cycle-33 fix adds a 60/min IP cap on each; this test pins it.
    """
    if hasattr(_rl.rate_limiter, "_events"):
        _rl.rate_limiter._events.clear()

    # First request passes (under limit).
    res = await app_client.get(path)
    assert res.status_code == 200

    # Pre-fill the bucket to the limit with events inside the window.
    # Use a real deque so InMemoryRateLimiter.hit can popleft safely.
    _rl.rate_limiter._events.clear()
    base = time.time()
    key = f"ip:{scope}:127.0.0.1"
    _rl.rate_limiter._events[key] = deque([base] * limit)

    res = await app_client.get(path)
    assert res.status_code == 429, (
        f"{path} should 429 once bucket is full ({limit}/min), got {res.status_code}"
    )
    detail = res.json().get("detail", {})
    assert detail.get("error") == "rate_limit_exceeded"

    # Reset the limiter so subsequent tests aren't poisoned.
    _rl.rate_limiter._events.clear()


# ─── User rate-limit on GET /api/agent/tasks/{task_id}/feedback ─────────────


def _seed_task(db, *, user_id: int, task_id: str = "task-feedback-rl"):
    return AgentTask(
        user_id=user_id,
        task_id=task_id,
        title="Feedback RL task",
        task_text="Q for feedback rate-limit test",
        topics=json.dumps([]),
    )


@pytest.mark.asyncio
async def test_task_feedback_get_requires_auth(app_client):
    res = await app_client.get("/api/agent/tasks/anything/feedback")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_task_feedback_get_ok_for_owner(
    app_client, make_user, db_session
):
    user = make_user(email="fb-rl-owner@test.com", tier=UserTier.PRO)
    db_session.add(_seed_task(db_session, user_id=user.id, task_id="fb-rl-1"))
    db_session.commit()

    res = await app_client.get(
        "/api/agent/tasks/fb-rl-1/feedback",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_task_feedback_get_rate_limit_blocks_runaway(
    app_client, make_user, db_session, monkeypatch
):
    """Cycle-33 fix: enforce_user_rate_limit(scope='agent_task_feedback_get',
    limit=120, window=60s) on GET /api/agent/tasks/{id}/feedback.

    Placed BEFORE _ensure_agent_access so a scripted sweep can't even probe
    for which task IDs belong to the caller. Mirrors the POST version's 120/min.
    """
    if hasattr(_rl.rate_limiter, "_events"):
        _rl.rate_limiter._events.clear()

    user = make_user(email="fb-rl-burst@test.com", tier=UserTier.PRO)
    db_session.add(_seed_task(db_session, user_id=user.id, task_id="fb-rl-burst"))
    db_session.commit()
    headers = _pro_headers(user)

    # 5 quick reads should all pass under the limit.
    for i in range(5):
        res = await app_client.get(
            "/api/agent/tasks/fb-rl-burst/feedback?probe=%d" % i,
            headers=headers,
        )
        assert res.status_code == 200, (
            "request %d should pass under the limit, got %d body=%s"
            % (i + 1, res.status_code, res.text[:200])
        )

    # Pre-fill the bucket to 120 (the production limit) and assert 121st is 429.
    _rl.rate_limiter._events.clear()
    key = f"user:agent_task_feedback_get:{user.id}"
    base = time.time()
    _rl.rate_limiter._events[key] = deque([base] * 120)

    res = await app_client.get(
        "/api/agent/tasks/fb-rl-burst/feedback",
        headers=headers,
    )
    assert res.status_code == 429, (
        "121st request in 60s should be 429, got %d" % res.status_code
    )
    detail = res.json().get("detail", {})
    assert detail.get("error") == "rate_limit_exceeded"

    _rl.rate_limiter._events.clear()