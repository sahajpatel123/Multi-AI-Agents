"""Integration tests for GET /api/user/usage/export.md."""

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
        db.add(
            UsageRecord(
                user_id=user_id,
                request_id=str(uuid.uuid4()),
                mode="arena",
                input_tokens=total_tokens,
                output_tokens=0,
                estimated_cost_usd=0.0,
                total_processing_ms=10,
                timestamp=datetime.combine(target_day, time(12, 0)),
            )
        )
    db.commit()


@pytest.mark.asyncio
async def test_usage_markdown_requires_auth(app_client):
    res = await app_client.get("/api/user/usage/export.md")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_usage_markdown_is_zero_filled_for_new_user(app_client, make_user):
    user = make_user(email="usagemd-empty@test.com", tier=UserTier.FREE)
    res = await app_client.get(
        "/api/user/usage/export.md", headers=_pro_headers(user)
    )

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/markdown")
    assert "# Arena — usage report" in res.text
    assert "## Quota snapshot" in res.text
    assert "## Daily token history" in res.text
    assert res.text.count("| ") >= 22  # 7 summary rows + 14 history rows + headers
    assert "| Credits used today | 0 |" in res.text
    assert "| Tasks this month | 0 |" in res.text


@pytest.mark.asyncio
async def test_usage_markdown_matches_dashboard_and_json(
    app_client, make_user, db_session
):
    user = make_user(email="usagemd-consistency@test.com", tier=UserTier.FREE)
    _seed_records(db_session, user.id, [(0, 150), (3, 300), (10, 75), (20, 999)])

    markdown_res = await app_client.get(
        "/api/user/usage/export.md", headers=_pro_headers(user)
    )
    dashboard_res = await app_client.get(
        "/api/user/usage", headers=_pro_headers(user)
    )
    json_res = await app_client.get(
        "/api/user/usage/export.json", headers=_pro_headers(user)
    )
    assert markdown_res.status_code == dashboard_res.status_code == json_res.status_code == 200

    markdown = markdown_res.text
    dashboard = dashboard_res.json()
    exported = json_res.json()
    for label, key in (
        ("Credits used today", "credits_used_today"),
        ("Credits remaining today", "credits_remaining_today"),
        ("Daily limit", "daily_limit"),
        ("Credits used this week", "credits_used_week"),
        ("Credits remaining this week", "credits_remaining_week"),
        ("Weekly limit", "weekly_limit"),
        ("Tasks this month", "total_tasks_month"),
    ):
        assert f"| {label} | {dashboard[key]} |" in markdown

    for item in exported["history"]:
        assert f"| {item['date']} | {item['tokens']} |" in markdown
    assert "999" not in markdown  # the 20-day-old record is outside the window


@pytest.mark.asyncio
async def test_usage_markdown_filename_and_security_headers(app_client, make_user):
    user = make_user(email="usagemd-sec@test.com", tier=UserTier.FREE)
    res = await app_client.get(
        "/api/user/usage/export.md", headers=_pro_headers(user)
    )

    assert res.status_code == 200
    content_disposition = res.headers["content-disposition"]
    assert content_disposition.startswith("attachment;")
    assert "arena-usage-" in content_disposition
    assert ".md" in content_disposition
    assert utcnow_naive().date().isoformat() in content_disposition
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-content-type-options"] == "nosniff"


@pytest.mark.asyncio
async def test_usage_markdown_uses_separate_rate_limit_scope(
    app_client, make_user
):
    """Markdown exports do not consume the usage dashboard's budget."""
    user = make_user(email="usagemd-rate@test.com", tier=UserTier.FREE)
    for _ in range(3):
        res = await app_client.get(
            "/api/user/usage/export.md", headers=_pro_headers(user)
        )
        assert res.status_code == 200

    dashboard_res = await app_client.get(
        "/api/user/usage", headers=_pro_headers(user)
    )
    assert dashboard_res.status_code == 200
