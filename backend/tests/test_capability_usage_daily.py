"""Daily trend added to /api/agent/capability-usage."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UsageRecord, UserTier


def _make_record(*, user_id, mode, prompt_category="question", days_ago=0):
    from datetime import timedelta

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return UsageRecord(
        user_id=user_id,
        mode=mode,
        prompt_category=prompt_category,
        input_tokens=10,
        output_tokens=20,
        estimated_cost_usd=0.0,
        request_id=f"req-{user_id}-{mode}-{days_ago}-{now.timestamp()}",
        timestamp=now - timedelta(days=days_ago),
    )


@pytest.mark.asyncio
async def test_capability_usage_daily_trend_is_present(app_client, make_user, db_session):
    user = make_user(email="cap-daily@test.com", tier=UserTier.PRO)
    db_session.add(_make_record(user_id=user.id, mode="agent", days_ago=0))
    db_session.add(_make_record(user_id=user.id, mode="arena", days_ago=0))
    db_session.add(_make_record(user_id=user.id, mode="agent", days_ago=1))
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/agent/capability-usage", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert "daily_trend" in body
    assert len(body["daily_trend"]) == 30
    days = [entry["date"] for entry in body["daily_trend"]]
    assert days == sorted(days)
    # Last two days (most recent) should be the only non-zero ones.
    nonzero = [
        entry
        for entry in body["daily_trend"]
        if entry["agent"] > 0 or entry["web"] > 0
    ]
    assert len(nonzero) == 2
    today = body["daily_trend"][-1]
    assert today["agent"] == 1
    assert today["web"] == 1
    yesterday = body["daily_trend"][-2]
    assert yesterday["agent"] == 1
    assert yesterday["web"] == 0


@pytest.mark.asyncio
async def test_capability_usage_daily_trend_separates_agent_and_web(
    app_client, make_user, db_session
):
    user = make_user(email="cap-daily-bucket@test.com", tier=UserTier.PRO)
    # 3 web + 2 agent on the same day.
    for _ in range(3):
        db_session.add(_make_record(user_id=user.id, mode="arena", days_ago=0))
    for _ in range(2):
        db_session.add(_make_record(user_id=user.id, mode="agent", days_ago=0))
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    body = (await app_client.get("/api/agent/capability-usage", headers=headers)).json()
    today = body["daily_trend"][-1]
    assert today["agent"] == 2
    assert today["web"] == 3


@pytest.mark.asyncio
async def test_capability_usage_daily_trend_pads_to_window(
    app_client, make_user
):
    user = make_user(email="cap-daily-pad@test.com", tier=UserTier.PRO)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    body = (
        await app_client.get(
            "/api/agent/capability-usage?days=14", headers=headers
        )
    ).json()
    assert len(body["daily_trend"]) == 14