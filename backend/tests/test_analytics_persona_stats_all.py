"""Integration tests for GET /api/analytics/persona-stats.

Returns the deep-dive data for every catalog persona in one call,
sorted strongest-first. Lets a dashboard render a 16-persona grid
in one request instead of 16 separate /persona-stats/{id} calls.
"""

from __future__ import annotations

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


# ─── Core shape ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_all_returns_full_catalog_for_new_user(
    app_client, make_user
):
    """A user with no exchanges still sees all 16 personas — the grid
    renders even when there's no data. With min_appearances=1 the
    zeros are kept (the catalog is the contract)."""
    user = make_user(email="pall-catalog@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["total_personas"] == 16
    assert body["returned_personas"] == 16
    persona_ids = {r["persona_id"] for r in body["personas"]}
    assert persona_ids == set(PERSONA_METADATA.keys())
    # All zero.
    for row in body["personas"]:
        assert row["appearances"] == 0
        assert row["wins"] == 0
        assert row["win_rate"] == 0.0
        assert row["avg_winning_score"] is None
        assert row["last_appearance_at"] is None


@pytest.mark.asyncio
async def test_all_returns_persona_metadata(app_client, make_user, db_session):
    user = make_user(email="pall-meta@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats", headers=_pro_headers(user)
    )
    body = res.json()
    by_id = {r["persona_id"]: r for r in body["personas"]}
    assert by_id["analyst"]["name"] == "The Analyst"
    assert by_id["analyst"]["color"].startswith("#")


# ─── Aggregation correctness ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_all_aggregates_wins_and_appearances(app_client, make_user, db_session):
    user = make_user(email="pall-agg@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher", "pragmatist", "contrarian"]
    # 3 analyst wins, 1 philosopher win, 1 pragmatist win.
    for _ in range(3):
        _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst", panel=panel)
    _seed_audit(db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel)
    _seed_audit(db_session, user_id=user.id, winner_persona_id="pragmatist", panel=panel)
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats", headers=_pro_headers(user)
    )
    body = res.json()
    by_id = {r["persona_id"]: r for r in body["personas"]}
    # All 4 personas on the panel have 5 appearances each.
    assert by_id["analyst"]["appearances"] == 5
    assert by_id["philosopher"]["appearances"] == 5
    assert by_id["pragmatist"]["appearances"] == 5
    assert by_id["contrarian"]["appearances"] == 5
    # Win counts.
    assert by_id["analyst"]["wins"] == 3
    assert by_id["philosopher"]["wins"] == 1
    assert by_id["pragmatist"]["wins"] == 1
    assert by_id["contrarian"]["wins"] == 0


@pytest.mark.asyncio
async def test_all_avg_winning_score(app_client, make_user, db_session):
    """avg_winning_score is per-persona, across that persona's wins."""
    user = make_user(email="pall-avg@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # analyst wins at 80, 90, 100 → avg 90.
    for score in [80, 90, 100]:
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            score=score,
        )
    # philosopher wins at 50.
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="philosopher",
        panel=panel,
        score=50,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats", headers=_pro_headers(user)
    )
    by_id = {r["persona_id"]: r for r in res.json()["personas"]}
    assert by_id["analyst"]["avg_winning_score"] == 90.0
    assert by_id["philosopher"]["avg_winning_score"] == 50.0


@pytest.mark.asyncio
async def test_all_last_appearance_at(app_client, make_user, db_session):
    """last_appearance_at is per-persona, the most recent exchange
    where the persona was on the panel."""
    user = make_user(email="pall-last@test.com", tier=UserTier.PRO)
    # analyst: 72h ago, then never again.
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst"],
        hours_ago=72,
    )
    # philosopher: 24h ago.
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="philosopher",
        panel=["philosopher"],
        hours_ago=24,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats", headers=_pro_headers(user)
    )
    by_id = {r["persona_id"]: r for r in res.json()["personas"]}
    # Both have last_appearance_at; analyst's is older.
    assert by_id["analyst"]["last_appearance_at"] is not None
    assert by_id["philosopher"]["last_appearance_at"] is not None
    assert by_id["analyst"]["last_appearance_at"] < by_id["philosopher"]["last_appearance_at"]


# ─── Sort + filter ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_all_sorted_by_win_rate_descending(
    app_client, make_user, db_session
):
    """Strongest first; ties broken by appearances, then persona_id."""
    user = make_user(email="pall-sort@test.com", tier=UserTier.PRO)
    # stoic: 4/4 (1.0) — winner
    for _ in range(4):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="stoic", panel=["stoic"]
        )
    # engineer: 1/2 (0.5)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="engineer", panel=["engineer"]
    )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="stoic", panel=["engineer"]
    )
    # analyst: 0/1 (0.0)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="philosopher", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats", headers=_pro_headers(user)
    )
    persona_ids = [r["persona_id"] for r in res.json()["personas"]]
    # stoic (1.0) > engineer (0.5) > analyst (0.0); the rest of the
    # 13 personas are at 0/0 — they all tie with analyst at 0.0 and
    # break by persona_id alphabetical. Verify the first three.
    assert persona_ids[0] == "stoic"
    assert persona_ids[1] == "engineer"
    assert persona_ids[2] == "analyst"


@pytest.mark.asyncio
async def test_all_min_appearances_filter(app_client, make_user, db_session):
    """min_appearances is a noise-floor hint, not a row filter — the
    full catalog is always emitted, but rows below the threshold get
    below_min_appearances=True so the dashboard can dim or hide them.
    Pin the contract: total_personas == returned_personas always."""
    user = make_user(email="pall-min@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for _ in range(3):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel
        )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="stoic", panel=["stoic"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats?min_appearances=3",
        headers=_pro_headers(user),
    )
    body = res.json()
    by_id = {r["persona_id"]: r for r in body["personas"]}
    # Full catalog emitted.
    assert body["returned_personas"] == 16
    # analyst + philosopher met the floor; stoic didn't.
    assert by_id["analyst"]["below_min_appearances"] is False
    assert by_id["philosopher"]["below_min_appearances"] is False
    assert by_id["stoic"]["below_min_appearances"] is True
    # Uninvolved personas also flagged as below the floor.
    assert by_id["scientist"]["below_min_appearances"] is True
    assert by_id["scientist"]["appearances"] == 0


# ─── Honesty rules ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_all_excludes_fallback_wins(app_client, make_user, db_session):
    """Fallback rows (scorer LLM failed, index 0 won arbitrarily)
    don't count as real wins for the persona."""
    user = make_user(email="pall-fb@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    for _ in range(3):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=["analyst"],
            fallback_used=True,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats", headers=_pro_headers(user)
    )
    by_id = {r["persona_id"]: r for r in res.json()["personas"]}
    # 1 real win, 3 fallback wins; only the real one counts.
    assert by_id["analyst"]["wins"] == 1
    assert by_id["analyst"]["appearances"] == 4


@pytest.mark.asyncio
async def test_all_excludes_no_panel_rows(app_client, make_user, db_session):
    """Rows with no recorded panel don't contribute an appearance
    for any persona."""
    user = make_user(email="pall-nopanel@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=None
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats", headers=_pro_headers(user)
    )
    by_id = {r["persona_id"]: r for r in res.json()["personas"]}
    assert by_id["analyst"]["wins"] == 0
    assert by_id["analyst"]["appearances"] == 0


# ─── Tenant + auth + input ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_all_scoped_to_caller(app_client, make_user, db_session):
    alice = make_user(email="pall-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="pall-bob@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=alice.id, winner_persona_id="analyst", panel=["analyst"]
    )
    for _ in range(4):
        _seed_audit(
            db_session, user_id=bob.id, winner_persona_id="analyst", panel=["analyst"]
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats", headers=_pro_headers(alice)
    )
    by_id = {r["persona_id"]: r for r in res.json()["personas"]}
    # Alice's only exchange = 1 appearance, 1 win.
    assert by_id["analyst"]["wins"] == 1
    assert by_id["analyst"]["appearances"] == 1


@pytest.mark.asyncio
async def test_all_requires_auth(app_client):
    res = await app_client.get("/api/analytics/persona-stats")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_all_window_bounds_rejected(app_client, make_user):
    user = make_user(email="pall-bounds@test.com", tier=UserTier.PRO)
    for qs in ("window_days=0", "window_days=400"):
        res = await app_client.get(
            f"/api/analytics/persona-stats?{qs}", headers=_pro_headers(user)
        )
        assert res.status_code == 422, qs


@pytest.mark.asyncio
async def test_all_min_appearances_bounds_rejected(app_client, make_user):
    user = make_user(email="pall-min-bounds@test.com", tier=UserTier.PRO)
    for qs in ("min_appearances=0", "min_appearances=201"):
        res = await app_client.get(
            f"/api/analytics/persona-stats?{qs}", headers=_pro_headers(user)
        )
        assert res.status_code == 422, qs


@pytest.mark.asyncio
async def test_all_duplicate_persona_in_panel_counted_once(
    app_client, make_user, db_session
):
    """A persona seated twice in the same panel had one chance to win
    — count it once, not twice."""
    user = make_user(email="pall-dupe@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst", "analyst", "philosopher"],
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats", headers=_pro_headers(user)
    )
    by_id = {r["persona_id"]: r for r in res.json()["personas"]}
    assert by_id["analyst"]["appearances"] == 1
    assert by_id["analyst"]["wins"] == 1
    assert by_id["analyst"]["win_rate"] == 1.0


# ─── Reconciliation with the single-persona endpoint ──────────────────────


@pytest.mark.asyncio
async def test_all_rows_reconcile_to_single_endpoint(
    app_client, make_user, db_session
):
    """A row in the all-personas response must match the same persona's
    response from /persona-stats/{id} exactly. Pin the cross-endpoint
    consistency so a future refactor that changes one but not the
    other gets caught."""
    user = make_user(email="pall-recon@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher", "pragmatist"]
    for _ in range(4):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel
        )
    for _ in range(2):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel
        )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="pragmatist", panel=panel
    )
    db_session.commit()

    all_res = await app_client.get(
        "/api/analytics/persona-stats", headers=_pro_headers(user)
    )
    all_body = all_res.json()
    all_by_id = {r["persona_id"]: r for r in all_body["personas"]}

    for pid in ("analyst", "philosopher", "pragmatist"):
        single_res = await app_client.get(
            f"/api/analytics/persona-stats/{pid}", headers=_pro_headers(user)
        )
        single = single_res.json()
        # The all-endpoint uses the same field names; they must match.
        assert all_by_id[pid]["appearances"] == single["appearances"]
        assert all_by_id[pid]["wins"] == single["wins"]
        assert all_by_id[pid]["win_rate"] == single["win_rate"]
        assert all_by_id[pid]["avg_winning_score"] == single["avg_winning_score"]
        assert all_by_id[pid]["last_appearance_at"] == single["last_appearance_at"]
