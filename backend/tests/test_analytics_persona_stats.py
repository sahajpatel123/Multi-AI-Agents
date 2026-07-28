"""Integration tests for GET /api/analytics/persona-stats/{persona_id}.

Companion to /analytics/persona-win-rate — drills into one persona
with extra signals the aggregate view doesn't surface
(avg_winning_score, last_win_at, best_prompt_category).
"""

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
    winner_persona_id: str,
    panel: list[str],
    score: int = 80,
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
        winner_score=score,
        scores={"agent-1": score},
        persona_ids_used=panel,
        prompt_category=category,
        fallback_used=fallback_used,
        created_at=utcnow_naive() - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


# ─── Happy path ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stats_returns_persona_metadata(app_client, make_user, db_session):
    user = make_user(email="pstats-meta@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["persona_id"] == "analyst"
    assert body["name"] == "The Analyst"
    assert body["color"].startswith("#")


@pytest.mark.asyncio
async def test_stats_wins_and_appearances(app_client, make_user, db_session):
    user = make_user(email="pstats-wins@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # 3 analyst wins, 1 philosopher win
    for _ in range(3):
        _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst", panel=panel)
    _seed_audit(db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel)
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["wins"] == 3
    assert body["appearances"] == 4
    assert body["win_rate"] == 0.75


@pytest.mark.asyncio
async def test_stats_avg_winning_score(app_client, make_user, db_session):
    """avg_winning_score is the average winner_score across WINS only,
    not appearances. A persona with 5/10 wins at avg 90 is stronger than
    5/10 at 51 — this signal is what the aggregate view hides."""
    user = make_user(email="pstats-avg@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for score in [80, 90, 100]:
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            score=score,
        )
    # A non-win appearance must NOT contribute to avg_winning_score.
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["avg_winning_score"] == 90.0  # (80+90+100)/3


@pytest.mark.asyncio
async def test_stats_avg_winning_score_null_when_no_wins(
    app_client, make_user, db_session
):
    user = make_user(email="pstats-avg-null@test.com", tier=UserTier.PRO)
    for _ in range(3):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="philosopher", panel=["analyst"]
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["wins"] == 0
    assert body["appearances"] == 3
    assert body["avg_winning_score"] is None


@pytest.mark.asyncio
async def test_stats_last_dates(app_client, make_user, db_session):
    """last_win_at / last_appearance_at surface as ISO strings."""
    user = make_user(email="pstats-dates@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst"],
        hours_ago=72,
    )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="philosopher",
        panel=["analyst"],
        hours_ago=24,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst", headers=_pro_headers(user)
    )
    body = res.json()
    # last_win_at is 72h ago (the analyst won then); last_appearance_at
    # is 24h ago (the most recent exchange where analyst was seated).
    assert body["last_win_at"] is not None
    assert body["last_appearance_at"] is not None
    assert body["last_appearance_at"] > body["last_win_at"]


@pytest.mark.asyncio
async def test_stats_best_prompt_category(app_client, make_user, db_session):
    """best_prompt_category = highest win rate category, with at least one win."""
    user = make_user(email="pstats-cat@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # 3 question wins, 1 command win, 2 command losses → command is 1/3,
    # question is 3/3. question wins.
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
        category="command",
    )
    for _ in range(2):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="philosopher",
            panel=panel,
            category="command",
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["best_prompt_category"] == "question"


@pytest.mark.asyncio
async def test_stats_best_category_null_when_no_wins(app_client, make_user, db_session):
    user = make_user(email="pstats-cat-null@test.com", tier=UserTier.PRO)
    for _ in range(3):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="philosopher",
            panel=["analyst"],
            category="question",
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst", headers=_pro_headers(user)
    )
    assert res.json()["best_prompt_category"] is None


# ─── Honesty rules ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stats_excludes_fallback_wins(app_client, make_user, db_session):
    """A fallback winner (scorer LLM failed, index 0 wins) is arbitrary
    — must not count as a real win."""
    user = make_user(email="pstats-fb@test.com", tier=UserTier.PRO)
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
        "/api/analytics/persona-stats/analyst", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["wins"] == 1
    assert body["appearances"] == 1


@pytest.mark.asyncio
async def test_stats_excludes_rows_with_no_panel(app_client, make_user, db_session):
    """Rows missing persona_ids_used don't contribute an appearance for
    any persona — without this, win rates could exceed 1.0."""
    user = make_user(email="pstats-nopanel@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=None,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["wins"] == 0
    assert body["appearances"] == 0


# ─── Tenant + auth + input ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stats_scoped_to_caller(app_client, make_user, db_session):
    """Alice's wins don't bleed into Bob's stats."""
    alice = make_user(email="pstats-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="pstats-bob@test.com", tier=UserTier.PRO)
    _seed_audit(db_session, user_id=alice.id, winner_persona_id="analyst", panel=["analyst"])
    for _ in range(4):
        _seed_audit(
            db_session, user_id=bob.id, winner_persona_id="analyst", panel=["analyst"]
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst", headers=_pro_headers(alice)
    )
    body = res.json()
    assert body["wins"] == 1
    assert body["appearances"] == 1


@pytest.mark.asyncio
async def test_stats_requires_auth(app_client):
    res = await app_client.get("/api/analytics/persona-stats/analyst")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_stats_unknown_persona_404(app_client, make_user):
    user = make_user(email="pstats-404@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/retired_mind",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_stats_window_bounds_rejected(app_client, make_user):
    user = make_user(email="pstats-bounds@test.com", tier=UserTier.PRO)
    for qs in ("window_days=0", "window_days=400"):
        res = await app_client.get(
            f"/api/analytics/persona-stats/analyst?{qs}", headers=_pro_headers(user)
        )
        assert res.status_code == 422, qs


# ─── Empty / new user ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stats_empty_for_new_user(app_client, make_user):
    user = make_user(email="pstats-new@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["wins"] == 0
    assert body["appearances"] == 0
    assert body["win_rate"] == 0.0
    assert body["avg_winning_score"] is None
    assert body["last_win_at"] is None
    assert body["last_appearance_at"] is None
    assert body["best_prompt_category"] is None


@pytest.mark.asyncio
async def test_stats_uppercase_persona_id_normalized(app_client, make_user, db_session):
    """persona_id is normalized to lowercase before lookup."""
    user = make_user(email="pstats-case@test.com", tier=UserTier.PRO)
    _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"])
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/ANALYST", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    assert res.json()["persona_id"] == "analyst"