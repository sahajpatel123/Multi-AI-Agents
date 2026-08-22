"""Integration tests for GET /api/analytics/persona-stats/{persona_id}/by-category/export.csv.

CSV export of the per-persona per-category breakdown. Reuses the JSON
route's computation so the export cannot drift from the dashboard.
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
    category: str | None = "question",
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
        prompt_category=category,
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
async def test_csv_has_header_only_when_no_data(app_client, make_user):
    user = make_user(email="pbcc-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.csv?window_days=7",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    rows = _parse_csv(res.text)
    assert rows[0] == [
        "category",
        "is_known_category",
        "is_uncategorized",
        "appearances",
        "wins",
        "win_rate",
    ]
    # Header + 1 footer row (no category rows for a brand-new user).
    assert len(rows) == 2


@pytest.mark.asyncio
async def test_csv_rows_match_json_by_category(
    app_client, make_user, db_session
):
    """The CSV must not drift from the JSON endpoint's categories[]."""
    user = make_user(email="pbcc-json@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for _ in range(3):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            category="question",
        )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        category="task",
    )
    db_session.commit()

    csv_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.csv?window_days=7",
        headers=_pro_headers(user),
    )
    json_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category?window_days=7",
        headers=_pro_headers(user),
    )
    assert csv_res.status_code == 200
    assert json_res.status_code == 200

    csv_rows = _parse_csv(csv_res.text)
    json_rows = json_res.json()["categories"]

    # Header + N data rows + 1 footer row.
    assert csv_rows[0] == [
        "category",
        "is_known_category",
        "is_uncategorized",
        "appearances",
        "wins",
        "win_rate",
    ]
    assert len(csv_rows) == 1 + len(json_rows) + 1

    for csv_row, json_row in zip(csv_rows[1:-1], json_rows):
        assert csv_row[0] == json_row["category"]
        # The boolean columns serialize as "true"/"false" in CSV; JSON
        # is True/False (Python). The on-disk format is the
        # CSV-friendly one.
        assert csv_row[1] == ("true" if json_row["is_known_category"] else "false")
        assert csv_row[2] == ("true" if json_row["is_uncategorized"] else "false")
        assert int(csv_row[3]) == json_row["appearances"]
        assert int(csv_row[4]) == json_row["wins"]
        assert float(csv_row[5]) == pytest.approx(json_row["win_rate"], abs=1e-4)


@pytest.mark.asyncio
async def test_csv_sort_order_matches_json(app_client, make_user, db_session):
    """Sort order is recognized enum order, then unknown alphabetical,
    then uncategorized — the same contract the JSON endpoint honors."""
    user = make_user(email="pbcc-order@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for cat in [None, "alpha_thing", "question"]:
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            category=cat,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.csv?window_days=7",
        headers=_pro_headers(user),
    )
    data_rows = _parse_csv(res.text)[1:-1]  # strip header + footer
    categories = [r[0] for r in data_rows]
    assert categories == ["question", "alpha_thing", "(uncategorized)"]


# ─── Filename + headers ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_filename_includes_persona_and_window(
    app_client, make_user
):
    user = make_user(email="pbcc-name@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.csv?window_days=7",
        headers=_pro_headers(user),
    )
    cd = res.headers["content-disposition"]
    assert cd.startswith("attachment; filename=")
    assert "arena-by-category-analyst-" in cd
    assert ".csv" in cd
    # The server stamps UTC dates, so compare against UTC's today — not
    # the local one (they differ whenever this machine is ahead of UTC).
    from arena.core.datetime_utils import utcnow_naive

    assert utcnow_naive().date().isoformat() in cd


@pytest.mark.asyncio
async def test_csv_has_security_headers(app_client, make_user):
    user = make_user(email="pbcc-sec@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.csv?window_days=7",
        headers=_pro_headers(user),
    )
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-content-type-options"] == "nosniff"


# ─── Footer rollup ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_footer_rollup_contains_totals(
    app_client, make_user, db_session
):
    """The footer carries total_appearances, total_wins, and the
    uncategorized counts so the file is self-describing when opened
    in isolation."""
    user = make_user(email="pbcc-footer@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for _ in range(3):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel
        )
    # 2 uncategorized appearances, 1 win.
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        category=None,
    )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="philosopher",
        panel=panel,
        category=None,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.csv?window_days=7",
        headers=_pro_headers(user),
    )
    rows = _parse_csv(res.text)
    footer = rows[-1]
    assert footer[0].startswith("# total_appearances=")
    assert "total_wins=" in footer[1]
    assert "uncategorized_appearances=" in footer[2]
    assert "uncategorized_wins=" in footer[3]
    # 3 question wins + 1 uncat analyst win = 4 wins total.
    assert "total_wins=4" in footer[1]
    assert "uncategorized_wins=1" in footer[3]


@pytest.mark.asyncio
async def test_csv_footer_matches_json_rollup(
    app_client, make_user, db_session
):
    user = make_user(email="pbcc-rollup@test.com", tier=UserTier.PRO)
    for _ in range(2):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
        )
    db_session.commit()

    csv_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.csv?window_days=7",
        headers=_pro_headers(user),
    )
    json_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category?window_days=7",
        headers=_pro_headers(user),
    )
    rows = _parse_csv(csv_res.text)
    footer = rows[-1]
    json_body = json_res.json()
    assert f"total_appearances={json_body['total_appearances']}" in footer[0]
    assert f"total_wins={json_body['total_wins']}" in footer[1]
    assert f"uncategorized_appearances={json_body['uncategorized_appearances']}" in footer[2]
    assert f"uncategorized_wins={json_body['uncategorized_wins']}" in footer[3]


# ─── Tenant + auth + input ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_scoped_to_caller(app_client, make_user, db_session):
    alice = make_user(email="pbcc-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="pbcc-bob@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=alice.id, winner_persona_id="analyst", panel=["analyst"]
    )
    for _ in range(5):
        _seed_audit(
            db_session, user_id=bob.id, winner_persona_id="analyst", panel=["analyst"]
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.csv?window_days=7",
        headers=_pro_headers(alice),
    )
    rows = _parse_csv(res.text)
    # Header + 1 data row + 1 footer. Total wins across all rows
    # (excluding footer) = 1, alice's only exchange.
    data_rows = rows[1:-1]
    assert sum(int(r[4]) for r in data_rows) == 1
    assert sum(int(r[3]) for r in data_rows) == 1


@pytest.mark.asyncio
async def test_csv_requires_auth(app_client):
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.csv"
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_csv_unknown_persona_404(app_client, make_user):
    user = make_user(email="pbcc-404@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/retired_mind/by-category/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_csv_window_bounds_rejected(app_client, make_user):
    user = make_user(email="pbcc-bounds@test.com", tier=UserTier.PRO)
    for qs in ("window_days=0", "window_days=400"):
        res = await app_client.get(
            f"/api/analytics/persona-stats/analyst/by-category/export.csv?{qs}",
            headers=_pro_headers(user),
        )
        assert res.status_code == 422, qs


@pytest.mark.asyncio
async def test_csv_window_max_reachable(app_client, make_user):
    """le=365 is reachable — 422 is only above the cap, not at it."""
    user = make_user(email="pbcc-365@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.csv?window_days=365",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_csv_uppercase_persona_id_normalized(
    app_client, make_user, db_session
):
    user = make_user(email="pbcc-case@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/ANALYST/by-category/export.csv?window_days=7",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    # Filename uses canonical lowercase form.
    assert "arena-by-category-analyst-" in res.headers["content-disposition"]


# ─── Polish pass ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_whitespace_persona_id_normalized(
    app_client, make_user, db_session
):
    """Whitespace around persona_id is stripped before lookup, matching
    the JSON endpoint's normalization contract. Without this, a
    trailing space from a copy-paste would 404."""
    user = make_user(email="pbcc-ws@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/%20analyst%20/by-category/export.csv?window_days=7",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert "arena-by-category-analyst-" in res.headers["content-disposition"]


@pytest.mark.asyncio
async def test_csv_unknown_persona_error_envelope_shape(app_client, make_user):
    """404 follows the project's standard error envelope:
    {"detail": {"error": <code>, "message": <human-readable>}}.
    FastAPI wraps HTTPException details inside `detail`."""
    user = make_user(email="pbcc-env@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/retired_mind/by-category/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404
    body = res.json()
    assert "detail" in body
    assert "error" in body["detail"]
    assert "message" in body["detail"]
    assert body["detail"]["error"] == "unknown_persona"


@pytest.mark.asyncio
async def test_csv_footer_matches_sum_of_data_rows(
    app_client, make_user, db_session
):
    """Pin the reconciliation invariant: sum(categories[].appearances)
    + uncategorized_appearances == total_appearances, same for wins.
    A future 'let's also count fallback rows' or 'let's drop the
    footer field' change must not silently break this."""
    user = make_user(email="pbcc-recon@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # 3 question wins, 1 task win, 1 task loss, 2 uncat (1 win + 1 loss).
    for _ in range(3):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
            category="question",
        )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
        category="task",
    )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel,
        category="task",
    )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
        category=None,
    )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel,
        category=None,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.csv?window_days=7",
        headers=_pro_headers(user),
    )
    rows = _parse_csv(res.text)
    footer = rows[-1]
    data_rows = rows[1:-1]
    # Sum data rows + uncategorized = total.
    sum_apps = sum(int(r[3]) for r in data_rows)
    sum_wins = sum(int(r[4]) for r in data_rows)
    # The uncategorized row IS one of the data rows (not separate).
    # Total = sum(data rows). The footer surfaces the same total.
    assert f"total_appearances={sum_apps}" in footer[0]
    assert f"total_wins={sum_wins}" in footer[1]


@pytest.mark.asyncio
async def test_csv_window_min_reachable(app_client, make_user):
    """ge=1 is reachable, not just the le=365 cap. The full Query
    range is usable."""
    user = make_user(email="pbcc-min@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.csv?window_days=1",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
