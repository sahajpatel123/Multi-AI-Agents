"""Integration tests for GET /api/analytics/persona-stats/{persona_id}/timeline/export.csv.

CSV export of the per-persona timeline. Reuses the JSON route's
computation so the export cannot drift from the dashboard's view.
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
    winner_persona_id: str,
    panel: list[str],
    hours_ago: int = 1,
    fallback_used: bool = False,
) -> ScoringAudit:
    rec = ScoringAudit(
        session_id=str(uuid.uuid4()),
        user_id=user_id,
        prompt_snippet="x",
        winner_agent_id="agent-1",
        winner_persona_id=winner_persona_id,
        winner_score=80,
        scores={"agent-1": 80},
        persona_ids_used=panel,
        fallback_used=fallback_used,
        created_at=utcnow_naive() - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


def _parse_csv(text: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(text)))


# ─── Core shape ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_has_header_row_only_when_no_data(app_client, make_user):
    user = make_user(email="ptlc-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.csv?days=7",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    rows = _parse_csv(res.text)
    # Header + 7 day rows + 1 footer rollup row.
    assert rows[0] == ["date", "appearances", "wins", "win_rate"]
    assert len(rows) == 1 + 7 + 1


@pytest.mark.asyncio
async def test_csv_rows_match_json_timeline(app_client, make_user, db_session):
    """The CSV must not drift from the JSON timeline's per-day shape."""
    user = make_user(email="ptlc-json@test.com", tier=UserTier.PRO)
    # 2 wins on day 0, 1 win on day -1.
    for _ in range(2):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
        )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst"],
        hours_ago=25,
    )
    db_session.commit()

    csv_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.csv?days=7",
        headers=_pro_headers(user),
    )
    json_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    assert csv_res.status_code == 200
    assert json_res.status_code == 200

    csv_rows = _parse_csv(csv_res.text)
    json_rows = json_res.json()["timeline"]

    # Header + N data rows + 1 footer.
    assert csv_rows[0] == ["date", "appearances", "wins", "win_rate"]
    assert len(csv_rows) == 1 + len(json_rows) + 1

    for csv_row, json_row in zip(csv_rows[1:-1], json_rows):
        assert csv_row[0] == json_row["date"]
        assert int(csv_row[1]) == json_row["appearances"]
        assert int(csv_row[2]) == json_row["wins"]
        assert float(csv_row[3]) == pytest.approx(json_row["win_rate"], abs=1e-4)


@pytest.mark.asyncio
async def test_csv_row_order_is_chronological(
    app_client, make_user, db_session
):
    """Rows are oldest-first — matches the JSON timeline contract."""
    user = make_user(email="ptlc-order@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst"],
        hours_ago=1,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.csv?days=7",
        headers=_pro_headers(user),
    )
    data_rows = _parse_csv(res.text)[1:-1]  # strip header + footer
    dates = [row[0] for row in data_rows]
    assert dates == sorted(dates)
    # And the last data row is today.
    from datetime import date
    assert dates[-1] == date.today().isoformat()


# ─── Filename + headers ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_filename_includes_persona_and_window(
    app_client, make_user
):
    user = make_user(email="ptlc-name@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.csv?days=7",
        headers=_pro_headers(user),
    )
    cd = res.headers["content-disposition"]
    assert cd.startswith("attachment; filename=")
    assert "arena-timeline-analyst-" in cd
    assert ".csv" in cd
    # Window dates must appear so multiple downloads don't collide.
    from datetime import date
    assert date.today().isoformat() in cd


@pytest.mark.asyncio
async def test_csv_has_security_headers(app_client, make_user):
    user = make_user(email="ptlc-sec@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.csv?days=7",
        headers=_pro_headers(user),
    )
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-content-type-options"] == "nosniff"


# ─── Footer rollup ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_footer_rollup_contains_totals(
    app_client, make_user, db_session
):
    """The footer row carries the total_appearances, total_wins, and
    best_day so the file is self-describing when opened in isolation."""
    user = make_user(email="ptlc-footer@test.com", tier=UserTier.PRO)
    for _ in range(3):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.csv?days=7",
        headers=_pro_headers(user),
    )
    rows = _parse_csv(res.text)
    footer = rows[-1]
    # Footer is one row with 4 cells; the first is "# total_appearances=N".
    assert footer[0].startswith("# total_appearances=")
    assert "total_wins=" in footer[1]
    assert "best_day=" in footer[2]
    assert "best_day_wins=" in footer[3]
    # 3 wins seeded → best_day_wins must reflect that.
    assert "best_day_wins=3" in footer[3]


@pytest.mark.asyncio
async def test_csv_footer_rollup_matches_json(
    app_client, make_user, db_session
):
    """Footer values must equal the JSON endpoint's rollup fields."""
    user = make_user(email="ptlc-rollup@test.com", tier=UserTier.PRO)
    for _ in range(2):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
        )
    db_session.commit()

    csv_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.csv?days=7",
        headers=_pro_headers(user),
    )
    json_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    csv_body = csv_res.json() if csv_res.headers.get("content-type", "").startswith("application/json") else None
    json_body = json_res.json()

    rows = _parse_csv(csv_res.text)
    footer = rows[-1]
    # Pull the totals out of the footer cells.
    assert f"total_appearances={json_body['total_appearances']}" in footer[0]
    assert f"total_wins={json_body['total_wins']}" in footer[1]
    assert f"best_day={json_body['best_day']}" in footer[2]
    assert f"best_day_wins={json_body['best_day_wins']}" in footer[3]


# ─── Tenant + auth + input ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_scoped_to_caller(app_client, make_user, db_session):
    alice = make_user(email="ptlc-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="ptlc-bob@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=alice.id, winner_persona_id="analyst", panel=["analyst"]
    )
    for _ in range(5):
        _seed_audit(
            db_session, user_id=bob.id, winner_persona_id="analyst", panel=["analyst"]
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.csv?days=7",
        headers=_pro_headers(alice),
    )
    rows = _parse_csv(res.text)[1:-1]
    # 7 day rows. Only the last one has wins (1, alice's).
    assert sum(int(r[2]) for r in rows) == 1
    assert sum(int(r[1]) for r in rows) == 1


@pytest.mark.asyncio
async def test_csv_requires_auth(app_client):
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.csv"
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_csv_unknown_persona_404(app_client, make_user):
    user = make_user(email="ptlc-404@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/retired_mind/timeline/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_csv_days_bounds_rejected(app_client, make_user):
    user = make_user(email="ptlc-bounds@test.com", tier=UserTier.PRO)
    for qs in ("days=0", "days=91", "days=400"):
        res = await app_client.get(
            f"/api/analytics/persona-stats/analyst/timeline/export.csv?{qs}",
            headers=_pro_headers(user),
        )
        assert res.status_code == 422, qs


@pytest.mark.asyncio
async def test_csv_days_max_reachable(app_client, make_user):
    """le=90 is reachable — 422 is only above the cap, not at it."""
    user = make_user(email="ptlc-90@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.csv?days=90",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    rows = _parse_csv(res.text)
    # 90 data rows + header + footer.
    assert len(rows) == 1 + 90 + 1


# ─── Injection defense ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_persona_id_filename_is_safened(
    app_client, make_user, db_session, monkeypatch
):
    """A poisoned persona id (e.g., one that resolves to '=cmd|...')
    must be neutralized in the filename, matching the win-rate CSV
    export's CWE-1236 defense."""
    from arena.core import agents as agents_module

    poisoned = {
        "analyst": {"name": "=cmd|'/c calc'!A1", "color": "#000"},
    }
    monkeypatch.setattr(agents_module, "PERSONA_METADATA", poisoned)

    user = make_user(email="ptlc-poison@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    # The 'analyst' id is safe; the name would be in the body but
    # not the filename. The filename is built from pid, not name, so
    # it stays safe.
    cd = res.headers["content-disposition"]
    assert "analyst" in cd
    assert "=" not in cd.replace("attachment; filename=", "")
