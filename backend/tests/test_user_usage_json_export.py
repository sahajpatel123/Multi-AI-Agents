"""Integration tests for GET /api/user/usage/export.json.

The JSON usage export is the machine-readable sibling of the usage CSV:
it carries the same 14-day daily token totals with explicit dates plus the
current-period summary from /api/user/usage.
"""

from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import UsageRecord, UserTier


def _seed_records(db, user_id: int, events: list[tuple[int, int]]) -> None:
    """Insert one UsageRecord per (days_ago, token_total) at noon UTC."""
    today = utcnow_naive().date()
    for days_ago, total_tokens in events:
        target_day = today - timedelta(days=days_ago)
        ts = datetime.combine(target_day, time(12, 0))
        db.add(
            UsageRecord(
                user_id=user_id,
                request_id=str(uuid.uuid4()),
                mode="arena",
                input_tokens=total_tokens,
                output_tokens=0,
                estimated_cost_usd=0.0,
                total_processing_ms=10,
                timestamp=ts,
            )
        )
    db.commit()


@pytest.mark.asyncio
async def test_usage_json_requires_auth(app_client):
    res = await app_client.get("/api/user/usage/export.json")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_usage_json_is_zero_filled_for_new_user(app_client, make_user):
    user = make_user(email="usagejson-empty@test.com", tier=UserTier.FREE)
    res = await app_client.get(
        "/api/user/usage/export.json", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/json")

    body = res.json()
    assert len(body["history"]) == 14
    assert all(item["tokens"] == 0 for item in body["history"])
    assert body["summary"]["credits_used_today"] == 0
    assert body["summary"]["daily_limit"] > 0


@pytest.mark.asyncio
async def test_usage_json_matches_dashboard_and_csv(
    app_client, make_user, db_session
):
    """The JSON export must not drift from /api/user/usage or the CSV export."""
    user = make_user(email="usagejson-consistency@test.com", tier=UserTier.FREE)
    _seed_records(db_session, user.id, [(0, 150), (3, 300), (10, 75)])

    json_res = await app_client.get(
        "/api/user/usage/export.json", headers=_pro_headers(user)
    )
    dashboard_res = await app_client.get(
        "/api/user/usage", headers=_pro_headers(user)
    )
    csv_res = await app_client.get(
        "/api/user/usage/export.csv", headers=_pro_headers(user)
    )
    assert json_res.status_code == 200
    assert dashboard_res.status_code == 200
    assert csv_res.status_code == 200

    body = json_res.json()
    dashboard = dashboard_res.json()
    assert [item["tokens"] for item in body["history"]] == dashboard["usage_history"]

    summary_keys = (
        "credits_used_today",
        "credits_remaining_today",
        "daily_limit",
        "credits_used_week",
        "credits_remaining_week",
        "weekly_limit",
        "total_tasks_month",
    )
    assert set(body["summary"]) == set(summary_keys)
    for key in summary_keys:
        assert body["summary"][key] == dashboard[key]

    assert "date,tokens" in csv_res.text


@pytest.mark.asyncio
async def test_usage_json_exact_window_oldest_first(
    app_client, make_user, db_session
):
    user = make_user(email="usagejson-window@test.com", tier=UserTier.FREE)
    _seed_records(db_session, user.id, [(0, 100), (2, 50), (20, 999)])

    res = await app_client.get(
        "/api/user/usage/export.json", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    today = utcnow_naive().date()

    assert len(body["history"]) == 14
    assert body["start_date"] == (today - timedelta(days=13)).isoformat()
    assert body["end_date"] == today.isoformat()
    dates = [item["date"] for item in body["history"]]
    assert dates == sorted(dates)
    assert body["history"][0]["tokens"] == 0
    assert body["history"][11]["tokens"] == 50
    assert body["history"][-1]["tokens"] == 100
    assert all(item["tokens"] != 999 for item in body["history"])


@pytest.mark.asyncio
async def test_usage_json_filename_and_security_headers(app_client, make_user):
    user = make_user(email="usagejson-sec@test.com", tier=UserTier.FREE)
    res = await app_client.get(
        "/api/user/usage/export.json", headers=_pro_headers(user)
    )
    assert res.status_code == 200

    cd = res.headers["content-disposition"]
    assert cd.startswith("attachment; filename=")
    assert "arena-usage-" in cd
    assert ".json" in cd
    assert utcnow_naive().date().isoformat() in cd
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-content-type-options"] == "nosniff"


@pytest.mark.asyncio
async def test_usage_json_uses_separate_rate_limit_scope(
    app_client, make_user, db_session
):
    """JSON exports must not consume the dashboard or CSV export budgets."""
    user = make_user(email="usagejson-rate@test.com", tier=UserTier.FREE)
    for _ in range(3):
        json_res = await app_client.get(
            "/api/user/usage/export.json", headers=_pro_headers(user)
        )
        assert json_res.status_code == 200

    dashboard_res = await app_client.get(
        "/api/user/usage", headers=_pro_headers(user)
    )
    csv_res = await app_client.get(
        "/api/user/usage/export.csv", headers=_pro_headers(user)
    )
    assert dashboard_res.status_code == 200
    assert csv_res.status_code == 200
