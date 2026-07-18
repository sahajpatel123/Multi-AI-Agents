"""Integration tests for /api/analytics/engagement per-tier breakdown."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from arena.db_models import UXEvent, UsageRecord, UserTier



def _seed_usage(
    db,
    *,
    user_id: int | None,
    hours_ago: int = 1,
    mode: str = "arena",
):
    now = utcnow_naive()
    rec = UsageRecord(
        user_id=user_id,
        request_id=str(uuid.uuid4()),
        mode=mode,
        input_tokens=1,
        output_tokens=1,
        estimated_cost_usd=0.0,
        total_processing_ms=100,
        timestamp=now - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


def _seed_event(
    db,
    *,
    user_id: int,
    event_type: str = "deeper_opened",
    hours_ago: int = 1,
):
    now = utcnow_naive()
    rec = UXEvent(
        user_id=user_id,
        session_id=str(uuid.uuid4()),
        event_type=event_type,
        created_at=now - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


# ─── Envelope + window ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_engagement_returns_envelope(app_client, make_user):
    user = make_user(email="eng-env@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/analytics/engagement", headers=_pro_headers(user))
    body = res.json()
    assert "window_days" in body
    assert "window_start" in body
    assert "window_end" in body
    assert "caller_tier" in body
    assert "tiers" in body
    assert isinstance(body["tiers"], list)


@pytest.mark.asyncio
async def test_engagement_window_default_is_30(app_client, make_user):
    user = make_user(email="eng-window@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/analytics/engagement", headers=_pro_headers(user))
    body = res.json()
    assert body["window_days"] == 30


@pytest.mark.asyncio
async def test_engagement_window_rejects_zero(app_client, make_user):
    user = make_user(email="eng-zero@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/engagement?days=0", headers=_pro_headers(user)
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_engagement_window_rejects_over_366(app_client, make_user):
    user = make_user(email="eng-overflow@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/engagement?days=400", headers=_pro_headers(user)
    )
    assert res.status_code == 422


# ─── Rate computation ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_engagement_rate_uses_meaningful_events_only(
    app_client, make_user, db_session
):
    """Only deeper_opened / liked / saved / debated count toward engagement."""
    user = make_user(email="eng-meaningful@test.com", tier=UserTier.PRO)
    _seed_usage(db_session, user_id=user.id, hours_ago=1)
    # 1 meaningful event
    _seed_event(db_session, user_id=user.id, event_type="deeper_opened", hours_ago=1)
    # 2 noise events (not in the meaningful set)
    _seed_event(db_session, user_id=user.id, event_type="card_click", hours_ago=1)
    _seed_event(db_session, user_id=user.id, event_type="response_shared", hours_ago=1)
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/engagement", headers=_pro_headers(user)
    )
    body = res.json()
    pro_row = next(t for t in body["tiers"] if t["tier"] == "PRO")
    assert pro_row["prompts"] == 1
    assert pro_row["meaningful_events"] == 1
    assert pro_row["engagement_rate"] == 1.0


@pytest.mark.asyncio
async def test_engagement_rate_zero_when_no_prompts(app_client, make_user, db_session):
    user = make_user(email="eng-empty@test.com", tier=UserTier.PRO)
    # Event with no prompt still records 0 — defensive against div-by-zero.
    _seed_event(db_session, user_id=user.id, event_type="deeper_opened", hours_ago=1)
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/engagement", headers=_pro_headers(user)
    )
    body = res.json()
    pro_row = next(t for t in body["tiers"] if t["tier"] == "PRO")
    assert pro_row["engagement_rate"] == 0.0


@pytest.mark.asyncio
async def test_engagement_rate_capped_at_one(app_client, make_user, db_session):
    user = make_user(email="eng-cap@test.com", tier=UserTier.PRO)
    _seed_usage(db_session, user_id=user.id, hours_ago=1)
    # 5 events / 1 prompt — capped to 1.0.
    for _ in range(5):
        _seed_event(db_session, user_id=user.id, event_type="deeper_opened", hours_ago=1)
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/engagement", headers=_pro_headers(user)
    )
    body = res.json()
    pro_row = next(t for t in body["tiers"] if t["tier"] == "PRO")
    assert pro_row["meaningful_events"] == 5
    assert pro_row["engagement_rate"] == 1.0


@pytest.mark.asyncio
async def test_engagement_excludes_old_data(app_client, make_user, db_session):
    """Out-of-window events must not pollute the in-window rate."""
    user = make_user(email="eng-window-excl@test.com", tier=UserTier.PRO)
    # 10 days ago — outside any reasonable window.
    _seed_usage(db_session, user_id=user.id, hours_ago=240)
    _seed_event(db_session, user_id=user.id, event_type="deeper_opened", hours_ago=240)
    # 1 hour ago — in window.
    _seed_usage(db_session, user_id=user.id, hours_ago=1)
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/engagement?days=7", headers=_pro_headers(user)
    )
    body = res.json()
    pro_row = next(t for t in body["tiers"] if t["tier"] == "PRO")
    # Only the 1h-old prompt counts; 240h-old data is excluded.
    assert pro_row["prompts"] == 1


@pytest.mark.asyncio
async def test_engagement_includes_caller_tier_label(app_client, make_user):
    user = make_user(email="eng-caller-tier@test.com", tier=UserTier.PLUS)
    res = await app_client.get(
        "/api/analytics/engagement", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["caller_tier"] in {"PLUS", "plus"}


@pytest.mark.asyncio
async def test_engagement_aggregates_across_users_in_same_tier(
    app_client, make_user, db_session
):
    """Two PRO users' data must aggregate into the PRO row."""
    alice = make_user(email="eng-agg-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="eng-agg-bob@test.com", tier=UserTier.PRO)
    _seed_usage(db_session, user_id=alice.id, hours_ago=1)
    _seed_usage(db_session, user_id=bob.id, hours_ago=1)
    _seed_event(db_session, user_id=alice.id, event_type="deeper_opened", hours_ago=1)
    _seed_event(db_session, user_id=bob.id, event_type="response_liked", hours_ago=1)
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/engagement", headers=_pro_headers(alice)
    )
    body = res.json()
    pro_row = next(t for t in body["tiers"] if t["tier"] == "PRO")
    # Both users' prompts and both events contribute to the PRO row.
    assert pro_row["prompts"] == 2
    assert pro_row["meaningful_events"] == 2
    assert pro_row["engagement_rate"] == 1.0


@pytest.mark.asyncio
async def test_engagement_requires_auth(app_client):
    res = await app_client.get("/api/analytics/engagement")
    assert res.status_code == 401