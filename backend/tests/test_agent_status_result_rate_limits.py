"""Agent status/result poll paths must be per-user rate-limited."""

from __future__ import annotations

from collections import deque
import time

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _fill(scope: str, user_id: int, n: int) -> None:
    from arena.core import rate_limits as _rl

    if hasattr(_rl.rate_limiter, "_events"):
        _rl.rate_limiter._events.clear()
    _rl.rate_limiter._events[f"user:{scope}:{user_id}"] = deque([time.time()] * n)


def _clear() -> None:
    from arena.core import rate_limits as _rl

    if hasattr(_rl.rate_limiter, "_events"):
        _rl.rate_limiter._events.clear()


@pytest.mark.asyncio
async def test_status_rate_limited(app_client, make_user):
    user = make_user(email="status-rl@test.com", tier=UserTier.PRO)
    _fill("agent_status", user.id, 300)
    res = await app_client.get("/api/agent/status/any-task", headers=_headers(user))
    assert res.status_code == 429, res.text[:300]
    assert res.json().get("detail", {}).get("error") == "rate_limit_exceeded"
    _clear()


@pytest.mark.asyncio
async def test_result_rate_limited(app_client, make_user):
    user = make_user(email="result-rl@test.com", tier=UserTier.PRO)
    _fill("agent_result", user.id, 120)
    res = await app_client.get("/api/agent/result/any-task", headers=_headers(user))
    assert res.status_code == 429, res.text[:300]
    assert res.json().get("detail", {}).get("error") == "rate_limit_exceeded"
    _clear()
