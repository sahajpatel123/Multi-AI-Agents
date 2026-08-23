"""Integration tests for the flattened persona win-rate trend JSON export."""

from __future__ import annotations

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
) -> None:
    db.add(
        ScoringAudit(
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
    )
    db.flush()


@pytest.mark.asyncio
async def test_trend_json_requires_auth(app_client):
    res = await app_client.get("/api/analytics/persona-win-rate/export-trend.json")
    assert res.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("query", ["window_days=0", "min_appearances=201"])
async def test_trend_json_rejects_invalid_parameters(app_client, make_user, query):
    user = make_user(email=f"pwr-trend-json-{query[0]}.com", tier=UserTier.PRO)
    res = await app_client.get(
        f"/api/analytics/persona-win-rate/export-trend.json?{query}",
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_trend_json_flattens_the_canonical_weekly_rows(
    app_client, make_user, db_session
):
    user = make_user(email="pwr-trend-json@test.com", tier=UserTier.PRO)
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
        "/api/analytics/persona-win-rate/export-trend.json?window_days=14&min_appearances=1",
        headers=headers,
    )
    canonical_res = await app_client.get(
        "/api/analytics/persona-win-rate?window_days=14&min_appearances=1",
        headers=headers,
    )

    assert trend_res.status_code == 200
    assert trend_res.headers["content-type"].startswith("application/json")
    assert trend_res.headers["content-disposition"].endswith(".json\"")
    assert trend_res.headers["x-content-type-options"] == "nosniff"

    export = trend_res.json()
    canonical = canonical_res.json()
    assert export["window_days"] == canonical["window_days"]
    assert export["window_start"] == canonical["window_start"]
    assert export["window_end"] == canonical["window_end"]
    assert export["min_appearances"] == canonical["min_appearances"]
    assert export["include_fallback"] == canonical["include_fallback"]
    assert export["low_confidence_threshold"] == canonical["low_confidence_threshold"]
    assert export["scored_exchanges"] == canonical["scored_exchanges"]
    assert export["unattributed_exchanges"] == canonical["unattributed_exchanges"]
    assert export["fallback_exchanges"] == canonical["fallback_exchanges"]

    expected = [
        {
            "persona_id": persona["persona_id"],
            "name": persona["name"],
            "color": persona["color"],
            "bucket_start": point["bucket_start"],
            "bucket_end": point["bucket_end"],
            "appearances": point["appearances"],
            "wins": point["wins"],
            "win_rate": point["win_rate"],
            "low_confidence": persona["low_confidence"],
            "trend_omitted_appearances": persona["trend_omitted_appearances"],
            "trend_omitted_wins": persona["trend_omitted_wins"],
        }
        for persona in canonical["personas"]
        for point in persona["trend"]
    ]
    assert export["row_count"] == len(expected)
    assert export["rows"] == expected


@pytest.mark.asyncio
async def test_trend_json_keeps_fallback_filter_and_empty_shape(app_client, make_user, db_session):
    user = make_user(email="pwr-trend-json-empty@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst", "philosopher"],
        fallback_used=True,
    )
    db_session.commit()

    headers = _pro_headers(user)
    excluded = await app_client.get(
        "/api/analytics/persona-win-rate/export-trend.json?window_days=7",
        headers=headers,
    )
    included = await app_client.get(
        "/api/analytics/persona-win-rate/export-trend.json?window_days=7&include_fallback=true",
        headers=headers,
    )

    assert excluded.status_code == 200
    assert excluded.json()["include_fallback"] is False
    assert excluded.json()["row_count"] == 0
    assert excluded.json()["rows"] == []
    assert included.status_code == 200
    assert included.json()["include_fallback"] is True
    assert included.json()["row_count"] > 0
    assert included.json()["rows"][0]["appearances"] == 1
