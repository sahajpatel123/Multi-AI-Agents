"""Watchlist list/history reads must be per-user rate-limited."""

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
async def test_watchlist_list_rate_limited(app_client, make_user):
    user = make_user(email="wl-list-rl@test.com", tier=UserTier.PRO)
    _fill("agent_watchlist_list", user.id, 120)
    res = await app_client.get("/api/agent/watchlist", headers=_headers(user))
    assert res.status_code == 429, res.text[:300]
    assert res.json().get("detail", {}).get("error") == "rate_limit_exceeded"
    _clear()


@pytest.mark.asyncio
async def test_watchlist_history_rate_limited(app_client, make_user):
    user = make_user(email="wl-hist-rl@test.com", tier=UserTier.PRO)
    _fill("agent_watchlist_history", user.id, 60)
    res = await app_client.get(
        "/api/agent/watchlist/any-item/history",
        headers=_headers(user),
    )
    assert res.status_code == 429, res.text[:300]
    assert res.json().get("detail", {}).get("error") == "rate_limit_exceeded"
    _clear()
