"""LLM-heavy agent routes must be per-user rate-limited.

POST /challenge fires three parallel LLM calls. Without a cap, an
authenticated client can burn provider quota (cost amplification).
Rebuttal and refine are similarly cost-bearing.
"""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _patch_scope_limit(monkeypatch, scope_prefix: str, max_hits: int = 2):
    from arena.core import rate_limits

    hits = {"n": 0}
    real_hit = rate_limits.rate_limiter.hit

    def limited_hit(key, *, limit, window_seconds, message):
        if f"user:{scope_prefix}:" in key:
            hits["n"] += 1
            if hits["n"] > max_hits:
                from fastapi import HTTPException, status

                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "error": "rate_limit_exceeded",
                        "message": message,
                        "retry_after": 1,
                    },
                )
            return
        return real_hit(key, limit=limit, window_seconds=window_seconds, message=message)

    monkeypatch.setattr(rate_limits.rate_limiter, "hit", limited_hit)
    return hits


@pytest.mark.asyncio
async def test_challenge_is_rate_limited(app_client, make_user, monkeypatch):
    _patch_scope_limit(monkeypatch, "agent_challenge", max_hits=2)

    # Avoid real LLM work if a call slips past the gate.
    async def _no_llm(*_a, **_k):
        return {"challenger": "x", "challenge": "stub", "stance": "pushback"}

    monkeypatch.setattr(
        "arena.routes.agent.run_challenge",
        _no_llm,
    )

    user = make_user(email="chal-rl@test.com", tier=UserTier.PRO)
    body = {
        "task_id": "",
        "task": "Should we ship?",
        "answer": "Yes, ship the smallest slice.",
    }
    last = None
    for _ in range(4):
        last = await app_client.post(
            "/api/agent/challenge",
            headers=_headers(user),
            json=body,
        )
    assert last is not None
    assert last.status_code == 429, last.text
    detail = last.json().get("detail") or last.json()
    if isinstance(detail, dict):
        assert detail.get("error") == "rate_limit_exceeded"


@pytest.mark.asyncio
async def test_rebuttal_is_rate_limited(app_client, make_user, monkeypatch):
    _patch_scope_limit(monkeypatch, "agent_rebuttal", max_hits=2)

    async def _fake_llm(*_a, **_k):
        return ("stub rebuttal", 0, 0)

    monkeypatch.setattr("arena.routes.agent.call_llm", _fake_llm)

    user = make_user(email="reb-rl@test.com", tier=UserTier.PRO)
    body = {
        "task": "Ship?",
        "answer": "Yes.",
        "challenge": "What about latency?",
    }
    last = None
    for _ in range(4):
        last = await app_client.post(
            "/api/agent/rebuttal",
            headers=_headers(user),
            json=body,
        )
    assert last is not None
    assert last.status_code == 429, last.text


@pytest.mark.asyncio
async def test_refine_is_rate_limited(app_client, make_user, monkeypatch):
    _patch_scope_limit(monkeypatch, "agent_refine", max_hits=2)

    user = make_user(email="ref-rl@test.com", tier=UserTier.PRO)
    body = {"task_id": "missing-task", "message": "Make it shorter"}
    last = None
    for _ in range(4):
        last = await app_client.post(
            "/api/agent/refine",
            headers=_headers(user),
            json=body,
        )
    assert last is not None
    # Rate limit fires before task lookup.
    assert last.status_code == 429, last.text
