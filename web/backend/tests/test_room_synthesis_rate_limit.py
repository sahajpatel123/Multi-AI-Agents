"""Room synthesis schedule paths must share a per-user rate limit.

force=true, add-task, and remove-task each kick off LLM synthesis.
Without a shared cap a member can thrash the board and burn quota.
"""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _patch_room_synthesis(monkeypatch, max_hits: int = 0):
    from arena.core import rate_limits

    hits = {"n": 0}
    real_hit = rate_limits.rate_limiter.hit

    def limited_hit(key, *, limit, window_seconds, message):
        if "user:room_synthesis:" in key:
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


@pytest.mark.asyncio
async def test_force_synthesis_is_rate_limited(app_client, make_user, monkeypatch):
    _patch_room_synthesis(monkeypatch, max_hits=0)

    user = make_user(email="syn-force@test.com", tier=UserTier.PRO)
    # Create a room first (uses room_create budget, not synthesis).
    created = await app_client.post(
        "/api/rooms/create",
        headers=_headers(user),
        json={"name": "Synth Board"},
    )
    assert created.status_code == 200, created.text
    slug = created.json()["slug"]

    forced = await app_client.get(
        f"/api/rooms/{slug}/synthesis",
        params={"force": "true"},
        headers=_headers(user),
    )
    assert forced.status_code == 429, forced.text


@pytest.mark.asyncio
async def test_watchlist_create_is_rate_limited(app_client, make_user, monkeypatch):
    from arena.core import rate_limits

    hits = {"n": 0}
    real_hit = rate_limits.rate_limiter.hit

    def limited_hit(key, *, limit, window_seconds, message):
        if "user:watchlist_create:" in key:
            hits["n"] += 1
            if hits["n"] > 0:
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

    user = make_user(email="wl-rl@test.com", tier=UserTier.PRO)
    last = await app_client.post(
        "/api/agent/watchlist",
        headers=_headers(user),
        json={"question": "Will rates cut?", "interval_hours": 24},
    )
    assert last.status_code == 429, last.text
