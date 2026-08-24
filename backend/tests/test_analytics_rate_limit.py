"""Analytics write/read paths must be rate-limited."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


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


@pytest.mark.asyncio
async def test_shared_read_aloud_event_is_recorded_with_agent_id(app_client, db_session):
    """Public-share listen events use the agent field, not persona attribution."""
    from arena.db_models import UXEvent

    res = await app_client.post(
        "/api/analytics/event",
        json={
            "session_id": "shared-read-aloud-test",
            "event_type": "shared_read_aloud",
            "agent_id": "agent_1",
        },
    )

    assert res.status_code == 200, res.text
    event = (
        db_session.query(UXEvent)
        .filter(UXEvent.session_id == "shared-read-aloud-test")
        .one()
    )
    assert event.event_type == "shared_read_aloud"
    assert event.persona_id is None
    assert event.agent_id == "agent_1"


@pytest.mark.asyncio
async def test_analytics_summary_rate_limited(app_client, make_user, monkeypatch):
    from arena.core import rate_limits

    hits = {"n": 0}
    real_hit = rate_limits.rate_limiter.hit

    def limited_hit(key, *, limit, window_seconds, message):
        if key.startswith("user:analytics_summary:"):
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

    user = make_user(email="analytics-summary-rl@test.com", tier=UserTier.PLUS)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/analytics/summary", headers=headers)
    assert res.status_code == 429, res.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("path", "scope"),
    [
        ("/api/analytics/summary/export.json", "analytics_summary_json"),
        ("/api/analytics/summary/export.csv", "analytics_summary_csv"),
        ("/api/analytics/summary/export.md", "analytics_summary_markdown"),
    ],
)
async def test_analytics_summary_exports_use_only_their_own_rate_budget(
    app_client, make_user, monkeypatch, path, scope
):
    """A summary download must not also consume dashboard refresh capacity."""
    from arena.core import rate_limits

    keys: list[str] = []
    real_hit = rate_limits.rate_limiter.hit

    def recording_hit(key, *, limit, window_seconds, message):
        keys.append(key)
        return real_hit(key, limit=limit, window_seconds=window_seconds, message=message)

    monkeypatch.setattr(rate_limits.rate_limiter, "hit", recording_hit)

    user = make_user(email=f"{scope}-budget@test.com", tier=UserTier.PRO)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(path, headers=headers)

    assert res.status_code == 200, res.text
    assert f"user:{scope}:{user.id}" in keys
    assert f"user:analytics_summary:{user.id}" not in keys


@pytest.mark.asyncio
async def test_analytics_activity_csv_rate_limited(app_client, make_user, monkeypatch):
    """The CSV export has its own hourly budget and rejects when exhausted."""
    from arena.core import rate_limits

    hits = {"n": 0}
    real_hit = rate_limits.rate_limiter.hit

    def limited_hit(key, *, limit, window_seconds, message):
        if key.startswith("user:analytics_activity_csv:"):
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

    user = make_user(email="analytics-activity-csv-rl@test.com", tier=UserTier.PRO)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/analytics/activity/export.csv", headers=headers)
    assert res.status_code == 429, res.text


@pytest.mark.asyncio
async def test_analytics_activity_csv_keeps_own_rate_budget(
    app_client, make_user, monkeypatch
):
    """Exporting the activity CSV must not consume the JSON endpoint's budget."""
    from arena.core import rate_limits

    keys: list[str] = []
    real_hit = rate_limits.rate_limiter.hit

    def recording_hit(key, *, limit, window_seconds, message):
        keys.append(key)
        return real_hit(key, limit=limit, window_seconds=window_seconds, message=message)

    monkeypatch.setattr(rate_limits.rate_limiter, "hit", recording_hit)

    user = make_user(email="analytics-activity-csv-budget@test.com", tier=UserTier.PRO)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/analytics/activity/export.csv?days=7", headers=headers
    )
    assert res.status_code == 200, res.text
    assert f"user:analytics_activity_csv:{user.id}" in keys
    assert f"user:analytics_activity:{user.id}" not in keys
