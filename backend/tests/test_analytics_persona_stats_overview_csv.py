"""Integration tests for GET /api/analytics/persona-stats/export.csv.

CSV export of the all-personas summary catalog. Reuses the JSON route's
computation so CSV export and API stay synchronized.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import timedelta

import pytest

from arena.core.agents import PERSONA_METADATA
from arena.core.datetime_utils import utcnow_naive
from arena.db_models import ScoringAudit, UserTier


def _seed_audit(
    db,
    *,
    user_id: int,
    winner_persona_id: str,
    panel: list[str],
    score: int = 80,
    hours_ago: int = 1,
    fallback_used: bool = False,
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
        fallback_used=fallback_used,
        created_at=utcnow_naive() - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


def _pro_headers(user) -> dict[str, str]:
    from arena.core.auth import create_access_token
    token = create_access_token(user.id, user.email)
    return {"Authorization": f"Bearer {token}"}


def _parse_csv(text: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(text)))


@pytest.mark.asyncio
async def test_persona_stats_overview_csv_auth_required(app_client):
    res = await app_client.get("/api/analytics/persona-stats/export.csv")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_persona_stats_overview_csv_empty_catalog(app_client, make_user):
    user = make_user(email="csv-overview-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/export.csv", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "text/csv; charset=utf-8"
    assert "attachment; filename=" in res.headers["content-disposition"]

    rows = _parse_csv(res.text)
    # Header + 16 personas + 1 footer rollup
    assert len(rows) == 18
    header = rows[0]
    assert header == [
        "persona_id",
        "name",
        "appearances",
        "wins",
        "win_rate",
        "avg_winning_score",
        "last_appearance_at",
        "last_win_at",
        "below_min_appearances",
    ]

    # Data rows: 16 personas, zero appearances
    data_rows = rows[1:-1]
    p_ids = {r[0] for r in data_rows}
    assert p_ids == set(PERSONA_METADATA.keys())
    for r in data_rows:
        assert r[2] == "0"  # appearances
        assert r[3] == "0"  # wins
        assert r[4] == "0.0"  # win_rate

    # Footer rollup row: empty catalog has zero wins, so best_persona_id is analyst (first alphabetically)
    footer = rows[-1]
    assert footer[0] == "# total_appearances=0"
    assert footer[1] == "total_wins=0"
    assert footer[2] == "best_persona_id=analyst"


@pytest.mark.asyncio
async def test_persona_stats_overview_csv_populated(app_client, make_user, db_session):
    user = make_user(email="csv-overview-pop@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher", "pragmatist", "contrarian"]

    # Seed 3 wins for analyst (score 90), 1 win for philosopher (score 70)
    for _ in range(3):
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
        winner_persona_id="philosopher",
        panel=panel,
        score=70,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/export.csv", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    rows = _parse_csv(res.text)
    row_map = {r[0]: r for r in rows[1:-1]}

    # Analyst: 4 appearances, 3 wins, win_rate 0.75, avg_score 90.0
    analyst_row = row_map["analyst"]
    assert analyst_row[2] == "4"  # appearances
    assert analyst_row[3] == "3"  # wins
    assert analyst_row[4] == "0.75"  # win_rate
    assert analyst_row[5] == "90.0"  # avg_winning_score

    # Philosopher: 4 appearances, 1 win, win_rate 0.25, avg_score 70.0
    philosopher_row = row_map["philosopher"]
    assert philosopher_row[2] == "4"
    assert philosopher_row[3] == "1"
    assert philosopher_row[4] == "0.25"
    assert philosopher_row[5] == "70.0"

    # Pragmatist & Contrarian: 4 appearances, 0 wins
    pragmatist_row = row_map["pragmatist"]
    assert pragmatist_row[2] == "4"
    assert pragmatist_row[3] == "0"
    assert pragmatist_row[4] == "0.0"
    assert pragmatist_row[5] == ""  # None -> empty string in CSV

    # Footer rollup row
    footer = rows[-1]
    assert footer[0] == "# total_appearances=16"  # 4 personas seated x 4 audits
    assert footer[1] == "total_wins=4"
    assert footer[2] == "best_persona_id=analyst"


@pytest.mark.asyncio
async def test_persona_stats_overview_csv_window_days_filtering(app_client, make_user, db_session):
    user = make_user(email="csv-overview-win@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]

    # Audit inside window (2 days ago)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        hours_ago=48,
    )
    # Audit outside window (10 days ago)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="philosopher",
        panel=panel,
        hours_ago=240,
    )
    db_session.commit()

    # With window_days=5, only 48h ago is included
    res = await app_client.get(
        "/api/analytics/persona-stats/export.csv?window_days=5",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    rows = _parse_csv(res.text)
    row_map = {r[0]: r for r in rows[1:-1]}

    assert row_map["analyst"][3] == "1"  # 1 win
    assert row_map["philosopher"][3] == "0"  # 0 wins in window

    footer = rows[-1]
    assert footer[0] == "# total_appearances=2"
    assert footer[1] == "total_wins=1"
    assert footer[2] == "best_persona_id=analyst"
