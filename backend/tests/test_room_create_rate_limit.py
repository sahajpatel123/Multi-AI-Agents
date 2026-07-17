"""Room creation must be per-user rate-limited.

Each create allocates a Room + membership and may schedule LLM synthesis.
Without a cap an authenticated client can mass-create rooms.
"""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


@pytest.mark.asyncio
async def test_room_create_is_rate_limited(app_client, make_user, monkeypatch):
    from arena.core import rate_limits

    hits = {"n": 0}
    real_hit = rate_limits.rate_limiter.hit

    def limited_hit(key, *, limit, window_seconds, message):
        if "user:room_create:" in key:
            hits["n"] += 1
            if hits["n"] > 2:
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

    user = make_user(email="room-rl@test.com", tier=UserTier.PRO)
    last = None
    for i in range(4):
        last = await app_client.post(
            "/api/rooms/create",
            headers=_headers(user),
            json={"name": f"Board {i}"},
        )
    assert last is not None
    assert last.status_code == 429, last.text
