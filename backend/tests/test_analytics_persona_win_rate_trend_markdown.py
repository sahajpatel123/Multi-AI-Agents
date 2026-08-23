"""Integration tests for the weekly persona win-rate Markdown export."""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import ScoringAudit, UserTier


def _seed_audit(db, *, user_id: int, winner_persona_id: str, panel: list[str], hours_ago: int = 1):
    record = ScoringAudit(
        session_id=str(uuid.uuid4()),
        user_id=user_id,
        prompt_snippet="x",
        winner_agent_id="agent-1",
        winner_persona_id=winner_persona_id,
        winner_score=80,
        scores={"agent-1": 80},
        persona_ids_used=panel,
        fallback_used=False,
        created_at=utcnow_naive() - timedelta(hours=hours_ago),
    )
    db.add(record)
    db.flush()


def _table_rows(text: str) -> list[list[str]]:
    rows = [
        line.strip().strip("|").split("|")
        for line in text.splitlines()
        if line.strip().startswith("|") and not line.strip().startswith("| ---")
    ]
    return [[cell.strip() for cell in row] for row in rows[1:]]


@pytest.mark.asyncio
async def test_trend_markdown_requires_auth(app_client):
    res = await app_client.get("/api/analytics/persona-win-rate/export-trend.md")
    assert res.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("query", ["window_days=0", "min_appearances=201"])
async def test_trend_markdown_rejects_invalid_parameters(app_client, make_user, query):
    user = make_user(email=f"pwr-trend-md-{query[0]}.com", tier=UserTier.PRO)
    res = await app_client.get(
        f"/api/analytics/persona-win-rate/export-trend.md?{query}",
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_trend_markdown_matches_canonical_weekly_rows(
    app_client, make_user, db_session
):
    user = make_user(email="pwr-trend-md@test.com", tier=UserTier.PRO)
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

    markdown_res = await app_client.get(
        "/api/analytics/persona-win-rate/export-trend.md?window_days=14&min_appearances=1",
        headers=_pro_headers(user),
    )
    json_res = await app_client.get(
        "/api/analytics/persona-win-rate?window_days=14&min_appearances=1",
        headers=_pro_headers(user),
    )

    assert markdown_res.status_code == 200
    assert markdown_res.headers["content-type"].startswith("text/markdown")
    assert markdown_res.headers["content-disposition"].endswith(".md\"")
    assert markdown_res.headers["x-content-type-options"] == "nosniff"
    assert "## Weekly trend" in markdown_res.text
    rows = _table_rows(markdown_res.text)
    body = json_res.json()
    expected = [
        (persona, point)
        for persona in body["personas"]
        for point in persona["trend"]
    ]
    assert len(rows) == len(expected)
    for row, (persona, point) in zip(rows, expected):
        assert row[0] == persona["name"]
        assert row[1] == f"{point['bucket_start']} → {point['bucket_end']}"
        assert int(row[2]) == point["appearances"]
        assert int(row[3]) == point["wins"]
        assert row[4] == (
            "no data" if point["win_rate"] is None else f"{round(point['win_rate'] * 100)}%"
        )
        assert row[5] == "low sample"


@pytest.mark.asyncio
async def test_trend_markdown_empty_report_is_explicit(app_client, make_user):
    user = make_user(email="pwr-trend-md-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-win-rate/export-trend.md?window_days=7",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert "(7 days, UTC)" in res.text
    assert "**Low-confidence threshold:** fewer than 5 appearances" in res.text
    assert "**Fallback scorings included:** no" in res.text
    assert "- **Scored exchanges:** 0" in res.text
    assert "_No scored panels meet the minimum appearance threshold in this window._" in res.text
