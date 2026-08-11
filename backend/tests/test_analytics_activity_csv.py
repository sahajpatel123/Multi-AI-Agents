"""Integration tests for GET /api/analytics/activity/export.csv.

The activity CSV export mirrors the JSON /analytics/activity timeline so
spreadsheet consumers get the same per-day counters, totals, streaks, and
busiest-day summary without reimplementing the aggregation.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, time, timedelta

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import UsageRecord, UserTier


def _seed_records(db, user_id: int, events: list[tuple[int, str]]) -> None:
    """Insert one UsageRecord per (days_ago, mode) tuple at noon UTC."""
    today = utcnow_naive().date()
    for days_ago, mode in events:
        target_day = today - timedelta(days=days_ago)
        ts = datetime.combine(target_day, time(12, 0))
        db.add(
            UsageRecord(
                user_id=user_id,
                request_id=str(uuid.uuid4()),
                mode=mode,
                input_tokens=1,
                output_tokens=1,
                estimated_cost_usd=0.0,
                total_processing_ms=10,
                timestamp=ts,
            )
        )
    db.commit()


def _parse_csv(text: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(text)))


# ─── Auth + parameter validation ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_csv_requires_auth(app_client):
    res = await app_client.get("/api/analytics/activity/export.csv")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_activity_csv_rejects_zero_days(app_client, make_user):
    user = make_user(email="actcsv-zero@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity/export.csv?days=0", headers=_pro_headers(user)
    )
    assert res.status_code == 422


# ─── Core shape ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_csv_is_zero_for_new_user(app_client, make_user):
    user = make_user(email="actcsv-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity/export.csv?days=7",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    rows = _parse_csv(res.text)
    # Header + 7 day rows + 1 footer rollup row.
    assert rows[0] == ["date", "prompts", "debates", "discusses", "agent_runs"]
    assert len(rows) == 1 + 7 + 1
    for row in rows[1:-1]:
        assert int(row[1]) == 0
        assert int(row[2]) == 0
        assert int(row[3]) == 0
        assert int(row[4]) == 0


@pytest.mark.asyncio
async def test_activity_csv_rows_match_json_timeline(
    app_client, make_user, db_session
):
    """The CSV must not drift from the JSON activity timeline's per-day shape."""
    user = make_user(email="actcsv-json@test.com", tier=UserTier.PRO)
    _seed_records(
        db_session,
        user.id,
        [
            (0, "arena"),
            (0, "debate"),
            (1, "discuss"),
            (2, "agent"),
            (2, "arena"),
        ],
    )

    csv_res = await app_client.get(
        "/api/analytics/activity/export.csv?days=7",
        headers=_pro_headers(user),
    )
    json_res = await app_client.get(
        "/api/analytics/activity?days=7",
        headers=_pro_headers(user),
    )
    assert csv_res.status_code == 200
    assert json_res.status_code == 200

    csv_rows = _parse_csv(csv_res.text)
    json_rows = json_res.json()["activity"]

    assert len(csv_rows) == 1 + len(json_rows) + 1
    for csv_row, json_row in zip(csv_rows[1:-1], json_rows):
        assert csv_row[0] == json_row["date"]
        assert int(csv_row[1]) == json_row["prompts"]
        assert int(csv_row[2]) == json_row["debates"]
        assert int(csv_row[3]) == json_row["discusses"]
        assert int(csv_row[4]) == json_row["agent_runs"]


@pytest.mark.asyncio
async def test_activity_csv_row_order_is_chronological(
    app_client, make_user, db_session
):
    """Rows are oldest-first — matches the JSON activity contract."""
    user = make_user(email="actcsv-order@test.com", tier=UserTier.PRO)
    _seed_records(db_session, user.id, [(0, "arena"), (2, "debate")])

    res = await app_client.get(
        "/api/analytics/activity/export.csv?days=7",
        headers=_pro_headers(user),
    )
    data_rows = _parse_csv(res.text)[1:-1]  # strip header + footer
    dates = [row[0] for row in data_rows]
    assert dates == sorted(dates)
    assert dates[-1] == utcnow_naive().date().isoformat()


# ─── Filename + headers ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_csv_filename_includes_window(app_client, make_user):
    user = make_user(email="actcsv-name@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity/export.csv?days=7",
        headers=_pro_headers(user),
    )
    cd = res.headers["content-disposition"]
    assert cd.startswith("attachment; filename=")
    assert "arena-activity-" in cd
    assert ".csv" in cd
    assert utcnow_naive().date().isoformat() in cd


@pytest.mark.asyncio
async def test_activity_csv_has_security_headers(app_client, make_user):
    user = make_user(email="actcsv-sec@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity/export.csv?days=7",
        headers=_pro_headers(user),
    )
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-content-type-options"] == "nosniff"


# ─── Footer rollup ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_csv_footer_matches_json_rollup(
    app_client, make_user, db_session
):
    """Footer values must equal the JSON endpoint's rollup fields."""
    user = make_user(email="actcsv-footer@test.com", tier=UserTier.PRO)
    _seed_records(
        db_session,
        user.id,
        [(0, "arena"), (0, "debate"), (1, "agent"), (1, "arena"), (3, "discuss")],
    )

    csv_res = await app_client.get(
        "/api/analytics/activity/export.csv?days=7",
        headers=_pro_headers(user),
    )
    json_res = await app_client.get(
        "/api/analytics/activity?days=7",
        headers=_pro_headers(user),
    )
    json_body = json_res.json()
    footer = _parse_csv(csv_res.text)[-1]

    assert f"total_prompts={json_body['totals']['prompts']}" in footer[0]
    assert f"total_debates={json_body['totals']['debates']}" in footer[1]
    assert f"total_discusses={json_body['totals']['discusses']}" in footer[2]
    assert f"total_agent_runs={json_body['totals']['agent_runs']}" in footer[3]
    assert f"active_days={json_body['active_days']}" in footer[4]
    assert f"current_streak={json_body['current_streak']}" in footer[5]
    assert f"longest_streak={json_body['longest_streak']}" in footer[6]
    assert f"busiest_day={json_body['busiest_day'] or ''}" in footer[7]
    assert f"busiest_day_count={json_body['busiest_day_count']}" in footer[8]
