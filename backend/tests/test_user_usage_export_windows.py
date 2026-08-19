"""Coverage for configurable user-usage export windows."""

from __future__ import annotations

import csv
import io
from datetime import timedelta

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import UserTier


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
