"""Integration tests for scoring-audit Markdown export."""

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
    session_id: str,
    hours_ago: int,
    prompt: str,
    fallback_used: bool = False,
) -> ScoringAudit:
    row = ScoringAudit(
        session_id=session_id,
        user_id=user_id,
        prompt_snippet=prompt,
        prompt_category="question",
        winner_agent_id="agent-1",
        winner_persona_id="analyst",
        winner_score=87,
        scores={"agent-1": 87, "agent-2": 74},
        criteria_breakdown={"agent-1": {"relevance": 90, "insight": 85}},
        confidence_values=[{"agent_id": "agent-1", "confidence": 82}],
        persona_ids_used=["analyst", "philosopher"],
        scoring_duration_ms=1240,
        fallback_used=fallback_used,
        created_at=utcnow_naive() - timedelta(hours=hours_ago),
    )
    db.add(row)
    db.flush()
    return row


@pytest.mark.asyncio
async def test_scoring_audit_markdown_matches_visible_rounds_and_escapes_cells(
    app_client, make_user, db_session
):
    user = make_user(email="md-audit-pro@test.com", tier=UserTier.PRO)
    sid = "audit md x"
    _seed_audit(
        db_session,
        user_id=user.id,
        session_id=sid,
        hours_ago=3,
        prompt="older round",
    )
    _seed_audit(
        db_session,
        user_id=user.id,
        session_id=sid,
        hours_ago=1,
        prompt="newer | [round]\nwith a second line",
        fallback_used=True,
    )
    db_session.commit()

    response = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}/export.md?limit=1",
        headers=_pro_headers(user),
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")
    assert response.headers["content-disposition"] == (
        'attachment; filename="arena-scoring-audit-audit_md_x.md"'
    )
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "**Rounds:** showing 1 of 2" in response.text
    assert "older round" not in response.text
    assert "newer \\| \\[round\\] with a second line" in response.text
    assert "- **Fallback scores:** yes — provisional fallback scores" in response.text
    assert "| Mind | Score | Confidence |" in response.text
    assert "| agent-1 | 87 | 82 |" in response.text
    assert "| agent-1 | relevance | 90 |" in response.text
    assert "## Rounds" in response.text


@pytest.mark.asyncio
async def test_scoring_audit_markdown_preserves_gate_and_ownership(
    app_client, make_user, db_session
):
    owner = make_user(email="md-audit-owner@test.com", tier=UserTier.PRO)
    other = make_user(email="md-audit-other@test.com", tier=UserTier.PRO)
    sid = str(uuid.uuid4())
    _seed_audit(
        db_session,
        user_id=owner.id,
        session_id=sid,
        hours_ago=1,
        prompt="private round",
    )
    db_session.commit()

    forbidden = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}/export.md",
        headers=_pro_headers(make_user(email="md-audit-free@test.com", tier=UserTier.FREE)),
    )
    hidden = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}/export.md",
        headers=_pro_headers(other),
    )

    assert forbidden.status_code == 403
    assert forbidden.json()["detail"]["error"] == "feature_not_allowed"
    assert hidden.status_code == 404
    assert hidden.json()["detail"]["error"] == "audit_not_found"
