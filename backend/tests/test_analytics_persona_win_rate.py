"""Integration tests for /api/analytics/persona-win-rate.

The endpoint's whole reason to exist is that a raw win count is not
comparable across personas — these tests pin the denominator behaviour
(panel appearances), the honesty rules (fallback rows excluded, rows with
no recorded panel skipped rather than folded in), and tenant isolation.
"""

from __future__ import annotations

import json
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
    panel: list[str] | str | None,
    hours_ago: int = 1,
    fallback_used: bool = False,
    score: int = 80,
) -> ScoringAudit:
    """Seed one scored exchange.

    ``panel`` is passed through as-is so tests can cover the JSON-string
    and NULL shapes the column actually contains in production, not just
    the happy-path list.
    """
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


def _row(body: dict, persona_id: str) -> dict | None:
    for row in body["personas"]:
        if row["persona_id"] == persona_id:
            return row
    return None


# ─── Core win-rate math ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_win_rate_is_wins_over_appearances(app_client, make_user, db_session):
    """analyst sits on 4 panels and wins 1 → 0.25, not "1 win"."""
    user = make_user(email="pwr-basic@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher", "pragmatist", "contrarian"]
    _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst", panel=panel)
    for _ in range(3):
        _seed_audit(db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel)
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()

    analyst = _row(body, "analyst")
    assert analyst["appearances"] == 4
    assert analyst["wins"] == 1
    assert analyst["win_rate"] == 0.25

    philosopher = _row(body, "philosopher")
    assert philosopher["wins"] == 3
    assert philosopher["win_rate"] == 0.75

    # Seated every time, never won — must appear at 0.0, not be omitted.
    assert _row(body, "pragmatist")["win_rate"] == 0.0
    assert body["scored_exchanges"] == 4


@pytest.mark.asyncio
async def test_fewer_appearances_can_outrank_more_wins(app_client, make_user, db_session):
    """The metric the endpoint exists for: 9/12 must outrank 10/50."""
    user = make_user(email="pwr-rank@test.com", tier=UserTier.PRO)
    # Filler wins all land on `pragmatist`, who is seated in both groups, so
    # no side-effect persona ends up with a rate above strategist's 0.75.
    # strategist: 9 wins from 12 appearances (0.75)
    for i in range(12):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="strategist" if i < 9 else "pragmatist",
            panel=["strategist", "pragmatist"],
        )
    # analyst: 10 wins from 50 appearances (0.2)
    for i in range(50):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst" if i < 10 else "pragmatist",
            panel=["analyst", "pragmatist"],
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    body = res.json()

    assert _row(body, "analyst")["wins"] > _row(body, "strategist")["wins"]
    assert _row(body, "strategist")["win_rate"] > _row(body, "analyst")["win_rate"]
    # Sorted strongest-first, so the higher rate leads despite fewer wins.
    ranked = [row["persona_id"] for row in body["personas"]]
    assert ranked.index("strategist") < ranked.index("analyst")
    assert body["best_persona_id"] == "strategist"


@pytest.mark.asyncio
async def test_duplicate_persona_in_panel_counted_once(app_client, make_user, db_session):
    """A persona seated twice still had one chance to win the exchange."""
    user = make_user(email="pwr-dupe@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst", "analyst", "philosopher"],
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    body = res.json()
    assert _row(body, "analyst")["appearances"] == 1
    assert _row(body, "analyst")["win_rate"] == 1.0


# ─── Honesty rules ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_fallback_rows_excluded_by_default(app_client, make_user, db_session):
    """A fallback winner is arbitrary (index 0), so it must not count."""
    user = make_user(email="pwr-fallback@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst", panel=panel)
    for _ in range(3):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            fallback_used=True,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["scored_exchanges"] == 1
    assert body["fallback_exchanges"] == 3
    assert _row(body, "analyst")["appearances"] == 1


@pytest.mark.asyncio
async def test_include_fallback_opt_in(app_client, make_user, db_session):
    user = make_user(email="pwr-fallback-in@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst", panel=panel)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        fallback_used=True,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate?include_fallback=true",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["include_fallback"] is True
    assert body["scored_exchanges"] == 2
    assert _row(body, "analyst")["appearances"] == 2


@pytest.mark.asyncio
async def test_missing_panel_never_pushes_rate_above_one(app_client, make_user, db_session):
    """A win with no recorded panel has no denominator — skip, don't fold in."""
    user = make_user(email="pwr-nopanel@test.com", tier=UserTier.PRO)
    _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst", panel=None)
    _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst", panel=[])
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["unattributed_exchanges"] == 2
    assert body["scored_exchanges"] == 0
    assert body["personas"] == []
    assert body["best_persona_id"] is None


@pytest.mark.asyncio
async def test_win_rate_never_exceeds_one_with_mixed_rows(app_client, make_user, db_session):
    user = make_user(email="pwr-cap@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    # Extra wins with no panel recorded — the numerator must not outrun the
    # denominator.
    for _ in range(5):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=None
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    body = res.json()
    for row in body["personas"]:
        assert 0.0 <= row["win_rate"] <= 1.0


@pytest.mark.asyncio
async def test_winner_not_on_panel_is_not_credited(app_client, make_user, db_session):
    """Numerator only counts winners the panel actually contained."""
    user = make_user(email="pwr-ghost@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="stoic",
        panel=["analyst", "philosopher"],
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    body = res.json()
    assert _row(body, "stoic") is None
    assert _row(body, "analyst")["wins"] == 0


@pytest.mark.asyncio
async def test_json_string_panel_is_decoded(app_client, make_user, db_session):
    """Some rows persist persona_ids_used as a JSON string, not a list."""
    user = make_user(email="pwr-jsonstr@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=json.dumps(["analyst", "philosopher"]),
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["scored_exchanges"] == 1
    assert _row(body, "analyst")["appearances"] == 1


# ─── Small-sample confidence ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_low_confidence_flag_on_small_sample(app_client, make_user, db_session):
    """2-of-2 is 100% and means nothing — flag it, don't celebrate it."""
    user = make_user(email="pwr-lowconf@test.com", tier=UserTier.PRO)
    for _ in range(2):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    body = res.json()
    analyst = _row(body, "analyst")
    assert analyst["win_rate"] == 1.0
    assert analyst["low_confidence"] is True
    # Perfect but unproven → not promoted as the user's best mind.
    assert body["best_persona_id"] is None


@pytest.mark.asyncio
async def test_best_persona_requires_confident_sample(app_client, make_user, db_session):
    user = make_user(email="pwr-best@test.com", tier=UserTier.PRO)
    # engineer: 6 appearances, 3 wins (0.5) — above the confidence threshold.
    for i in range(6):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="engineer" if i < 3 else "critic-none",
            panel=["engineer", "scientist"],
        )
    # stoic: 1 appearance, 1 win (1.0) — noise.
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="stoic", panel=["stoic"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    body = res.json()
    assert _row(body, "stoic")["win_rate"] == 1.0
    assert body["best_persona_id"] == "engineer"
    assert body["best_win_rate"] == 0.5


@pytest.mark.asyncio
async def test_min_appearances_filters_rows(app_client, make_user, db_session):
    user = make_user(email="pwr-minapp@test.com", tier=UserTier.PRO)
    for _ in range(5):
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
        "/api/analytics/persona-win-rate?min_appearances=5",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert _row(body, "stoic") is None
    assert _row(body, "analyst") is not None


# ─── Metadata, ordering, window ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_persona_metadata_is_attached(app_client, make_user, db_session):
    user = make_user(email="pwr-meta@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    analyst = _row(res.json(), "analyst")
    assert analyst["name"] == "The Analyst"
    assert analyst["color"].startswith("#")


@pytest.mark.asyncio
async def test_unknown_persona_id_falls_back_to_id(app_client, make_user, db_session):
    """A retired persona id must not 500 the endpoint."""
    user = make_user(email="pwr-unknown@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="retired_mind",
        panel=["retired_mind"],
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    assert _row(res.json(), "retired_mind")["name"] == "retired_mind"


@pytest.mark.asyncio
async def test_ordering_is_deterministic_for_ties(app_client, make_user, db_session):
    """Equal rate + equal appearances → persona_id breaks the tie, stably."""
    user = make_user(email="pwr-tie@test.com", tier=UserTier.PRO)
    for persona in ("zealot_x", "analyst"):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id=persona, panel=[persona]
        )
    db_session.commit()

    first = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    second = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    order_one = [row["persona_id"] for row in first.json()["personas"]]
    order_two = [row["persona_id"] for row in second.json()["personas"]]
    assert order_one == order_two
    assert order_one.index("analyst") < order_one.index("zealot_x")


@pytest.mark.asyncio
async def test_window_excludes_older_exchanges(app_client, make_user, db_session):
    user = make_user(email="pwr-window@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst"],
        hours_ago=24,
    )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst"],
        hours_ago=24 * 40,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate?window_days=7", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["window_days"] == 7
    assert body["scored_exchanges"] == 1


@pytest.mark.asyncio
async def test_window_bounds_rejected(app_client, make_user):
    user = make_user(email="pwr-bounds@test.com", tier=UserTier.PRO)
    # Both bounds are pinned: min_appearances has le=200 (4-slot panels
    # mean anything above that is unreachable in practice), and window_days
    # stays at 365 to keep the indexed scan bounded.
    for qs in (
        "window_days=0",
        "window_days=400",
        "min_appearances=0",
        "min_appearances=201",
    ):
        res = await app_client.get(
            f"/api/analytics/persona-win-rate?{qs}", headers=_pro_headers(user)
        )
        assert res.status_code == 422, qs


@pytest.mark.asyncio
async def test_min_appearances_accepts_upper_bound(app_client, make_user):
    """le=200 is reachable — the 422 is only above the cap."""
    user = make_user(email="pwr-bound-ok@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-win-rate?min_appearances=200",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.json()["min_appearances"] == 200


# ─── Empty state / isolation / auth ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_empty_for_new_user(app_client, make_user):
    user = make_user(email="pwr-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["personas"] == []
    assert body["scored_exchanges"] == 0
    assert body["best_persona_id"] is None
    assert body["best_win_rate"] is None


@pytest.mark.asyncio
async def test_scoped_to_caller(app_client, make_user, db_session):
    alice = make_user(email="pwr-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="pwr-bob@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=alice.id, winner_persona_id="analyst", panel=["analyst"]
    )
    for _ in range(4):
        _seed_audit(
            db_session, user_id=bob.id, winner_persona_id="stoic", panel=["stoic"]
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(alice)
    )
    body = res.json()
    assert body["scored_exchanges"] == 1
    assert _row(body, "stoic") is None


@pytest.mark.asyncio
async def test_requires_auth(app_client):
    res = await app_client.get("/api/analytics/persona-win-rate")
    assert res.status_code == 401


# ─── Weekly trend buckets ───────────────────────────────────────────────────


def _iso_date(s: str) -> bool:
    """Crude but sufficient ISO-date shape check for trend buckets."""
    return len(s) == 10 and s[4] == "-" and s[7] == "-"


@pytest.mark.asyncio
async def test_trend_buckets_partition_window(app_client, make_user, db_session):
    """Row totals are exactly the sum of the weekly trend buckets."""
    user = make_user(email="pwr-trend@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # ~40 days ago → bucket 7 of 13; ~2 days ago → bucket 12 of 13.
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        hours_ago=24 * 40,
    )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        hours_ago=24 * 2,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate", headers=_pro_headers(user)
    )
    body = res.json()

    analyst = _row(body, "analyst")
    assert analyst["appearances"] == 2
    assert analyst["wins"] == 2
    assert len(analyst["trend"]) == 13  # 90-day default window → 13 weekly buckets
    assert sum(p["appearances"] for p in analyst["trend"]) == analyst["appearances"]
    assert sum(p["wins"] for p in analyst["trend"]) == analyst["wins"]

    filled = [p for p in analyst["trend"] if p["appearances"] > 0]
    assert [p["appearances"] for p in filled] == [1, 1]
    assert [p["win_rate"] for p in filled] == [1.0, 1.0]
    for p in analyst["trend"]:
        if p["appearances"] == 0:
            assert p["wins"] == 0
            assert p["win_rate"] is None

    # Philosopher was seated both times and never won: same grid, zero rate.
    philosopher = _row(body, "philosopher")
    assert [p["bucket_start"] for p in philosopher["trend"]] == [
        p["bucket_start"] for p in analyst["trend"]
    ]
    assert philosopher["trend"][12]["appearances"] == 1
    assert philosopher["trend"][12]["win_rate"] == 0.0


@pytest.mark.asyncio
async def test_trend_bucket_count_ceils_to_weeks_and_caps(
    app_client, make_user, db_session
):
    user = make_user(email="pwr-trend-len@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    for window_days, expected in ((1, 1), (7, 1), (8, 2), (30, 5), (365, 26)):
        res = await app_client.get(
            f"/api/analytics/persona-win-rate?window_days={window_days}",
            headers=_pro_headers(user),
        )
        assert res.status_code == 200, window_days
        assert len(_row(res.json(), "analyst")["trend"]) == expected, window_days


@pytest.mark.asyncio
async def test_trend_buckets_are_iso_and_monotonic(app_client, make_user, db_session):
    user = make_user(email="pwr-trend-shape@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate?window_days=30", headers=_pro_headers(user)
    )
    trend = _row(res.json(), "analyst")["trend"]
    for prev, point in zip(trend, trend[1:]):
        assert _iso_date(point["bucket_start"])
        assert _iso_date(point["bucket_end"])
        assert point["bucket_start"] <= point["bucket_end"]
        assert point["bucket_start"] > prev["bucket_end"]
