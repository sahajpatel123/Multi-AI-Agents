"""Integration tests for the persona activity timeline JSON export.

The export is the machine-readable sibling of the timeline CSV and must
remain an exact snapshot of the dashboard payload.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import ScoringAudit, UserTier


def _pro_headers(user) -> dict[str, str]:
    from arena.core.auth import create_access_token

    token = create_access_token(user.id, user.email)
    return {"Authorization": f"Bearer {token}"}


def _seed_audit(
    db,
    *,
    user_id: int,
    winner_persona_id: str,
    fallback_used: bool = False,
    hours_ago: int = 1,
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
            persona_ids_used=[winner_persona_id],
            fallback_used=fallback_used,
            created_at=utcnow_naive() - timedelta(hours=hours_ago),
        )
    )


@pytest.mark.asyncio
async def test_json_matches_dashboard_payload(app_client, make_user, db_session):
    user = make_user(email="ptlj-match@test.com", tier=UserTier.PRO)
    _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst")
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        fallback_used=True,
        hours_ago=25,
    )
    db_session.commit()

    headers = _pro_headers(user)
    export_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.json?days=7",
        headers=headers,
    )
    dashboard_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=headers,
    )

    assert export_res.status_code == 200
    assert dashboard_res.status_code == 200
    assert export_res.json() == dashboard_res.json()
    body = export_res.json()
    assert body["total_appearances"] == 2
    assert body["total_wins"] == 1
    assert len(body["timeline"]) == 7


@pytest.mark.asyncio
async def test_json_empty_export_has_download_and_security_headers(app_client, make_user):
    user = make_user(email="ptlj-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.json?days=1",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/json")
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["content-disposition"].startswith(
        'attachment; filename="arena-timeline-analyst-'
    )
    body = res.json()
    assert body["days"] == 1
    assert body["total_appearances"] == 0
    assert body["total_wins"] == 0
    assert body["timeline"] == [
        {
            "date": body["window_start"],
            "appearances": 0,
            "wins": 0,
            "win_rate": 0.0,
        }
    ]


@pytest.mark.asyncio
async def test_json_normalizes_persona_id_in_filename(app_client, make_user, db_session):
    user = make_user(email="ptlj-case@test.com", tier=UserTier.PRO)
    _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst")
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/%20ANALYST%20/timeline/export.json?days=7",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    assert 'attachment; filename="arena-timeline-analyst-' in res.headers[
        "content-disposition"
    ]
    assert res.json()["persona_id"] == "analyst"


@pytest.mark.asyncio
async def test_json_requires_auth_and_rejects_invalid_windows(app_client, make_user):
    unauthenticated = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.json"
    )
    assert unauthenticated.status_code == 401

    user = make_user(email="ptlj-bounds@test.com", tier=UserTier.PRO)
    for query in ("days=0", "days=91"):
        res = await app_client.get(
            f"/api/analytics/persona-stats/analyst/timeline/export.json?{query}",
            headers=_pro_headers(user),
        )
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_json_export_is_scoped_to_caller(app_client, make_user, db_session):
    owner = make_user(email="ptlj-owner@test.com", tier=UserTier.PRO)
    other = make_user(email="ptlj-other@test.com", tier=UserTier.PRO)
    _seed_audit(db_session, user_id=owner.id, winner_persona_id="analyst")
    db_session.commit()

    owner_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.json?days=7",
        headers=_pro_headers(owner),
    )
    other_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.json?days=7",
        headers=_pro_headers(other),
    )

    assert owner_res.json()["total_appearances"] == 1
    assert other_res.json()["total_appearances"] == 0


@pytest.mark.asyncio
async def test_json_export_uses_only_its_own_rate_limit_scope(
    app_client, make_user, monkeypatch
):
    """A JSON download must not also consume dashboard refresh capacity."""
    from arena.core import rate_limits

    keys: list[str] = []
    real_hit = rate_limits.rate_limiter.hit

    def recording_hit(key, *, limit, window_seconds, message):
        keys.append(key)
        return real_hit(key, limit=limit, window_seconds=window_seconds, message=message)

    monkeypatch.setattr(rate_limits.rate_limiter, "hit", recording_hit)

    user = make_user(email="ptlj-rate-scope@test.com", tier=UserTier.PRO)
    headers = _pro_headers(user)
    export_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.json?days=7",
        headers=headers,
    )
    dashboard_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=headers,
    )

    assert export_res.status_code == 200
    assert dashboard_res.status_code == 200
    assert f"user:analytics_persona_stats_timeline_json:{user.id}" in keys
    assert f"user:analytics_persona_stats_timeline:{user.id}" in keys
    assert keys.count(f"user:analytics_persona_stats_timeline:{user.id}") == 1
