"""Integration tests for GET /api/analytics/scoring-audit/{session_id}/export.csv.

The CSV export mirrors the JSON scoring-audit detail endpoint (same Pro
gate, ownership 404s, newest-kept-last limit), with one row per round and a
footer rollup so downstream spreadsheets can detect truncation.
"""

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


def _rows(content: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(content)))


@pytest.mark.asyncio
async def test_scoring_audit_csv_exports_rounds_for_pro(
    app_client, make_user, db_session
):
    user = make_user(email="csv-pro@test.com", tier=UserTier.PRO)
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
        f"/api/analytics/scoring-audit/{sid}/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-content-type-options"] == "nosniff"
    assert (
        res.headers["content-disposition"]
        == f'attachment; filename="arena-scoring-audit-{sid}.csv"'
    )

    rows = _rows(res.text)
    assert rows[0] == [
        "round",
        "created_at",
        "prompt_snippet",
        "prompt_category",
        "winner_agent_id",
        "winner_persona_id",
        "winner_score",
        "scores_json",
        "criteria_breakdown_json",
        "confidence_values_json",
        "persona_ids_used",
        "scoring_duration_ms",
        "fallback_used",
    ]
    assert len(rows) == 4  # header + 2 rounds + footer

    # Oldest round first, mirroring the JSON endpoint's chronological order.
    assert rows[1][0] == "1"
    assert rows[1][2] == "Should we launch this feature?"
    assert rows[1][5] == "analyst"
    assert rows[1][6] == "87"
    assert '"agent-1":87' in rows[1][7]
    assert '"relevance":90' in rows[1][8]
    assert '"agent_id":"agent-1"' in rows[1][9]
    assert '"philosopher"' in rows[1][10]
    assert rows[1][11] == "1240"
    assert rows[1][12] == "false"
    # Every record (header, rounds, footer) has the same field count so
    # strict RFC 4180 consumers accept the file.
    assert {len(row) for row in rows} == {len(rows[0])}

    assert rows[2][0] == "2"
    assert rows[2][2] == "Follow-up: what is the riskiest assumption?"
    assert rows[2][6] == "91"
    assert rows[2][12] == "true"

    assert rows[3][0] == f"# session_id={sid}"
    assert rows[3][1] == "audit_count=2"
    assert rows[3][2] == "total_count=2"
    assert len(rows[3]) == len(rows[0])


@pytest.mark.asyncio
async def test_scoring_audit_csv_tolerates_legacy_rows_with_missing_fields(
    app_client, make_user, db_session
):
    """Legacy rows (nullable fields NULL, JSON stored as strings) degrade to
    blank or empty JSON cells, never a crash."""
    user = make_user(email="csv-legacy@test.com", tier=UserTier.PRO)
    sid = str(uuid.uuid4())
    rec = _seed_audit(db_session, user_id=user.id, session_id=sid)
    rec.prompt_category = None
    rec.scores = 'null'  # written as a serialized JSON string by a legacy path
    rec.criteria_breakdown = None
    rec.confidence_values = None
    rec.persona_ids_used = None
    rec.scoring_duration_ms = None
    db_session.commit()

    res = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    rows = _rows(res.text)
    data = rows[1]
    assert data[1] != ""  # created_at is NOT NULL by schema
    assert data[3] == ""  # prompt_category
    assert data[6] == "87"  # winner_score is NOT NULL by schema
    assert data[7] == "{}"  # scores_json
    assert data[8] == "{}"  # criteria_breakdown_json
    assert data[9] == "[]"  # confidence_values_json
    assert data[10] == "[]"  # persona_ids_used
    assert data[11] == ""  # scoring_duration_ms
    assert {len(row) for row in rows} == {len(rows[0])}


@pytest.mark.asyncio
async def test_scoring_audit_csv_limit_keeps_newest_rounds(
    app_client, make_user, db_session
):
    user = make_user(email="csv-limit@test.com", tier=UserTier.PRO)
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
        f"/api/analytics/scoring-audit/{sid}/export.csv?limit=2",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    rows = _rows(res.text)
    assert [row[2] for row in rows[1:-1]] == ["round-2", "round-3"]
    assert rows[-1][1] == "audit_count=2"
    assert rows[-1][2] == "total_count=3"


@pytest.mark.asyncio
async def test_scoring_audit_csv_is_pro_gated(app_client, make_user, db_session):
    sid = str(uuid.uuid4())
    for tier in (UserTier.GUEST, UserTier.FREE, UserTier.PLUS):
        user = make_user(email=f"csv-{tier.value}@test.com", tier=tier)
        _seed_audit(db_session, user_id=user.id, session_id=sid)
    db_session.commit()

    for user in (make_user(email="csv-free2@test.com", tier=UserTier.FREE),
                 make_user(email="csv-plus2@test.com", tier=UserTier.PLUS)):
        res = await app_client.get(
            f"/api/analytics/scoring-audit/{sid}/export.csv",
            headers=_pro_headers(user),
        )
        assert res.status_code == 403
        assert res.json()["detail"]["error"] == "feature_not_allowed"
        assert res.json()["detail"]["upgrade_required"] == "pro"


@pytest.mark.asyncio
async def test_scoring_audit_csv_allows_plus_with_agent_addon(
    app_client, make_user, db_session
):
    user = make_user(email="csv-plus-addon@test.com", tier=UserTier.PLUS)
    user.agent_addon_active = True
    db_session.add(user)
    db_session.commit()
    sid = str(uuid.uuid4())
    _seed_audit(db_session, user_id=user.id, session_id=sid)
    db_session.commit()

    res = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert len(_rows(res.text)) == 3  # header + 1 round + footer


@pytest.mark.asyncio
async def test_scoring_audit_csv_hides_other_users_sessions(
    app_client, make_user, db_session
):
    owner = make_user(email="csv-owner@test.com", tier=UserTier.PRO)
    other = make_user(email="csv-other@test.com", tier=UserTier.PRO)
    sid = str(uuid.uuid4())
    _seed_audit(db_session, user_id=owner.id, session_id=sid)
    db_session.commit()

    for target in (sid, str(uuid.uuid4())):
        res = await app_client.get(
            f"/api/analytics/scoring-audit/{target}/export.csv",
            headers=_pro_headers(other),
        )
        assert res.status_code == 404
        assert res.json()["detail"]["error"] == "audit_not_found"


@pytest.mark.asyncio
async def test_scoring_audit_csv_requires_auth(app_client, make_user, db_session):
    user = make_user(email="csv-anon@test.com", tier=UserTier.PRO)
    sid = str(uuid.uuid4())
    _seed_audit(db_session, user_id=user.id, session_id=sid)
    db_session.commit()

    res = await app_client.get(f"/api/analytics/scoring-audit/{sid}/export.csv")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_scoring_audit_csv_neutralizes_formula_injection(
    app_client, make_user, db_session
):
    user = make_user(email="csv-injection@test.com", tier=UserTier.PRO)
    sid = str(uuid.uuid4())
    rec = _seed_audit(db_session, user_id=user.id, session_id=sid)
    rec.prompt_snippet = '=HYPERLINK("http://evil.example", "click")'
    rec.winner_persona_id = "+cmd|' /C calc'!A0"
    db_session.commit()

    res = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.text
    assert "'=HYPERLINK(" in body
    assert "'+cmd|' /C calc'!A0" in body
    # The raw trigger must never appear as the first character of a cell.
    assert not body.lstrip().startswith("=")


@pytest.mark.asyncio
async def test_scoring_audit_csv_sanitizes_attachment_filename(
    app_client, make_user, db_session
):
    user = make_user(email="csv-filename@test.com", tier=UserTier.PRO)
    sid = "audit csv x"
    _seed_audit(db_session, user_id=user.id, session_id=sid)
    db_session.commit()

    res = await app_client.get(
        f"/api/analytics/scoring-audit/{sid}/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert (
        res.headers["content-disposition"]
        == 'attachment; filename="arena-scoring-audit-audit_csv_x.csv"'
    )
