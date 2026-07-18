"""Dashboard aggregate endpoints must be per-user rate-limited."""

from __future__ import annotations

from collections import deque
import time

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _fill_bucket(scope: str, user_id: int, n: int = 60) -> None:
    from arena.core import rate_limits as _rl

    if hasattr(_rl.rate_limiter, "_events"):
        _rl.rate_limiter._events.clear()
    key = f"user:{scope}:{user_id}"
    _rl.rate_limiter._events[key] = deque([time.time()] * n)


def _clear() -> None:
    from arena.core import rate_limits as _rl

    if hasattr(_rl.rate_limiter, "_events"):
        _rl.rate_limiter._events.clear()


@pytest.mark.asyncio
async def test_metrics_rate_limited(app_client, make_user):
    user = make_user(email="dash-metrics-rl@test.com", tier=UserTier.PRO)
    _fill_bucket("agent_metrics", user.id)
    res = await app_client.get("/api/agent/metrics", headers=_headers(user))
    assert res.status_code == 429, res.text[:300]
    assert res.json().get("detail", {}).get("error") == "rate_limit_exceeded"
    _clear()


@pytest.mark.asyncio
async def test_feedback_summary_rate_limited(app_client, make_user):
    user = make_user(email="dash-fbsum-rl@test.com", tier=UserTier.PRO)
    _fill_bucket("agent_feedback_summary", user.id)
    res = await app_client.get("/api/agent/feedback/summary", headers=_headers(user))
    assert res.status_code == 429, res.text[:300]
    assert res.json().get("detail", {}).get("error") == "rate_limit_exceeded"
    _clear()


@pytest.mark.asyncio
async def test_temporal_evolution_rate_limited(app_client, make_user):
    user = make_user(email="dash-evo-rl@test.com", tier=UserTier.PRO)
    _fill_bucket("agent_temporal_evolution", user.id)
    res = await app_client.get(
        "/api/agent/history/any-task/evolution",
        headers=_headers(user),
    )
    assert res.status_code == 429, res.text[:300]
    assert res.json().get("detail", {}).get("error") == "rate_limit_exceeded"
    _clear()
