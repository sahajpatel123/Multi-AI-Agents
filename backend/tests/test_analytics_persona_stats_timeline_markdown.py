"""Integration tests for the persona activity timeline Markdown export."""

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
            persona_ids_used=[winner_persona_id],
            fallback_used=fallback_used,
            created_at=utcnow_naive() - timedelta(hours=hours_ago),
        )
    )


@pytest.mark.asyncio
async def test_markdown_mirrors_persona_timeline_rollup_and_daily_rows(
    app_client, make_user, db_session
):
    user = make_user(email="ptlm-content@test.com", tier=UserTier.PRO)
    _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst")
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        hours_ago=25,
        fallback_used=True,
    )
    db_session.commit()

    headers = _pro_headers(user)
    markdown_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.md?days=3",
        headers=headers,
    )
    json_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=3",
        headers=headers,
    )

    assert markdown_res.status_code == 200
    assert json_res.status_code == 200
    payload = json_res.json()
    body = markdown_res.text
    assert f"# Arena — {payload['name']} persona timeline" in body
    assert f"**Window:** {payload['window_start']} → {payload['window_end']} (3 days, UTC)" in body
    assert f"- **Appearances:** {payload['total_appearances']}" in body
    assert f"- **Wins:** {payload['total_wins']}" in body
    assert "| Date | Appearances | Wins | Win rate |" in body
    for row in payload["timeline"]:
        assert f"| {row['date']} | {row['appearances']} | {row['wins']} |" in body
    assert "100.0%" in body
    assert "Wins exclude fallback scorings" in body


@pytest.mark.asyncio
async def test_markdown_empty_export_has_download_and_security_headers(app_client, make_user):
    user = make_user(email="ptlm-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.md?days=1",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/markdown")
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["content-disposition"].endswith('.md"')
    assert "- **Appearances:** 0" in res.text
    assert "- **Wins:** 0" in res.text
    assert "| none |" not in res.text
    assert "_Exported from Arena_" in res.text
    assert res.text.endswith("\n")


@pytest.mark.asyncio
async def test_markdown_requires_auth_rejects_unknown_persona_and_invalid_windows(
    app_client, make_user
):
    unauthenticated = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.md"
    )
    assert unauthenticated.status_code == 401

    user = make_user(email="ptlm-bounds@test.com", tier=UserTier.PRO)
    headers = _pro_headers(user)
    unknown = await app_client.get(
        "/api/analytics/persona-stats/retired_mind/timeline/export.md",
        headers=headers,
    )
    assert unknown.status_code == 404
    for query in ("days=0", "days=91"):
        res = await app_client.get(
            f"/api/analytics/persona-stats/analyst/timeline/export.md?{query}",
            headers=headers,
        )
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_markdown_export_uses_its_own_rate_limit_scope(
    app_client, make_user, monkeypatch
):
    from arena.core import rate_limits

    keys: list[str] = []
    real_hit = rate_limits.rate_limiter.hit

    def recording_hit(key, *, limit, window_seconds, message):
        keys.append(key)
        return real_hit(key, limit=limit, window_seconds=window_seconds, message=message)

    monkeypatch.setattr(rate_limits.rate_limiter, "hit", recording_hit)

    user = make_user(email="ptlm-rate-scope@test.com", tier=UserTier.PRO)
    headers = _pro_headers(user)
    export_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.md?days=7",
        headers=headers,
    )
    dashboard_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=headers,
    )

    assert export_res.status_code == 200
    assert dashboard_res.status_code == 200
    assert f"user:analytics_persona_stats_timeline_markdown:{user.id}" in keys
    assert f"user:analytics_persona_stats_timeline:{user.id}" in keys
    assert keys.count(f"user:analytics_persona_stats_timeline:{user.id}") == 1
