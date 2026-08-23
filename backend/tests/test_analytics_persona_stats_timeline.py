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
    days_ago: int = 0,
    fallback_used: bool = False,
) -> ScoringAudit:
    """Seed one scored exchange inside a DETERMINISTIC day bucket.

    ``created_at`` is anchored to (today − days_ago) at 00:30 UTC rather
    than ``now − N hours``. An hour-based offset silently crosses the
    midnight boundary whenever the suite runs between 00:00 and 01:00
    UTC, moving "today" rows into yesterday and red-lighting six tests
    for a full hour every night. Bucket membership is what every
    assertion here actually cares about, so anchor to the bucket.
    """
    now = utcnow_naive()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
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
        created_at=day_start - timedelta(days=days_ago) + timedelta(minutes=30),
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
    # 3 wins on day 0, 2 wins on day 1 — bucket-anchored so the day
    # split holds no matter what wall-clock time the suite runs at.
    for _ in range(3):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=["analyst"],
        )
    for _ in range(2):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=["analyst"],
            days_ago=1,
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
        )
    for _ in range(1):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=["analyst"],
            days_ago=1,
        )
    for _ in range(4):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=["analyst"],
            days_ago=3,
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
    for days_ago in [0, 0, 1, 1, 2]:
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
            days_ago=days_ago,
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


# ─── Edge cases (polish pass) ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_timeline_best_day_win_rate_is_rolled_up(
    app_client, make_user, db_session
):
    """The new best_day_win_rate + best_day_appearances fields surface
    the peak day's win rate and count so the UI can render
    'peak day: 3/3 = 100%' without a second pass over the timeline."""
    user = make_user(email="ptl-bdwr@test.com", tier=UserTier.PRO)
    # Day 0: 3 wins from 3 appearances (100%).
    for _ in range(3):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=["analyst"],
        )
    # Day -1: 1 win from 4 appearances (25%) — should NOT be the best.
    for winner in ["analyst", "philosopher", "philosopher", "philosopher"]:
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id=winner,
            panel=["analyst"],
            days_ago=1,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["best_day_wins"] == 3
    assert body["best_day_appearances"] == 3
    assert body["best_day_win_rate"] == 1.0


@pytest.mark.asyncio
async def test_timeline_all_fallback_wins_yields_null_best_day(
    app_client, make_user, db_session
):
    """A persona whose ONLY wins are fallback wins has no real peak —
    best_day must stay null even though appearances are nonzero."""
    user = make_user(email="ptl-fb-only@test.com", tier=UserTier.PRO)
    for _ in range(5):
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
    # Fallback appearances still count; wins do not.
    assert body["total_appearances"] == 5
    assert body["total_wins"] == 0
    assert body["best_day"] is None
    assert body["best_day_wins"] == 0
    assert body["best_day_appearances"] == 0
    assert body["best_day_win_rate"] == 0.0


@pytest.mark.asyncio
async def test_timeline_no_appearance_on_today(
    app_client, make_user, db_session
):
    """A persona whose last activity was N days ago: today's bucket is
    still emitted, just with zeros. The timeline is contiguous."""
    user = make_user(email="ptl-stale@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst"],
        days_ago=5,  # 5 days ago
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    body = res.json()
    # 7 days emitted, only one with any data.
    assert len(body["timeline"]) == 7
    last_day = body["timeline"][-1]  # today
    assert last_day["wins"] == 0
    assert last_day["appearances"] == 0
    # The 5-days-ago bucket is the only one with data.
    win_buckets = [r for r in body["timeline"] if r["wins"] > 0]
    assert len(win_buckets) == 1
    assert body["best_day"] == win_buckets[0]["date"]


@pytest.mark.asyncio
async def test_timeline_window_end_equals_today(
    app_client, make_user
):
    """window_end is always today (UTC), not the day after — the
    inclusive-of-today contract the docs promise."""
    user = make_user(email="ptl-today@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=30",
        headers=_pro_headers(user),
    )
    # Compare against the UTC date, not the runner's local date — the
    # two differ for most of each day in any non-UTC timezone.
    assert res.json()["window_end"] == utcnow_naive().date().isoformat()
    # And the timeline's last row is window_end.
    assert res.json()["timeline"][-1]["date"] == res.json()["window_end"]


@pytest.mark.asyncio
async def test_timeline_window_start_is_window_days_ago(
    app_client, make_user
):
    """window_start = today - (days - 1). The days param is INCLUSIVE
    of both endpoints, so days=30 spans 30 rows, not 31."""
    user = make_user(email="ptl-start@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=30",
        headers=_pro_headers(user),
    )
    from datetime import date, timedelta

    body = res.json()
    end = date.fromisoformat(body["window_end"])
    start = date.fromisoformat(body["window_start"])
    assert (end - start).days == 29  # 30 days inclusive
    assert len(body["timeline"]) == 30


@pytest.mark.asyncio
async def test_timeline_excludes_out_of_window_rows(
    app_client, make_user, db_session
):
    """Rows timestamped before the window's start must not be bucketed.
    A 30-day timeline must not pick up a row from 31 days ago, even
    if the row's persona matches."""
    user = make_user(email="ptl-out@test.com", tier=UserTier.PRO)
    # days_ago=31 — outside a 30-day window.
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst"],
        days_ago=31,  # outside a 30-day window
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=30",
        headers=_pro_headers(user),
    )
    body = res.json()
    # 31-days-ago row is outside the 30-day window, so it gets dropped.
    assert body["total_appearances"] == 0
    assert body["total_wins"] == 0
    assert body["best_day"] is None


@pytest.mark.asyncio
async def test_timeline_excludes_other_users_rows(
    app_client, make_user, db_session
):
    """The user_id filter is the only thing keeping Alice's data out
    of Bob's timeline. Pin that isolation at the timeline level."""
    alice = make_user(email="ptl-iso-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="ptl-iso-bob@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=alice.id, winner_persona_id="analyst", panel=["analyst"]
    )
    for _ in range(5):
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
async def test_timeline_days_1_single_bucket(
    app_client, make_user, db_session
):
    """days=1 returns exactly one bucket (today). The minimum bound
    is reachable, not just the max."""
    user = make_user(email="ptl-1d@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=1",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["days"] == 1
    assert len(body["timeline"]) == 1
    assert body["total_wins"] == 1
    assert body["total_appearances"] == 1


@pytest.mark.asyncio
async def test_timeline_best_day_win_rate_consistent_with_per_day(
    app_client, make_user, db_session
):
    """best_day_win_rate must equal timeline[best_day].win_rate —
    pin the rollup math against the per-day shape so they can't
    silently drift."""
    user = make_user(email="ptl-wr-consist@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # Mixed: 1 win / 2 apps on day 0, 0 / 3 on day 1, 3 / 5 on day 2.
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=panel
    )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel
    )
    for _ in range(3):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel,
            days_ago=1,
        )
    for i in range(5):
        _seed_audit(
            db_session, user_id=user.id,
            winner_persona_id="analyst" if i < 3 else "philosopher",
            panel=panel, days_ago=2,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/timeline?days=7",
        headers=_pro_headers(user),
    )
    body = res.json()
    # Locate the row matching best_day and verify the rolled-up
    # win_rate matches that row's win_rate exactly.
    best_row = next(r for r in body["timeline"] if r["date"] == body["best_day"])
    assert body["best_day_win_rate"] == best_row["win_rate"]
    assert body["best_day_appearances"] == best_row["appearances"]
    assert body["best_day_wins"] == best_row["wins"]
