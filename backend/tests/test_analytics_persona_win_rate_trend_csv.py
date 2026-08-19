"""Integration tests for the flattened persona win-rate trend export."""

from __future__ import annotations

import csv
import io
import uuid
from datetime import timedelta

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import ScoringAudit, UserTier


def _seed_audit(
    db,
    *,
    user_id: int,
    winner_persona_id: str,
    panel: list[str],
    hours_ago: int = 1,
    fallback_used: bool = False,
) -> ScoringAudit:
    rec = ScoringAudit(
        session_id=str(uuid.uuid4()),
        user_id=user_id,
        prompt_snippet="x",
        winner_agent_id="agent-1",
        winner_persona_id=winner_persona_id,
        winner_score=80,
        scores={"agent-1": 80},
        persona_ids_used=panel,
        fallback_used=fallback_used,
        created_at=utcnow_naive() - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


@pytest.mark.asyncio
async def test_trend_export_requires_auth(app_client):
    res = await app_client.get("/api/analytics/persona-win-rate/export-trend.csv")
    assert res.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("query", ["window_days=0", "min_appearances=201"])
async def test_trend_export_rejects_invalid_parameters(app_client, make_user, query):
    user = make_user(email=f"pwr-trend-invalid-{query[0]}.com", tier=UserTier.PRO)
    res = await app_client.get(
        f"/api/analytics/persona-win-rate/export-trend.csv?{query}",
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_trend_export_flattens_the_canonical_weekly_rows(
    app_client, make_user, db_session
):
    """Every flattened row must match the dashboard's nested trend point."""
    user = make_user(email="pwr-trend-csv@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        hours_ago=24 * 8,
    )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="philosopher",
        panel=panel,
        hours_ago=1,
    )
    db_session.commit()

    headers = _pro_headers(user)
    trend_res = await app_client.get(
        "/api/analytics/persona-win-rate/export-trend.csv?window_days=14",
        headers=headers,
    )
    json_res = await app_client.get(
        "/api/analytics/persona-win-rate?window_days=14",
        headers=headers,
    )

    assert trend_res.status_code == 200
    assert trend_res.headers["content-type"].startswith("text/csv")
    assert trend_res.headers["content-disposition"].endswith(".csv\"")
    assert trend_res.headers["x-content-type-options"] == "nosniff"
    rows = list(csv.DictReader(io.StringIO(trend_res.text)))
    body = json_res.json()

    assert len(rows) == sum(len(persona["trend"]) for persona in body["personas"])
    assert rows[0].keys() == {
        "persona_id",
        "name",
        "color",
        "bucket_start",
        "bucket_end",
        "appearances",
        "wins",
        "win_rate",
        "low_confidence",
        "trend_omitted_appearances",
        "trend_omitted_wins",
    }

    expected = [
        (persona, point)
        for persona in body["personas"]
        for point in persona["trend"]
    ]
    for csv_row, (persona, point) in zip(rows, expected):
        assert csv_row["persona_id"] == persona["persona_id"]
        assert csv_row["name"] == persona["name"]
        assert csv_row["color"] == persona["color"]
        assert csv_row["bucket_start"] == point["bucket_start"]
        assert csv_row["bucket_end"] == point["bucket_end"]
        assert int(csv_row["appearances"]) == point["appearances"]
        assert int(csv_row["wins"]) == point["wins"]
        assert csv_row["win_rate"] == (
            "" if point["win_rate"] is None else str(point["win_rate"])
        )
        assert csv_row["low_confidence"] == str(persona["low_confidence"]).lower()
        assert int(csv_row["trend_omitted_appearances"]) == persona[
            "trend_omitted_appearances"
        ]
        assert int(csv_row["trend_omitted_wins"]) == persona["trend_omitted_wins"]


@pytest.mark.asyncio
async def test_trend_export_preserves_empty_weeks_and_fallback_filter(
    app_client, make_user, db_session
):
    user = make_user(email="pwr-trend-csv-fallback@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        fallback_used=True,
    )
    db_session.commit()

    headers = _pro_headers(user)
    excluded = await app_client.get(
        "/api/analytics/persona-win-rate/export-trend.csv?window_days=14",
        headers=headers,
    )
    included = await app_client.get(
        "/api/analytics/persona-win-rate/export-trend.csv?window_days=14&include_fallback=true",
        headers=headers,
    )

    assert len(list(csv.DictReader(io.StringIO(excluded.text)))) == 0
    included_rows = list(csv.DictReader(io.StringIO(included.text)))
    assert included_rows
    assert any(row["appearances"] == "1" for row in included_rows)
    assert any(row["win_rate"] == "" for row in included_rows)


@pytest.mark.asyncio
async def test_trend_export_with_no_rows_still_returns_a_header(app_client, make_user):
    user = make_user(email="pwr-trend-csv-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-win-rate/export-trend.csv?window_days=7",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.text.splitlines() == [
        "persona_id,name,color,bucket_start,bucket_end,appearances,wins,win_rate,low_confidence,trend_omitted_appearances,trend_omitted_wins"
    ]
