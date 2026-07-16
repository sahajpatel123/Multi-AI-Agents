"""Anonymous analytics write path must be IP-rate-limited."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_analytics_event_rate_limited(app_client, monkeypatch):
    from arena.core import rate_limits

    # Tiny limit so we trip quickly without 120 sequential posts.
    hits = {"n": 0}
    real_hit = rate_limits.rate_limiter.hit

    def limited_hit(key, *, limit, window_seconds, message):
        if key.startswith("ip:analytics_event:"):
            hits["n"] += 1
            if hits["n"] > 3:
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

    body = {
        "session_id": "sess-rate-1",
        "event_type": "card_click",
    }
    last = None
    for _ in range(5):
        last = await app_client.post("/api/analytics/event", json=body)
    assert last is not None
    assert last.status_code == 429, last.text
