"""Integration tests for GET /api/analytics/summary."""

from __future__ import annotations

import csv
import io
import json
import uuid
from datetime import timedelta

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import ScoringAudit, SessionSummary, UserTier


def _parse_csv(text: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(text)))


def _seed_summary_audit(
    db,
    *,
    user_id: int,
    winner_persona_id: str,
    panel: list[str],
    category: str = "question",
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
        prompt_category=category,
        fallback_used=False,
        created_at=utcnow_naive() - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec



@pytest.mark.asyncio
async def test_summary_returns_dict(app_client, make_user):
    user = make_user(email="ana-ok@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/analytics/summary", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, dict)


@pytest.mark.asyncio
async def test_summary_returns_empty_array_for_new_user(app_client, make_user):
    """A fresh user with no session summaries must get an empty list (not 404)."""
    user = make_user(email="ana-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/analytics/summary", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    # Summaries list exists, just empty.
    assert isinstance(body, dict)


@pytest.mark.asyncio
async def test_summary_requires_auth(app_client):
    res = await app_client.get("/api/analytics/summary")
    assert res.status_code == 401
    # Behavior-level envelope pin (cycle-89 pattern): the auth dependency
    # raises dict-shape detail via dependencies.py.
    detail = res.json().get("detail")
    assert isinstance(detail, dict)
    assert "error" in detail
    assert "message" in detail


@pytest.mark.asyncio
async def test_summary_csv_rows_match_json(app_client, make_user, db_session):
    """CSV metric rows must match every top-level key in the JSON
    summary response — the export and the API cannot drift."""
    user = make_user(email="summary-csv@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    _seed_summary_audit(
        db_session, user_id=user.id, winner_persona_id="analyst",
        panel=panel, category="question",
    )
    db_session.commit()

    json_res = await app_client.get(
        "/api/analytics/summary", headers=_pro_headers(user)
    )
    csv_res = await app_client.get(
        "/api/analytics/summary/export.csv", headers=_pro_headers(user)
    )
    assert csv_res.status_code == 200

    json_body = json_res.json()
    rows = _parse_csv(csv_res.text)
    data_rows = rows[:-1]  # strip only the footer
    csv_metrics = {row[0]: row[1] for row in data_rows if not row[0].startswith("#")}

    # Every scalar metric in the JSON must have a matching CSV row.
    for key in ("total_prompts", "total_debates", "total_discusses",
                "total_saved", "engagement_rate", "current_streak",
                "longest_streak", "avg_session_prompts",
                "avg_winning_score", "drift_rate", "window_days"):
        assert key in csv_metrics, f"missing metric {key} in CSV"
        assert csv_metrics[key] == str(json_body[key])


@pytest.mark.asyncio
async def test_summary_csv_footer_matches_json(app_client, make_user, db_session):
    """CSV footer must contain the same totals as the JSON response."""
    user = make_user(email="summary-ftr@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for _ in range(3):
        _seed_summary_audit(
            db_session, user_id=user.id, winner_persona_id="analyst",
            panel=panel, category="question",
        )
    db_session.commit()

    json_res = await app_client.get(
        "/api/analytics/summary", headers=_pro_headers(user)
    )
    csv_res = await app_client.get(
        "/api/analytics/summary/export.csv", headers=_pro_headers(user)
    )

    json_body = json_res.json()
    rows = _parse_csv(csv_res.text)
    footer = rows[-1]
    assert f"# total_prompts={json_body['total_prompts']}" in footer[0]
    assert f"total_debates={json_body['total_debates']}" in footer[1]


@pytest.mark.asyncio
async def test_summary_csv_requires_auth(app_client):
    """CSV export must enforce auth the same way the JSON endpoint does."""
    res = await app_client.get("/api/analytics/summary/export.csv")
    assert res.status_code == 401


# ── Hardening tests for symmetry (polish pass) ──


@pytest.mark.asyncio
async def test_summary_csv_persona_wins_matches_json(app_client, make_user, db_session):
    """CSV persona_wins section must match the JSON persona_wins dict.
    The export and the API cannot drift on persona win counts."""
    user = make_user(email="summary-pw-csv@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    _seed_summary_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=panel
    )
    _seed_summary_audit(
        db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel
    )
    _seed_summary_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=panel
    )
    db_session.commit()

    json_res = await app_client.get(
        "/api/analytics/summary", headers=_pro_headers(user)
    )
    csv_res = await app_client.get(
        "/api/analytics/summary/export.csv", headers=_pro_headers(user)
    )
    json_body = json_res.json()
    rows = _parse_csv(csv_res.text)
    data_rows = rows[:-1]

    # Extract persona_wins from CSV (rows starting with "persona_wins:")
    csv_persona_wins = {}
    for row in data_rows:
        if row[0].startswith("persona_wins:"):
            pid = row[0][len("persona_wins:"):]
            csv_persona_wins[pid] = int(row[1])

    # Must match JSON exactly
    assert csv_persona_wins == json_body["persona_wins"]


@pytest.mark.asyncio
async def test_summary_csv_topic_distribution_matches_json(app_client, make_user, db_session):
    """CSV topic_distribution section must match the JSON array.
    The export and the API cannot drift on topic counts."""
    user = make_user(email="summary-td-csv@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # Need session summaries with topics for topic_distribution
    summary_row = SessionSummary(
        session_id=str(uuid.uuid4()),
        user_id=user.id,
        main_topics=["math", "science"],
        dominant_category="question",
        preferred_depth="deep",
        session_summary="Test summary",
        key_positions_taken=[],
        compressed_at=utcnow_naive(),
    )
    db_session.add(summary_row)
    db_session.commit()

    json_res = await app_client.get(
        "/api/analytics/summary?topic_limit=10", headers=_pro_headers(user)
    )
    csv_res = await app_client.get(
        "/api/analytics/summary/export.csv?topic_limit=10", headers=_pro_headers(user)
    )
    json_body = json_res.json()
    rows = _parse_csv(csv_res.text)
    data_rows = rows[:-1]

    # Extract topic_distribution from CSV (rows starting with "topic:")
    csv_topics = []
    for row in data_rows:
        if row[0].startswith("topic:"):
            topic = row[0][len("topic:"):]
            count = int(row[1])
            csv_topics.append({"topic": topic, "count": count})

    # Must match JSON exactly (order matters)
    assert csv_topics == json_body["topic_distribution"]


@pytest.mark.asyncio
async def test_summary_csv_header_only_when_no_data(app_client, make_user):
    """When a user has no data in the window, the CSV must return
    a valid response with all scalar metrics at zero plus footer —
    never a crash on empty iteration."""
    user = make_user(email="summary-empty-csv@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/summary/export.csv", headers=_pro_headers(user)
    )
    rows = _parse_csv(res.text)
    # Must have at least header + footer
    assert len(rows) >= 2
    assert rows[0] == ["metric", "value"]
    # Footer must be present and contain zero totals
    footer = rows[-1]
    assert footer[0].startswith("# total_prompts=0")
    assert "total_debates=0" in footer[1]
    assert "total_discusses=0" in footer[2]
    assert "total_saved=0" in footer[3]


@pytest.mark.asyncio
async def test_summary_csv_security_headers(app_client, make_user, db_session):
    """CSV responses must carry the same security headers as JSON
    analytics responses — X-Content-Type-Options blocks MIME
    sniffing and Cache-Control prevents stale file reuse."""
    user = make_user(email="summary-headers@test.com", tier=UserTier.PRO)
    _seed_summary_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/summary/export.csv", headers=_pro_headers(user)
    )
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("cache-control") == "no-store"
    assert "attachment" in res.headers.get("content-disposition", "")
