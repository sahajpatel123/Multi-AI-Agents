"""Integration tests for GET /api/analytics/persona-stats/{persona_id}/timeline.

Third axis in the persona-stats family (deep-dive + per-category +
per-day). Returns one row per UTC day in the window with wins and
appearances for the specified persona, suitable for a sparkline.
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


# ─── Happy path ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_timeline_returns_persona_metadata(
    app_client, make_user, db_session
):
    user = make_user(email="ptl-meta@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["persona_id"] == "analyst"
    assert body["name"] == "The Analyst"
    assert body["days"] == 30  # default


@pytest.mark.asyncio
async def test_timeline_is_contiguous_with_zero_buckets(
    app_client, make_user, db_session
):
    """Quiet days (no exchanges) must still appear in the timeline
    with zeros — a dashboard's sparkline shouldn't have to fill gaps."""
    user = make_user(email="ptl-zero@test.com", tier=UserTier.PRO)
    # Only one exchange on day 0, nothing on the other days.
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert len(body["timeline"]) == 7
    # Only the last day has any data; the first 6 are zeros.
    for row in body["timeline"][:-1]:
        assert row["wins"] == 0
        assert row["appearances"] == 0
        assert row["win_rate"] == 0.0
    # Last day has the seeded exchange.
    assert body["timeline"][-1]["wins"] == 1
    assert body["timeline"][-1]["appearances"] == 1


@pytest.mark.asyncio
async def test_timeline_groups_by_day(app_client, make_user, db_session):
    user = make_user(email="ptl-group@test.com", tier=UserTier.PRO)
    # 3 wins on day 0 (hours_ago=1 — must stay well inside "today" even
    # when the test runs near midnight UTC). 2 wins on day 1
    # (hours_ago=25, 26).
    for _ in range(3):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=["analyst"],
            hours_ago=1,
        )
    for hours_ago in [25, 26]:
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=["analyst"],
            hours_ago=hours_ago,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    body = res.json()
    timeline = body["timeline"]
    # Day 0 (last entry) has 3 wins.
    assert timeline[-1]["wins"] == 3
    assert timeline[-1]["appearances"] == 3
    # Day 1 has 2 wins.
    assert timeline[-2]["wins"] == 2
    assert timeline[-2]["appearances"] == 2
    assert body["total_wins"] == 5
    assert body["total_appearances"] == 5


@pytest.mark.asyncio
async def test_timeline_counts_appearances_without_wins(
    app_client, make_user, db_session
):
    """A non-win appearance still counts as an appearance — a 0/3 day
    shows appearances=3, wins=0, win_rate=0.0."""
    user = make_user(email="ptl-apps@test.com", tier=UserTier.PRO)
    for _ in range(3):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="philosopher",
            panel=["analyst"],
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    body = res.json()
    timeline = body["timeline"]
    last = timeline[-1]
    assert last["wins"] == 0
    assert last["appearances"] == 3
    assert last["win_rate"] == 0.0
    assert body["total_appearances"] == 3
    assert body["total_wins"] == 0


# ─── Honesty rules ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_timeline_fallback_wins_excluded(app_client, make_user, db_session):
    """Fallback wins (scorer LLM failed, index 0 wins) are arbitrary —
    appearance still counts, win does not."""
    user = make_user(email="ptl-fb@test.com", tier=UserTier.PRO)
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
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    body = res.json()
    last = body["timeline"][-1]
    assert last["appearances"] == 4
    assert last["wins"] == 1
    assert body["total_appearances"] == 4
    assert body["total_wins"] == 1


@pytest.mark.asyncio
async def test_timeline_excludes_no_panel_rows(
    app_client, make_user, db_session
):
    """Rows with no recorded panel don't contribute an appearance
    for any persona."""
    user = make_user(email="ptl-nopanel@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=None
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    body = res.json()
    for row in body["timeline"]:
        assert row["wins"] == 0
        assert row["appearances"] == 0


# ─── Rollup (best_day) ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_timeline_best_day_uses_highest_wins(
    app_client, make_user, db_session
):
    """best_day points to the date with the most wins, with ties broken
    by earliest date so the rollup is stable."""
    user = make_user(email="ptl-best@test.com", tier=UserTier.PRO)
    # Day 0: 4 wins. Day -1: 1 win. Day -3: 4 wins (tie, should lose to day 0).
    for _ in range(4):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=["analyst"],
            hours_ago=1,
        )
    for _ in range(1):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=["analyst"],
            hours_ago=25,
        )
    for _ in range(4):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=["analyst"],
            hours_ago=72,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    body = res.json()
    timeline_by_date = {row["date"]: row["wins"] for row in body["timeline"]}
    candidates = [d for d, w in timeline_by_date.items() if w == 4]
    # Two days tied at 4 wins. best_day must be the EARLIER one.
    assert body["best_day_wins"] == 4
    assert body["best_day"] == min(candidates)
    # And there must be exactly two tied days, not one (sanity check).
    assert len(candidates) == 2


@pytest.mark.asyncio
async def test_timeline_best_day_null_when_no_wins(
    app_client, make_user, db_session
):
    """A user with no wins in the window has best_day=null — 0/0
    days aren't a 'best' anything."""
    user = make_user(email="ptl-no-wins@test.com", tier=UserTier.PRO)
    for _ in range(3):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="philosopher",
            panel=["analyst"],
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["best_day"] is None
    assert body["best_day_wins"] == 0


# ─── Tenant + auth + input ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_timeline_scoped_to_caller(app_client, make_user, db_session):
    alice = make_user(email="ptl-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="ptl-bob@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=alice.id, winner_persona_id="analyst", panel=["analyst"]
    )
    for _ in range(4):
        _seed_audit(
            db_session, user_id=bob.id, winner_persona_id="analyst", panel=["analyst"]
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(alice),
    )
    body = res.json()
    assert body["total_wins"] == 1
    assert body["total_appearances"] == 1


@pytest.mark.asyncio
async def test_timeline_requires_auth(app_client):
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline"
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_timeline_unknown_persona_404(app_client, make_user):
    user = make_user(email="ptl-404@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/retired_mind/timeline",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_timeline_days_bounds_rejected(app_client, make_user):
    user = make_user(email="ptl-bounds@test.com", tier=UserTier.PRO)
    for qs in ("days=0", "days=91", "days=400"):
        res = await app_client.get(
            f"/api/analytics/persona-stats/analyst/timeline?{qs}",
            headers=_pro_headers(user),
        )
        assert res.status_code == 422, qs


@pytest.mark.asyncio
async def test_timeline_days_max_reachable(app_client, make_user):
    """le=90 is reachable — 422 is only above the cap, not at it."""
    user = make_user(email="ptl-90@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=90",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert len(res.json()["timeline"]) == 90


# ─── Empty / shape ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_timeline_empty_for_new_user(app_client, make_user):
    user = make_user(email="ptl-new@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["total_appearances"] == 0
    assert body["total_wins"] == 0
    assert body["best_day"] is None
    assert body["best_day_wins"] == 0
    # 7 days emitted, all zeros.
    assert len(body["timeline"]) == 7
    for row in body["timeline"]:
        assert row["wins"] == 0
        assert row["appearances"] == 0
        assert row["win_rate"] == 0.0


@pytest.mark.asyncio
async def test_timeline_dates_are_chronological(app_client, make_user):
    """timeline[].date is sorted oldest-first — a dashboard's sparkline
    library expects chronological data."""
    user = make_user(email="ptl-chron@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    timeline = res.json()["timeline"]
    dates = [row["date"] for row in timeline]
    assert dates == sorted(dates)
    # 7 distinct dates, contiguous.
    from datetime import date, timedelta

    first = date.fromisoformat(dates[0])
    last = date.fromisoformat(dates[-1])
    assert (last - first).days == 6  # 7 days inclusive


@pytest.mark.asyncio
async def test_timeline_totals_match_sum_of_days(
    app_client, make_user, db_session
):
    """sum(timeline[].wins) == total_wins; same for appearances. Pin
    the rollup so a future 'pre-aggregate' optimization can't drift."""
    user = make_user(email="ptl-rollup@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for hours_ago in [2, 3, 24, 25, 48]:
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
            hours_ago=hours_ago,
        )
    # One philosopher win — must NOT count toward analyst's wins.
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    body = res.json()
    summed_wins = sum(row["wins"] for row in body["timeline"])
    summed_apps = sum(row["appearances"] for row in body["timeline"])
    assert body["total_wins"] == summed_wins
    assert body["total_appearances"] == summed_apps
    assert summed_wins == 5
    assert summed_apps == 6  # 5 analyst wins + 1 philosopher win (still an appearance)
