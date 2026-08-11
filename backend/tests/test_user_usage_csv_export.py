"""Integration tests for GET /api/user/usage/export.csv.

The usage CSV export mirrors the Profile modal's 14-day usage chart so
spreadsheet consumers get the same daily token totals and current-period
summary without reimplementing the aggregation.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import date, datetime, time, timedelta

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import UsageRecord, UserTier
from arena.routes.auth import _CSV_FORMULA_PREFIXES, _csv_safe


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


def _parse_csv(text: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(text)))


@pytest.mark.asyncio
async def test_usage_csv_requires_auth(app_client):
    res = await app_client.get("/api/user/usage/export.csv")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_usage_csv_is_zero_for_new_user(app_client, make_user):
    user = make_user(email="usagecsv-empty@test.com", tier=UserTier.FREE)
    res = await app_client.get(
        "/api/user/usage/export.csv", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")

    rows = _parse_csv(res.text)
    assert rows[0] == ["date", "tokens"]
    # Header + 14 day rows + 1 footer rollup row.
    assert len(rows) == 16
    for row in rows[1:-1]:
        assert int(row[1]) == 0


@pytest.mark.asyncio
async def test_usage_csv_rows_match_json_usage_history(
    app_client, make_user, db_session
):
    """The CSV must not drift from /api/user/usage's daily history."""
    user = make_user(email="usagecsv-json@test.com", tier=UserTier.FREE)
    _seed_records(db_session, user.id, [(0, 150), (3, 300), (10, 75)])

    csv_res = await app_client.get(
        "/api/user/usage/export.csv", headers=_pro_headers(user)
    )
    json_res = await app_client.get("/api/user/usage", headers=_pro_headers(user))
    assert csv_res.status_code == 200
    assert json_res.status_code == 200

    csv_rows = _parse_csv(csv_res.text)[1:-1]
    json_history = json_res.json()["usage_history"]
    assert len(csv_rows) == len(json_history) == 14
    for csv_row, json_tokens in zip(csv_rows, json_history):
        assert int(csv_row[1]) == json_tokens


@pytest.mark.asyncio
async def test_usage_csv_footer_matches_json_usage(
    app_client, make_user, db_session
):
    """Footer values must equal the JSON usage endpoint's summary fields."""
    user = make_user(email="usagecsv-footer@test.com", tier=UserTier.FREE)
    _seed_records(db_session, user.id, [(0, 100), (0, 50), (1, 200), (6, 75)])

    csv_res = await app_client.get(
        "/api/user/usage/export.csv", headers=_pro_headers(user)
    )
    json_res = await app_client.get("/api/user/usage", headers=_pro_headers(user))
    json_body = json_res.json()
    footer = _parse_csv(csv_res.text)[-1]

    assert f"credits_used_today={json_body['credits_used_today']}" in footer[0]
    assert f"credits_remaining_today={json_body['credits_remaining_today']}" in footer[1]
    assert f"daily_limit={json_body['daily_limit']}" in footer[2]
    assert f"credits_used_week={json_body['credits_used_week']}" in footer[3]
    assert f"credits_remaining_week={json_body['credits_remaining_week']}" in footer[4]
    assert f"weekly_limit={json_body['weekly_limit']}" in footer[5]
    assert f"total_tasks_month={json_body['total_tasks_month']}" in footer[6]


@pytest.mark.asyncio
async def test_usage_csv_filename_and_security_headers(app_client, make_user):
    user = make_user(email="usagecsv-sec@test.com", tier=UserTier.FREE)
    res = await app_client.get(
        "/api/user/usage/export.csv", headers=_pro_headers(user)
    )
    assert res.status_code == 200

    cd = res.headers["content-disposition"]
    assert cd.startswith("attachment; filename=")
    assert "arena-usage-" in cd
    assert ".csv" in cd
    assert utcnow_naive().date().isoformat() in cd
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-content-type-options"] == "nosniff"


@pytest.mark.asyncio
async def test_usage_csv_uses_separate_rate_limit_scope(
    app_client, make_user, db_session
):
    """Exporting must not consume /api/user/usage's per-minute budget."""
    user = make_user(email="usagecsv-rate@test.com", tier=UserTier.FREE)
    for _ in range(3):
        csv_res = await app_client.get(
            "/api/user/usage/export.csv", headers=_pro_headers(user)
        )
        assert csv_res.status_code == 200
    # The JSON endpoint remains callable immediately after CSV exports.
    json_res = await app_client.get("/api/user/usage", headers=_pro_headers(user))
    assert json_res.status_code == 200


@pytest.mark.asyncio
async def test_usage_csv_covers_exact_window_oldest_first_zero_filled(
    app_client, make_user, db_session
):
    """The 14 rows are consecutive UTC dates, oldest first, and out-of-window
    records never leak into the export."""
    user = make_user(email="usagecsv-window@test.com", tier=UserTier.FREE)
    _seed_records(db_session, user.id, [(0, 100), (2, 50), (20, 999)])

    res = await app_client.get(
        "/api/user/usage/export.csv", headers=_pro_headers(user)
    )
    assert res.status_code == 200

    rows = _parse_csv(res.text)
    day_rows = rows[1:-1]
    today = utcnow_naive().date()
    assert len(day_rows) == 14
    assert day_rows[0][0] == (today - timedelta(days=13)).isoformat()
    assert day_rows[-1][0] == today.isoformat()

    dates = [row[0] for row in day_rows]
    assert dates == sorted(dates)
    assert all(
        (date.fromisoformat(b) - date.fromisoformat(a)).days == 1
        for a, b in zip(dates, dates[1:])
    )

    tokens = [int(row[1]) for row in day_rows]
    assert 999 not in tokens
    assert tokens[0] == 0  # 13 days ago
    assert tokens[11] == 50  # 2 days ago
    assert tokens[-1] == 100  # today


@pytest.mark.parametrize("prefix", _CSV_FORMULA_PREFIXES)
def test_csv_safe_neutralizes_formula_prefix(prefix: str) -> None:
    """CSV cells starting with spreadsheet formula triggers are neutralized."""
    assert _csv_safe(f"{prefix}SUM(A1:A2)") == f"'{prefix}SUM(A1:A2)"


def test_csv_safe_passes_through_safe_values() -> None:
    assert _csv_safe("2026-08-11") == "2026-08-11"
    assert _csv_safe(150) == "150"
    assert _csv_safe("") == ""
    assert _csv_safe(None) == ""
