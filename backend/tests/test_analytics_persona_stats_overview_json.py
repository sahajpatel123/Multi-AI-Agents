"""Integration tests for GET /api/analytics/persona-stats/export.json.

The JSON export is the portable, machine-readable form of the all-personas
summary shown by the Profile analytics dashboard.
"""

from __future__ import annotations

import json
import uuid
from datetime import timedelta

import pytest

from arena.core.agents import PERSONA_METADATA
from arena.core.auth import create_access_token
from arena.core.datetime_utils import utcnow_naive
from arena.db_models import ScoringAudit, UserTier


def _pro_headers(user) -> dict[str, str]:
    token = create_access_token(user.id, user.email)
    return {"Authorization": f"Bearer {token}"}


def _seed_audit(
    db,
    *,
    user_id: int,
    winner_persona_id: str,
    panel: list[str],
    score: int = 80,
    hours_ago: int = 1,
) -> ScoringAudit:
    rec = ScoringAudit(
        session_id=str(uuid.uuid4()),
        user_id=user_id,
        prompt_snippet="x",
        winner_agent_id="agent-1",
        winner_persona_id=winner_persona_id,
        winner_score=score,
        scores={"agent-1": score},
        persona_ids_used=panel,
        fallback_used=False,
        created_at=utcnow_naive() - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


@pytest.mark.asyncio
async def test_persona_stats_overview_json_requires_auth(app_client):
    res = await app_client.get("/api/analytics/persona-stats/export.json")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_persona_stats_overview_json_matches_dashboard(
    app_client, make_user, db_session
):
    user = make_user(email="json-overview@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher", "pragmatist"]
    for score in (80, 90, 100):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            score=score,
        )
    db_session.commit()

    headers = _pro_headers(user)
    export = await app_client.get(
        "/api/analytics/persona-stats/export.json?window_days=30&min_appearances=2",
        headers=headers,
    )
    dashboard = await app_client.get(
        "/api/analytics/persona-stats?window_days=30&min_appearances=2",
        headers=headers,
    )

    assert export.status_code == 200
    assert dashboard.status_code == 200
    assert export.headers["content-type"] == "application/json; charset=utf-8"
    assert export.headers["content-disposition"].startswith(
        'attachment; filename="arena-persona-stats-overview-'
    )
    assert export.headers["content-disposition"].endswith('.json"')
    assert json.loads(export.text) == dashboard.json()

    payload = export.json()
    assert payload["total_personas"] == len(PERSONA_METADATA)
    analyst = next(row for row in payload["personas"] if row["persona_id"] == "analyst")
    assert analyst["appearances"] == 3
    assert analyst["wins"] == 3
    assert analyst["avg_winning_score"] == 90.0


@pytest.mark.asyncio
async def test_persona_stats_overview_json_rejects_invalid_window(
    app_client, make_user
):
    user = make_user(email="json-overview-bounds@test.com", tier=UserTier.PRO)
    headers = _pro_headers(user)
    for query in ("window_days=0", "window_days=366"):
        res = await app_client.get(
            f"/api/analytics/persona-stats/export.json?{query}",
            headers=headers,
        )
        assert res.status_code == 422, query
