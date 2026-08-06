"""Integration tests for GET /api/analytics/scoring-audit/{session_id}.

Per-round scoring audit detail: the Pro "Scoring audit" entitlement that
surfaces the raw ScoringAudit rows the Scorer persists for every exchange
(per-mind scores, winner, criteria breakdown, confidence, duration,
fallback flag) instead of only the aggregated analytics views.
"""

from __future__ import annotations

import json
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
    hours_ago: int = 1,
    prompt_snippet: str = "Should we launch this feature?",
    winner_score: int = 87,
    fallback_used: bool = False,
) -> ScoringAudit:
    rec = ScoringAudit(
        session_id=session_id,
        user_id=user_id,
        prompt_snippet=prompt_snippet,
        prompt_category="question",
        winner_agent_id="agent-1",
        winner_persona_id="analyst",
        winner_score=winner_score,
        scores={"agent-1": 87, "agent-2": 74, "agent-3": 66, "agent-4": 58},
        criteria_breakdown={
            "agent-1": {
                "relevance": 90,
                "insight": 85,
                "clarity": 88,
                "intellectual_honesty": 86,
            }
        },
        confidence_values=[
            {"agent_id": "agent-1", "confidence": 82},
            {"agent_id": "agent-2", "confidence": 70},
        ],
        persona_ids_used=["analyst", "philosopher", "scientist", "contrarian"],
        scoring_duration_ms=1240,
        fallback_used=fallback_used,
        created_at=utcnow_naive() - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


@pytest.mark.asyncio
async def test_scoring_audit_returns_rounds_for_pro(app_client, make_user, db_session):
    user = make_user(email="audit-pro@test.com", tier=UserTier.PRO)
    sid = str(uuid.uuid4())
    _seed_audit(db_session, user_id=user.id, session_id=sid, hours_ago=4)
    _seed_audit(
        db_session,
        user_id=user.id,
        session_id=sid,
        hours_ago=1,
        prompt_snippet="Follow-up: what is the riskiest assumption?",
        winner_score=91,
        fallback_used=True,
    )
    db_session.commit()

    res = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["session_id"] == sid
    assert body["audit_count"] == 2
    assert body["total_count"] == 2

    # Oldest round first, so a chat's rounds read in order.
    assert [a["prompt_snippet"] for a in body["audits"]] == [
        "Should we launch this feature?",
        "Follow-up: what is the riskiest assumption?",
    ]

    first = body["audits"][0]
    assert first["winner_persona_id"] == "analyst"
    assert first["winner_score"] == 87
    assert first["scores"]["agent-3"] == 66
    assert first["criteria_breakdown"]["agent-1"]["relevance"] == 90
    assert first["confidence_values"][1]["agent_id"] == "agent-2"
    assert first["persona_ids_used"] == ["analyst", "philosopher", "scientist", "contrarian"]
    assert first["scoring_duration_ms"] == 1240
    assert first["fallback_used"] is False
    assert first["created_at"].endswith("Z") or "T" in first["created_at"]

    assert body["audits"][1]["fallback_used"] is True


@pytest.mark.asyncio
async def test_scoring_audit_limit_keeps_newest_rounds_in_order(
    app_client, make_user, db_session
):
    """A long session must surface its most recent exchanges, not the first
    ones, while still returning them oldest-first."""
    user = make_user(email="audit-limit@test.com", tier=UserTier.PRO)
    sid = str(uuid.uuid4())
    _seed_audit(
        db_session,
        user_id=user.id,
        session_id=sid,
        hours_ago=5,
        prompt_snippet="round-1",
    )
    _seed_audit(
        db_session,
        user_id=user.id,
        session_id=sid,
        hours_ago=3,
        prompt_snippet="round-2",
    )
    _seed_audit(
        db_session,
        user_id=user.id,
        session_id=sid,
        hours_ago=1,
        prompt_snippet="round-3",
    )
    db_session.commit()

    res = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}?limit=2",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["audit_count"] == 2
    assert body["total_count"] == 3
    assert [a["prompt_snippet"] for a in body["audits"]] == [
        "round-2",
        "round-3",
    ]


@pytest.mark.asyncio
async def test_scoring_audit_is_pro_gated(app_client, make_user, db_session):
    sid = str(uuid.uuid4())
    for tier in (UserTier.GUEST, UserTier.FREE, UserTier.PLUS):
        user = make_user(email=f"audit-{tier.value}@test.com", tier=tier)
        _seed_audit(db_session, user_id=user.id, session_id=sid)
    db_session.commit()

    for user in (make_user(email="audit-free2@test.com", tier=UserTier.FREE),
                 make_user(email="audit-plus2@test.com", tier=UserTier.PLUS)):
        res = await app_client.get(
            f"/api/analytics/scoring-audit/{sid}", headers=_pro_headers(user)
        )
        assert res.status_code == 403
        assert res.json()["detail"]["error"] == "feature_not_allowed"
        assert res.json()["detail"]["upgrade_required"] == "pro"


@pytest.mark.asyncio
async def test_scoring_audit_allows_plus_with_agent_addon(
    app_client, make_user, db_session
):
    user = make_user(email="audit-plus-addon@test.com", tier=UserTier.PLUS)
    user.agent_addon_active = True
    db_session.add(user)
    db_session.commit()
    sid = str(uuid.uuid4())
    _seed_audit(db_session, user_id=user.id, session_id=sid)
    db_session.commit()

    res = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    assert res.json()["audit_count"] == 1


@pytest.mark.asyncio
async def test_scoring_audit_hides_other_users_sessions(
    app_client, make_user, db_session
):
    owner = make_user(email="audit-owner@test.com", tier=UserTier.PRO)
    other = make_user(email="audit-other@test.com", tier=UserTier.PRO)
    assert owner.id != other.id
    sid = str(uuid.uuid4())
    _seed_audit(db_session, user_id=owner.id, session_id=sid)
    db_session.commit()

    # Other user's session and an unknown session both read as 404 so the
    # endpoint can't be used to probe which session ids exist.
    for target in (sid, str(uuid.uuid4())):
        res = await app_client.get(
            f"/api/analytics/scoring-audit/{target}", headers=_pro_headers(other)
        )
        assert res.status_code == 404
        assert res.json()["detail"]["error"] == "audit_not_found"


@pytest.mark.asyncio
async def test_scoring_audit_requires_auth(app_client, make_user, db_session):
    user = make_user(email="audit-anon@test.com", tier=UserTier.PRO)
    sid = str(uuid.uuid4())
    _seed_audit(db_session, user_id=user.id, session_id=sid)
    db_session.commit()

    res = await app_client.get(f"/api/analytics/scoring-audit/{sid}")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_scoring_audit_tolerates_legacy_string_json(
    app_client, make_user, db_session
):
    """Corrupted/legacy rows whose JSON columns are string-encoded must not
    crash; the response degrades to empty maps/lists instead of a 500."""
    user = make_user(email="audit-legacy@test.com", tier=UserTier.PRO)
    sid = str(uuid.uuid4())
    rec = _seed_audit(db_session, user_id=user.id, session_id=sid)
    rec.scores = json.dumps(rec.scores)
    rec.criteria_breakdown = json.dumps(rec.criteria_breakdown)
    rec.confidence_values = json.dumps(rec.confidence_values)
    rec.persona_ids_used = json.dumps(rec.persona_ids_used)
    db_session.commit()

    res = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    audit = res.json()["audits"][0]
    assert audit["scores"]["agent-1"] == 87
    assert audit["criteria_breakdown"]["agent-1"]["insight"] == 85
    assert audit["confidence_values"][0]["agent_id"] == "agent-1"
    assert audit["persona_ids_used"] == ["analyst", "philosopher", "scientist", "contrarian"]


@pytest.mark.asyncio
async def test_scoring_audit_degrades_garbage_json_columns(
    app_client, make_user, db_session
):
    user = make_user(email="audit-garbage@test.com", tier=UserTier.PRO)
    sid = str(uuid.uuid4())
    rec = _seed_audit(db_session, user_id=user.id, session_id=sid)
    rec.scores = "not-json"
    rec.criteria_breakdown = [1, 2, 3]
    rec.confidence_values = {"agent_id": "agent-1"}
    rec.persona_ids_used = "not-json"
    db_session.commit()

    res = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    audit = res.json()["audits"][0]
    assert audit["scores"] == {}
    assert audit["criteria_breakdown"] is None
    assert audit["confidence_values"] == []
    assert audit["persona_ids_used"] == []
