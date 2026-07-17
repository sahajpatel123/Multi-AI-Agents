"""Feedback and calibration write paths must be per-user rate-limited."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _patch_scope(monkeypatch, scope: str):
    from arena.core import rate_limits

    hits = {"n": 0}
    real_hit = rate_limits.rate_limiter.hit

    def limited_hit(key, *, limit, window_seconds, message):
        if f"user:{scope}:" in key:
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


@pytest.mark.asyncio
async def test_agent_feedback_rate_limited(app_client, make_user, monkeypatch):
    _patch_scope(monkeypatch, "agent_feedback")
    user = make_user(email="fb-rl@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/agent/feedback",
        headers=_headers(user),
        json={"task_id": "missing", "feedback": "accurate"},
    )
    assert res.status_code == 429, res.text


@pytest.mark.asyncio
async def test_calibration_rate_limited(app_client, make_user, monkeypatch):
    _patch_scope(monkeypatch, "calibration_rate")
    user = make_user(email="cal-rl@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/calibration/rate",
        headers=_headers(user),
        json={"task_id": "abcdefgh", "rating": 3},
    )
    assert res.status_code == 429, res.text
