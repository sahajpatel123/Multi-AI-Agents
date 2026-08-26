"""Integration tests for scoring-audit JSON export."""

from __future__ import annotations

import json
import uuid
from datetime import timedelta

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import ScoringAudit, UserTier


def _seed_audit(db, *, user_id: int, session_id: str, hours_ago: int = 1, prompt: str = "Should we launch?"):
    row = ScoringAudit(
        session_id=session_id,
        user_id=user_id,
        prompt_snippet=prompt,
        prompt_category="question",
        winner_agent_id="agent-1",
        winner_persona_id="analyst",
        winner_score=87,
        scores={"agent-1": 87, "agent-2": 74},
        criteria_breakdown={"agent-1": {"relevance": 90}},
        confidence_values=[{"agent_id": "agent-1", "confidence": 82}],
        persona_ids_used=["analyst", "philosopher"],
        scoring_duration_ms=1240,
        fallback_used=False,
        created_at=utcnow_naive() - timedelta(hours=hours_ago),
    )
    db.add(row)
    db.flush()
    return row


@pytest.mark.asyncio
async def test_scoring_audit_json_matches_detail_payload_for_pro(
    app_client, make_user, db_session
):
    user = make_user(email="json-audit-pro@test.com", tier=UserTier.PRO)
    sid = str(uuid.uuid4())
    _seed_audit(db_session, user_id=user.id, session_id=sid)
    db_session.commit()

    response = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}/export.json",
        headers=_pro_headers(user),
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.headers["content-disposition"] == (
        f'attachment; filename="arena-scoring-audit-{sid}.json"'
    )
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"

    payload = json.loads(response.text)
    assert payload["session_id"] == sid
    assert payload["audit_count"] == 1
    assert payload["total_count"] == 1
    assert payload["audits"][0]["winner_persona_id"] == "analyst"
    assert payload["audits"][0]["criteria_breakdown"]["agent-1"]["relevance"] == 90


@pytest.mark.asyncio
async def test_scoring_audit_json_keeps_newest_limit_and_sanitizes_filename(
    app_client, make_user, db_session
):
    user = make_user(email="json-audit-limit@test.com", tier=UserTier.PRO)
    sid = "audit json x"
    _seed_audit(db_session, user_id=user.id, session_id=sid, hours_ago=3, prompt="older")
    _seed_audit(db_session, user_id=user.id, session_id=sid, hours_ago=1, prompt="newer")
    db_session.commit()

    response = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}/export.json?limit=1",
        headers=_pro_headers(user),
    )

    assert response.status_code == 200
    assert response.headers["content-disposition"] == (
        'attachment; filename="arena-scoring-audit-audit_json_x.json"'
    )
    payload = response.json()
    assert payload["audit_count"] == 1
    assert payload["total_count"] == 2
    assert payload["audits"][0]["prompt_snippet"] == "newer"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("extension", "scope"),
    [
        ("csv", "analytics_scoring_audit_csv"),
        ("json", "analytics_scoring_audit_json"),
    ],
)
async def test_scoring_audit_exports_use_only_their_own_rate_limit_scope(
    app_client, make_user, db_session, monkeypatch, extension, scope
):
    """Downloads must not consume the interactive detail-read budget."""
    from arena.core import rate_limits

    user = make_user(email=f"audit-scope-{extension}@test.com", tier=UserTier.PRO)
    sid = str(uuid.uuid4())
    _seed_audit(db_session, user_id=user.id, session_id=sid)
    db_session.commit()

    keys: list[str] = []
    real_hit = rate_limits.rate_limiter.hit

    def recording_hit(key, *, limit, window_seconds, message):
        keys.append(key)
        return real_hit(key, limit=limit, window_seconds=window_seconds, message=message)

    monkeypatch.setattr(rate_limits.rate_limiter, "hit", recording_hit)

    response = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}/export.{extension}",
        headers=_pro_headers(user),
    )

    assert response.status_code == 200, response.text
    user_keys = [key for key in keys if key.startswith("user:")]
    assert user_keys == [f"user:{scope}:{user.id}"]


@pytest.mark.asyncio
async def test_scoring_audit_json_preserves_pro_gate_and_ownership(
    app_client, make_user, db_session
):
    owner = make_user(email="json-audit-owner@test.com", tier=UserTier.PRO)
    other = make_user(email="json-audit-other@test.com", tier=UserTier.PRO)
    sid = str(uuid.uuid4())
    _seed_audit(db_session, user_id=owner.id, session_id=sid)
    db_session.commit()

    forbidden = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}/export.json",
        headers=_pro_headers(make_user(email="json-audit-free@test.com", tier=UserTier.FREE)),
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["detail"]["error"] == "feature_not_allowed"

    hidden = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}/export.json",
        headers=_pro_headers(other),
    )
    assert hidden.status_code == 404
    assert hidden.json()["detail"]["error"] == "audit_not_found"


@pytest.mark.asyncio
async def test_scoring_audit_export_gate_runs_before_export_rate_limit(
    app_client, make_user, monkeypatch
):
    """Rejected tiers must not burn the export bucket."""
    from arena.core import rate_limits

    keys: list[str] = []

    def recording_hit(key, *, limit, window_seconds, message):
        keys.append(key)

    monkeypatch.setattr(rate_limits.rate_limiter, "hit", recording_hit)

    user = make_user(email="json-audit-gate-order@test.com", tier=UserTier.FREE)
    response = await app_client.get(
        "/api/analytics/scoring-audit/unknown/export.json",
        headers=_pro_headers(user),
    )

    assert response.status_code == 403
    assert [key for key in keys if key.startswith("user:")] == []
