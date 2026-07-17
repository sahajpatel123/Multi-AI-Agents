"""Integration tests for GET /api/analytics/activity."""

from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta, timezone

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UsageRecord, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_records(db, user_id: int, events: list[tuple[int, str]]) -> list[UsageRecord]:
    """Insert one UsageRecord per (days_ago, mode) tuple at noon UTC.

    A list (not a dict) so multiple events on the same day with the same mode
    are all inserted — passing ``[(0, "arena"), (0, "debate"), (0, "debate")]``
    gives three records, not two.
    """
    created: list[UsageRecord] = []
    today = datetime.now(timezone.utc).replace(tzinfo=None).date()
    for days_ago, mode in events:
        target_day = today - timedelta(days=days_ago)
        ts = datetime.combine(target_day, time(12, 0))
        rec = UsageRecord(
            user_id=user_id,
            request_id=str(uuid.uuid4()),
            mode=mode,
            input_tokens=1,
            output_tokens=1,
            estimated_cost_usd=0.0,
            total_processing_ms=10,
            timestamp=ts,
        )
        db.add(rec)
        created.append(rec)
    db.commit()
    return created


# ─── Auth + parameter validation ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_requires_auth(app_client):
    res = await app_client.get("/api/analytics/activity")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_activity_rejects_zero_days(app_client, make_user):
    user = make_user(email="act-zero@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity?days=0", headers=_pro_headers(user)
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_activity_rejects_excessive_window(app_client, make_user):
    user = make_user(email="act-overflow@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity?days=400", headers=_pro_headers(user)
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_activity_rejects_non_integer_days(app_client, make_user):
    user = make_user(email="act-nan@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity?days=abc", headers=_pro_headers(user)
    )
    assert res.status_code == 422


# ─── Empty-state behavior ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_is_zero_for_new_user(app_client, make_user):
    user = make_user(email="act-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["window_days"] == 30
    assert len(body["activity"]) == 30
    for i, bucket in enumerate(body["activity"]):
        assert bucket["date"] == body["activity"][i]["date"]
        assert bucket["prompts"] == 0
        assert bucket["debates"] == 0
        assert bucket["discusses"] == 0
        assert bucket["agent_runs"] == 0
    assert body["totals"] == {
        "prompts": 0,
        "debates": 0,
        "discusses": 0,
        "agent_runs": 0,
    }
    assert body["active_days"] == 0
    assert body["current_streak"] == 0
    assert body["longest_streak"] == 0
    assert body["busiest_day"] is None
    assert body["busiest_day_count"] == 0


# ─── Bucketing and totals ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_buckets_each_mode_into_correct_column(
    app_client, make_user, db_session
):
    user = make_user(email="act-bucket@test.com", tier=UserTier.PRO)
    _seed_records(
        db_session,
        user.id,
        [
            (0, "arena"),
            (1, "debate"),
            (2, "discuss"),
            (3, "agent"),
            (4, "arena"),  # second arena on a different day
        ],
    )

    res = await app_client.get(
        "/api/analytics/activity?days=10", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["window_days"] == 10
    assert body["totals"]["prompts"] == 2
    assert body["totals"]["debates"] == 1
    assert body["totals"]["discusses"] == 1
    assert body["totals"]["agent_runs"] == 1
    assert body["active_days"] == 5


@pytest.mark.asyncio
async def test_activity_groups_multiple_events_same_day(
    app_client, make_user, db_session
):
    user = make_user(email="act-multi@test.com", tier=UserTier.PRO)
    _seed_records(
        db_session,
        user.id,
        [(0, "arena"), (0, "debate"), (0, "debate"), (0, "agent")],
    )

    res = await app_client.get(
        "/api/analytics/activity?days=7", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["active_days"] == 1
    assert body["totals"]["prompts"] == 1
    assert body["totals"]["debates"] == 2
    assert body["totals"]["agent_runs"] == 1
    assert body["current_streak"] == 1


# ─── Streak math ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_current_streak_walks_back_from_today(
    app_client, make_user, db_session
):
    user = make_user(email="act-streak1@test.com", tier=UserTier.PRO)
    _seed_records(
        db_session,
        user.id,
        [(0, "arena"), (1, "arena"), (2, "arena"), (4, "arena")],
    )

    res = await app_client.get(
        "/api/analytics/activity?days=10", headers=_pro_headers(user)
    )
    body = res.json()
    # Days 0, 1, 2 are consecutive → streak of 3
    assert body["current_streak"] == 3
    # Longest run is also 3 (the contiguous 0-1-2 block)
    assert body["longest_streak"] == 3


@pytest.mark.asyncio
async def test_current_streak_survives_quiet_today(
    app_client, make_user, db_session
):
    """If today is empty, current streak should walk from yesterday, not collapse to 0."""
    user = make_user(email="act-quiet@test.com", tier=UserTier.PRO)
    _seed_records(
        db_session,
        user.id,
        [(1, "arena"), (2, "arena"), (3, "arena")],
    )

    res = await app_client.get(
        "/api/analytics/activity?days=10", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["current_streak"] == 3
    assert body["longest_streak"] == 3


@pytest.mark.asyncio
async def test_longest_streak_finds_max_run_in_window(
    app_client, make_user, db_session
):
    user = make_user(email="act-longest@test.com", tier=UserTier.PRO)
    _seed_records(
        db_session,
        user.id,
        [(0, "arena"), (1, "arena"), (2, "arena"), (3, "arena"), (4, "arena")],
    )

    res = await app_client.get(
        "/api/analytics/activity?days=5", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["current_streak"] == 5
    assert body["longest_streak"] == 5


@pytest.mark.asyncio
async def test_longest_streak_exceeds_current(app_client, make_user, db_session):
    user = make_user(email="act-past@test.com", tier=UserTier.PRO)
    # 5-day run ending 10 days ago, then nothing → current=0, longest=5
    _seed_records(
        db_session,
        user.id,
        [(10, "arena"), (11, "arena"), (12, "arena"), (13, "arena"), (14, "arena")],
    )

    res = await app_client.get(
        "/api/analytics/activity?days=30", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["current_streak"] == 0
    assert body["longest_streak"] == 5


# ─── Windowing and busiest-day ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_excludes_records_outside_window(
    app_client, make_user, db_session
):
    user = make_user(email="act-window@test.com", tier=UserTier.PRO)
    # 100 days ago is outside a 30-day window
    _seed_records(db_session, user.id, [(0, "arena"), (100, "arena")])

    res = await app_client.get(
        "/api/analytics/activity?days=30", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["totals"]["prompts"] == 1
    assert body["active_days"] == 1


@pytest.mark.asyncio
async def test_busiest_day_picks_highest_total(app_client, make_user, db_session):
    user = make_user(email="act-busiest@test.com", tier=UserTier.PRO)
    _seed_records(
        db_session,
        user.id,
        [(0, "arena"), (1, "arena"), (1, "debate"), (1, "agent"), (2, "arena")],
    )

    res = await app_client.get(
        "/api/analytics/activity?days=7", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["busiest_day"] is not None
    # Day 1 had 3 events (arena + debate + agent), should be the busiest.
    assert body["busiest_day_count"] == 3
    expected_date = (
        datetime.now(timezone.utc).date() - timedelta(days=1)
    ).isoformat()
    assert body["busiest_day"] == expected_date


# ─── Tenant isolation ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_is_scoped_to_caller(app_client, make_user, db_session):
    """A user must only see their own activity, never another user's."""
    user_a = make_user(email="act-a@test.com", tier=UserTier.PRO)
    user_b = make_user(email="act-b@test.com", tier=UserTier.PRO)

    _seed_records(db_session, user_a.id, [(0, "arena"), (1, "arena")])
    _seed_records(db_session, user_b.id, [(0, "arena")])

    res = await app_client.get(
        "/api/analytics/activity?days=5", headers=_pro_headers(user_a)
    )
    body = res.json()
    assert body["active_days"] == 2
    assert body["totals"]["prompts"] == 2
