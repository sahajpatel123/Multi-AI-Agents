"""Integration tests for /api/analytics/summary window + engagement + streak."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from arena.db_models import (
    PersonaDriftLog, ScoringAudit, SessionSummary, UsageRecord, UXEvent, UserTier,
)



def _seed_usage(
    db,
    *,
    user_id: int,
    hours_ago: int = 1,
    mode: str = "arena",
) -> UsageRecord:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
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
    persona_id: str | None = "analyst",
    hours_ago: int = 1,
) -> UXEvent:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rec = UXEvent(
        user_id=user_id,
        session_id=str(uuid.uuid4()),
        event_type=event_type,
        persona_id=persona_id,
        event_metadata=None,
        created_at=now - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


def _seed_scoring(db, *, user_id: int, hours_ago: int = 1, score: int = 80) -> ScoringAudit:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rec = ScoringAudit(
        session_id=str(uuid.uuid4()),
        user_id=user_id,
        prompt_snippet="x",
        winner_agent_id="claude-sonnet",
        winner_persona_id="analyst",
        winner_score=score,
        scores=[70, 80, 60, 75],
        created_at=now - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


def _seed_summary(db, *, user_id: int, days_ago: int = 0, topics: list | None = None) -> SessionSummary:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    import json as _json
    rec = SessionSummary(
        session_id=str(uuid.uuid4()),
        user_id=user_id,
        main_topics=_json.dumps(topics or []),
        dominant_category="question",
        preferred_depth="moderate",
        key_positions_taken=_json.dumps([]),
        session_summary="summary",
        exchange_count=3,
        raw_exchanges_count=3,
        compressed_at=now - timedelta(days=days_ago),
    )
    db.add(rec)
    db.flush()
    return rec


# ─── Window filter ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_window_default_is_30_days(app_client, make_user, db_session):
    user = make_user(email="ana-window@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/analytics/summary", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert body["window_days"] == 30
    assert "window_start" in body
    assert "window_end" in body


@pytest.mark.asyncio
async def test_window_filter_excludes_old_data(app_client, make_user, db_session):
    """A 7-day window must ignore data older than 7 days."""
    user = make_user(email="ana-window-7@test.com", tier=UserTier.PRO)
    # In-window: 3 days ago
    _seed_usage(db_session, user_id=user.id, hours_ago=72)
    # Out of window: 10 days ago
    _seed_usage(db_session, user_id=user.id, hours_ago=240)
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/summary?window_days=7", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["total_prompts"] == 1


@pytest.mark.asyncio
async def test_window_zero_days_rejected(app_client, make_user):
    user = make_user(email="ana-window-0@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/summary?window_days=0", headers=_pro_headers(user)
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_window_over_cap_rejected(app_client, make_user):
    user = make_user(email="ana-window-over@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/summary?window_days=400", headers=_pro_headers(user)
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_topic_limit_caps_returned_topics(app_client, make_user, db_session):
    user = make_user(email="ana-topic-cap@test.com", tier=UserTier.PRO)
    # 15 distinct topics; default limit is 10.
    topics = [f"topic_{i}" for i in range(15)]
    _seed_summary(db_session, user_id=user.id, days_ago=0, topics=topics)
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/summary", headers=_pro_headers(user)
    )
    body = res.json()
    assert len(body["topic_distribution"]) == 10


# ─── Engagement rate ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_engagement_rate_computed(app_client, make_user, db_session):
    """engagement_rate = meaningful_events / total_prompts (capped at 1.0)."""
    user = make_user(email="ana-eng@test.com", tier=UserTier.PRO)
    # 4 prompts
    for _ in range(4):
        _seed_usage(db_session, user_id=user.id, hours_ago=1)
    # 1 engagement event → 1/4 = 0.25
    _seed_event(db_session, user_id=user.id, event_type="deeper_opened", hours_ago=1)
    _seed_event(db_session, user_id=user.id, event_type="response_liked", hours_ago=1)
    db_session.commit()

    res = await app_client.get("/api/analytics/summary", headers=_pro_headers(user))
    body = res.json()
    assert body["total_prompts"] == 4
    assert body["engagement_rate"] == 0.5


@pytest.mark.asyncio
async def test_engagement_rate_zero_when_no_prompts(app_client, make_user, db_session):
    user = make_user(email="ana-eng-zero@test.com", tier=UserTier.PRO)
    _seed_event(db_session, user_id=user.id, event_type="deeper_opened", hours_ago=1)
    db_session.commit()
    res = await app_client.get("/api/analytics/summary", headers=_pro_headers(user))
    body = res.json()
    assert body["engagement_rate"] == 0.0


@pytest.mark.asyncio
async def test_engagement_rate_capped_at_one(app_client, make_user, db_session):
    """If somehow there are more events than prompts (data drift), cap at 1.0."""
    user = make_user(email="ana-eng-cap@test.com", tier=UserTier.PRO)
    _seed_usage(db_session, user_id=user.id, hours_ago=1)
    # 5 engagement events for 1 prompt
    for _ in range(5):
        _seed_event(db_session, user_id=user.id, event_type="deeper_opened", hours_ago=1)
    db_session.commit()
    res = await app_client.get("/api/analytics/summary", headers=_pro_headers(user))
    body = res.json()
    assert body["engagement_rate"] == 1.0


# ─── Streaks ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_streak_walks_back_from_today(app_client, make_user, db_session):
    """Three consecutive days back from today → streak of 3."""
    user = make_user(email="ana-streak@test.com", tier=UserTier.PRO)
    for hours_ago in [1, 25, 49]:  # ~0d, ~1d, ~2d
        _seed_usage(db_session, user_id=user.id, hours_ago=hours_ago)
    db_session.commit()
    res = await app_client.get("/api/analytics/summary", headers=_pro_headers(user))
    body = res.json()
    assert body["current_streak"] == 3


@pytest.mark.asyncio
async def test_streak_survives_quiet_today(app_client, make_user, db_session):
    """Today empty but yesterday/2-days-ago populated → streak of 2."""
    user = make_user(email="ana-streak-quiet@test.com", tier=UserTier.PRO)
    _seed_usage(db_session, user_id=user.id, hours_ago=25)
    _seed_usage(db_session, user_id=user.id, hours_ago=49)
    db_session.commit()
    res = await app_client.get("/api/analytics/summary", headers=_pro_headers(user))
    body = res.json()
    assert body["current_streak"] == 2


@pytest.mark.asyncio
async def test_longest_streak_finds_max_run(app_client, make_user, db_session):
    user = make_user(email="ana-longest@test.com", tier=UserTier.PRO)
    for hours_ago in [1, 25, 49, 73, 97]:  # 5 consecutive days
        _seed_usage(db_session, user_id=user.id, hours_ago=hours_ago)
    db_session.commit()
    res = await app_client.get("/api/analytics/summary", headers=_pro_headers(user))
    body = res.json()
    assert body["longest_streak"] == 5


@pytest.mark.asyncio
async def test_streak_zero_for_new_user(app_client, make_user):
    user = make_user(email="ana-streak-zero@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/analytics/summary", headers=_pro_headers(user))
    body = res.json()
    assert body["current_streak"] == 0
    assert body["longest_streak"] == 0


# ─── Empty / tenant isolation ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_summary_returns_zeros_for_new_user(app_client, make_user):
    user = make_user(email="ana-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/analytics/summary", headers=_pro_headers(user))
    body = res.json()
    assert body["total_prompts"] == 0
    assert body["total_debates"] == 0
    assert body["total_saved"] == 0
    assert body["persona_wins"] == {}
    assert body["topic_distribution"] == []


@pytest.mark.asyncio
async def test_summary_scoped_to_caller(app_client, make_user, db_session):
    """Alice's data must not bleed into Bob's response."""
    alice = make_user(email="ana-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="ana-bob@test.com", tier=UserTier.PRO)
    _seed_usage(db_session, user_id=alice.id, hours_ago=1)
    _seed_usage(db_session, user_id=bob.id, hours_ago=1)
    db_session.commit()

    res = await app_client.get("/api/analytics/summary", headers=_pro_headers(alice))
    body = res.json()
    assert body["total_prompts"] == 1


@pytest.mark.asyncio
async def test_summary_requires_auth(app_client):
    res = await app_client.get("/api/analytics/summary")
    assert res.status_code == 401