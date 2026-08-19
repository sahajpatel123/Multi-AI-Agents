"""Coverage for configurable user-usage export windows."""

from __future__ import annotations

import csv
import io
from datetime import datetime, time, timedelta

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import UsageRecord, UserTier
from arena.routes import auth as auth_routes


@pytest.mark.asyncio
@pytest.mark.parametrize("extension", ["csv", "json", "md"])
async def test_usage_exports_honor_custom_window(
    app_client,
    make_user,
    extension: str,
):
    user = make_user(
        email=f"usage-window-{extension}@test.com",
        tier=UserTier.FREE,
    )
    res = await app_client.get(
        f"/api/user/usage/export.{extension}?window_days=7",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    today = utcnow_naive().date()
    start = (today - timedelta(days=6)).isoformat()
    end = today.isoformat()
    assert f"{start}-to-{end}" in res.headers["content-disposition"]

    if extension == "csv":
        rows = list(csv.reader(io.StringIO(res.text)))
        assert len(rows) == 9  # header + 7 daily rows + summary footer
        daily_rows = rows[1:-1]
        assert daily_rows[0][0] == start
        assert daily_rows[-1][0] == end
    elif extension == "json":
        body = res.json()
        assert body["start_date"] == start
        assert body["end_date"] == end
        assert len(body["history"]) == 7
    else:
        assert f"**Window:** {start} → {end} (7 days, UTC)" in res.text
        assert res.text.count("| Date | Tokens |") == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("extension", ["csv", "json", "md"])
@pytest.mark.parametrize("window_days", [0, 366])
async def test_usage_exports_reject_out_of_bounds_window(
    app_client,
    make_user,
    extension: str,
    window_days: int,
):
    user = make_user(
        email=f"usage-window-bound-{extension}-{window_days}@test.com",
        tier=UserTier.FREE,
    )
    res = await app_client.get(
        f"/api/user/usage/export.{extension}?window_days={window_days}",
        headers=_pro_headers(user),
    )

    assert res.status_code == 422


@pytest.mark.asyncio
async def test_usage_export_snapshots_utc_day_for_history_and_summary(
    app_client,
    make_user,
    db_session,
    monkeypatch,
):
    """A request crossing midnight must not mix two UTC calendar days."""
    user = make_user(email="usage-window-midnight@test.com", tier=UserTier.FREE)
    db_session.add(
        UsageRecord(
            user_id=user.id,
            request_id="usage-window-midnight-record",
            mode="arena",
            input_tokens=100,
            output_tokens=0,
            estimated_cost_usd=0.0,
            total_processing_ms=10,
            timestamp=datetime.combine(datetime(2026, 8, 18).date(), time(12, 0)),
        )
    )
    db_session.commit()

    aggregation_now = datetime(2026, 8, 18, 23, 59, 59)
    next_day = datetime(2026, 8, 19, 0, 0, 1)
    clock = iter((aggregation_now, next_day))
    monkeypatch.setattr(auth_routes, "utcnow_naive", lambda: next(clock))

    res = await app_client.get(
        "/api/user/usage/export.csv?window_days=1",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(res.text)))
    assert rows[1] == ["2026-08-18", "100"]
    assert "credits_used_today=100" in rows[-1][0]
    assert "2026-08-18-to-2026-08-18" in res.headers["content-disposition"]
