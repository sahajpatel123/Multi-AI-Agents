"""Watchlist PATCH/DELETE mutations must be per-user rate-limited."""

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
async def test_watchlist_patch_rate_limited(app_client, make_user):
    user = make_user(email="watchlist-patch-rl@test.com", tier=UserTier.PRO)
    _fill("watchlist_update", user.id, 60)
    res = await app_client.patch(
        "/api/agent/watchlist/any-item",
        headers=_headers(user),
        json={"is_active": False},
    )
    assert res.status_code == 429, res.text[:300]
    assert res.json().get("detail", {}).get("error") == "rate_limit_exceeded"
    _clear()


@pytest.mark.asyncio
async def test_watchlist_delete_rate_limited(app_client, make_user):
    user = make_user(email="watchlist-delete-rl@test.com", tier=UserTier.PRO)
    _fill("watchlist_delete", user.id, 30)
    res = await app_client.delete(
        "/api/agent/watchlist/any-item",
        headers=_headers(user),
    )
    assert res.status_code == 429, res.text[:300]
    assert res.json().get("detail", {}).get("error") == "rate_limit_exceeded"
    _clear()
