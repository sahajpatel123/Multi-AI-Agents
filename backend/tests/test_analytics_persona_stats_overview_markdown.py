"""Integration tests for the Markdown persona-stats overview export."""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest

from arena.core.auth import create_access_token
from arena.core.datetime_utils import utcnow_naive
from arena.db_models import ScoringAudit, UserTier


def _headers(user) -> dict[str, str]:
    token = create_access_token(user.id, user.email)
    return {"Authorization": f"Bearer {token}"}


def _seed_audit(
    db,
    *,
    user_id: int,
    winner_persona_id: str,
    panel: list[str],
    score: int = 80,
) -> None:
    db.add(
        ScoringAudit(
            session_id=str(uuid.uuid4()),
            user_id=user_id,
            prompt_snippet="x",
            winner_agent_id="agent-1",
            winner_persona_id=winner_persona_id,
            winner_score=score,
            scores={"agent-1": score},
            persona_ids_used=panel,
            fallback_used=False,
            created_at=utcnow_naive() - timedelta(hours=1),
        )
    )


@pytest.mark.asyncio
async def test_persona_stats_overview_markdown_requires_auth(app_client):
    response = await app_client.get("/api/analytics/persona-stats/export.md")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_persona_stats_overview_markdown_contains_canonical_rollup(
    app_client, make_user, db_session
):
    user = make_user(email="markdown-overview@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher", "pragmatist"]
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        score=90,
    )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        score=80,
    )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="philosopher",
        panel=panel,
        score=70,
    )
    db_session.commit()

    response = await app_client.get(
        "/api/analytics/persona-stats/export.md?window_days=30&min_appearances=2",
        headers=_headers(user),
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "text/markdown; charset=utf-8"
    assert response.headers["content-disposition"].startswith(
        'attachment; filename="arena-persona-stats-overview-'
    )
    assert response.headers["content-disposition"].endswith('.md"')

    body = response.text
    assert body.startswith("# Arena — persona stats overview\n")
    assert "**Total appearances:** 9" in body
    assert "**Total wins:** 3" in body
    assert "**Minimum appearances:** 2" in body
    assert "**Best-ranked persona:** The Analyst (analyst)" in body
    assert "| The Analyst | analyst | 3 | 2 | 66.7% | 85.0 |" in body
    assert "| The Philosopher | philosopher | 3 | 1 | 33.3% | 70.0 |" in body
    assert "Wins exclude fallback scorer results" in body
    assert body.endswith("_Exported from Arena_\n")


@pytest.mark.asyncio
async def test_persona_stats_overview_markdown_marks_low_sample_rows(
    app_client, make_user
):
    user = make_user(email="markdown-overview-empty@test.com", tier=UserTier.PRO)

    response = await app_client.get(
        "/api/analytics/persona-stats/export.md?window_days=7&min_appearances=2",
        headers=_headers(user),
    )

    assert response.status_code == 200
    assert "**Total appearances:** 0" in response.text
    assert "**Total wins:** 0" in response.text
    assert response.text.count("below floor") == 16
    assert "| The Analyst | analyst | 0 | 0 | 0.0% | — | — | — | below floor |" in response.text


@pytest.mark.asyncio
async def test_persona_stats_overview_markdown_uses_its_own_rate_limit_scope(
    app_client, make_user, monkeypatch
):
    from arena.core import rate_limits

    keys: list[str] = []
    real_hit = rate_limits.rate_limiter.hit

    def recording_hit(key, *, limit, window_seconds, message):
        keys.append(key)
        return real_hit(
            key,
            limit=limit,
            window_seconds=window_seconds,
            message=message,
        )

    monkeypatch.setattr(rate_limits.rate_limiter, "hit", recording_hit)

    user = make_user(email="markdown-overview-rate-scope@test.com", tier=UserTier.PRO)
    headers = _headers(user)
    export = await app_client.get(
        "/api/analytics/persona-stats/export.md?window_days=7",
        headers=headers,
    )
    dashboard = await app_client.get(
        "/api/analytics/persona-stats?window_days=7",
        headers=headers,
    )

    assert export.status_code == 200
    assert dashboard.status_code == 200
    assert [key for key in keys if key.startswith("user:")] == [
        f"user:analytics_persona_stats_all_markdown:{user.id}",
        f"user:analytics_persona_stats_all:{user.id}",
    ]
