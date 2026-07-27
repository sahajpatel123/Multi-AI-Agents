"""Integration tests for /api/analytics/persona-win-rate/export.csv.

The CSV export reuses the JSON endpoint's computation, so the tests here
focus on the CSV-specific contract: header row, row order, content type,
filename, and that the CSV shape never drifts from the JSON personas[]
rows the user actually consumes in the dashboard.
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
        fallback_used=False,
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
    user = make_user(email="csv-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.csv",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    rows = _parse_csv(res.text)
    assert rows == [
        [
            "persona_id",
            "name",
            "appearances",
            "wins",
            "win_rate",
            "low_confidence",
        ]
    ]


@pytest.mark.asyncio
async def test_csv_rows_match_json_personas(app_client, make_user, db_session):
    """The CSV must never drift from the JSON endpoint's personas[] shape."""
    user = make_user(email="csv-json@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher", "pragmatist"]
    # analyst wins twice, philosopher wins once, pragmatist never.
    _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst", panel=panel)
    _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst", panel=panel)
    _seed_audit(db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel)
    db_session.commit()

    csv_res = await app_client.get(
        "/api/analytics/persona-win-rate/export.csv",
        headers=_pro_headers(user),
    )
    json_res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    assert csv_res.status_code == 200
    assert json_res.status_code == 200

    csv_rows = _parse_csv(csv_res.text)
    json_rows = json_res.json()["personas"]

    # Header + N rows; column order matches JSON personas[] order.
    assert len(csv_rows) == 1 + len(json_rows)
    assert csv_rows[0] == [
        "persona_id",
        "name",
        "appearances",
        "wins",
        "win_rate",
        "low_confidence",
    ]

    for csv_row, json_row in zip(csv_rows[1:], json_rows):
        assert csv_row[0] == json_row["persona_id"]
        assert csv_row[1] == json_row["name"]
        assert int(csv_row[2]) == json_row["appearances"]
        assert int(csv_row[3]) == json_row["wins"]
        assert float(csv_row[4]) == pytest.approx(json_row["win_rate"], abs=1e-3)
        assert csv_row[5] == ("true" if json_row["low_confidence"] else "false")


@pytest.mark.asyncio
async def test_csv_row_order_matches_json(app_client, make_user, db_session):
    """Strongest first — same ordering as the JSON personas[] list."""
    user = make_user(email="csv-order@test.com", tier=UserTier.PRO)
    # 4 stoic wins + 2 analyst wins from a stable panel of [stoic, analyst]
    # → stoic 4/6 (0.667) > analyst 2/6 (0.333). Pragmatist panel is a
    # separate exchange to give us a third ranking tier.
    for _ in range(4):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="stoic",
            panel=["stoic", "analyst"],
        )
    for _ in range(2):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=["stoic", "analyst"],
        )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="pragmatist",
        panel=["pragmatist"],
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.csv?min_appearances=1",
        headers=_pro_headers(user),
    )
    rows = _parse_csv(res.text)[1:]
    persona_ids = [row[0] for row in rows]
    # pragmatist 1/1 (1.0) > stoic 4/6 (0.667) > analyst 2/6 (0.333)
    assert persona_ids.index("pragmatist") < persona_ids.index("stoic")
    assert persona_ids.index("stoic") < persona_ids.index("analyst")


# ─── Filename + headers ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_filename_includes_window(app_client, make_user, db_session):
    user = make_user(email="csv-name@test.com", tier=UserTier.PRO)
    _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"])
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.csv?window_days=7",
        headers=_pro_headers(user),
    )
    cd = res.headers["content-disposition"]
    assert cd.startswith("attachment; filename=")
    # Filename must contain the window dates so users can save multiple
    # exports without overwriting each other.
    assert "arena-persona-win-rate-" in cd
    assert ".csv" in cd


@pytest.mark.asyncio
async def test_csv_has_no_store_cache_header(app_client, make_user):
    """No-store keeps a logged-in user's history out of shared caches."""
    user = make_user(email="csv-cache@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.csv",
        headers=_pro_headers(user),
    )
    assert res.headers["cache-control"] == "no-store"


# ─── Empty + tenant isolation + auth ──────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_min_appearances_filter_applies(app_client, make_user, db_session):
    """The same min_appearances Query drives both JSON and CSV."""
    user = make_user(email="csv-min@test.com", tier=UserTier.PRO)
    # 3 exchanges on an [analyst, philosopher] panel → both have 3
    # appearances and pass min_appearances=3. Stoic's solo panel sits at
    # 1 appearance and must be filtered out.
    for _ in range(3):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=["analyst", "philosopher"],
        )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="stoic", panel=["stoic"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.csv?min_appearances=3",
        headers=_pro_headers(user),
    )
    rows = _parse_csv(res.text)
    # Header + analyst + philosopher (both at 3 appearances) — stoic hidden.
    persona_ids = {row[0] for row in rows[1:]}
    assert persona_ids == {"analyst", "philosopher"}
    assert "stoic" not in persona_ids


@pytest.mark.asyncio
async def test_csv_scoped_to_caller(app_client, make_user, db_session):
    """Alice's exports must not contain Bob's data."""
    alice = make_user(email="csv-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="csv-bob@test.com", tier=UserTier.PRO)
    _seed_audit(db_session, user_id=alice.id, winner_persona_id="analyst", panel=["analyst"])
    for _ in range(3):
        _seed_audit(
            db_session, user_id=bob.id, winner_persona_id="stoic", panel=["stoic"]
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.csv", headers=_pro_headers(alice)
    )
    rows = _parse_csv(res.text)
    persona_ids = [row[0] for row in rows[1:]]
    assert persona_ids == ["analyst"]


@pytest.mark.asyncio
async def test_csv_requires_auth(app_client):
    res = await app_client.get("/api/analytics/persona-win-rate/export.csv")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_csv_window_bounds_rejected(app_client, make_user):
    user = make_user(email="csv-bounds@test.com", tier=UserTier.PRO)
    for qs in ("window_days=0", "window_days=400", "min_appearances=0", "min_appearances=201"):
        res = await app_client.get(
            f"/api/analytics/persona-win-rate/export.csv?{qs}",
            headers=_pro_headers(user),
        )
        assert res.status_code == 422, qs
