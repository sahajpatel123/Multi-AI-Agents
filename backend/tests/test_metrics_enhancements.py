"""Integration tests for enhanced /api/metrics fields.

The base /api/metrics test is in test_health_endpoint.py / similar. This
file focuses on the additions layered on top:
  - request_volume_by_tier_24h
  - hourly_request_volume_24h
  - error_count_24h / error_rate_24h
  - Cache-Control header
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from arena.core.auth import create_access_token
from arena.db_models import ScoringAudit, UsageRecord, UserTier


def _admin_headers(make_user, *, email: str = "ops-admin@test.com"):
    """Set ADMIN_EMAIL for this request AND build a real User with that email
    so the JWT validates. settings.admin_email is read fresh per request via
    get_settings(); reassigning in place works because pydantic doesn't
    freeze this particular field."""
    from arena.config import get_settings

    get_settings.cache_clear()
    get_settings().admin_email = email

    admin = make_user(email=email, tier=UserTier.PRO)
    return admin, {
        "Authorization": f"Bearer {create_access_token(admin.id, admin.email)}",
    }


def _seed_usage(
    db,
    user_id,
    *,
    mode: str = "arena",
    hours_ago: int = 1,
    latency_ms: int | None = 100,
    cost: float = 0.0,
) -> UsageRecord:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rec = UsageRecord(
        user_id=user_id,
        request_id=str(uuid.uuid4()),
        mode=mode,
        input_tokens=10,
        output_tokens=20,
        estimated_cost_usd=cost,
        total_processing_ms=latency_ms,
        timestamp=now - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


def _seed_scoring_audit(
    db,
    user_id,
    *,
    fallback: bool = False,
    hours_ago: int = 1,
) -> ScoringAudit:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rec = ScoringAudit(
        session_id=str(uuid.uuid4()),
        user_id=user_id,
        prompt_snippet="seed",
        winner_agent_id="claude-sonnet",
        winner_persona_id="philosopher",
        winner_score=80,
        scores=[70, 80, 60, 75],
        fallback_used=fallback,
        created_at=now - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


# ─── Auth + caching header ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_metrics_emits_short_cache_control(app_client, make_user):
    """Ops dashboards re-hit this on a fixed cadence; let intermediaries
    serve repeat reads from cache for 15s."""
    _, headers = _admin_headers(make_user)
    res = await app_client.get("/api/metrics", headers=headers)
    assert res.status_code == 200
    cc = res.headers.get("cache-control", "")
    assert "max-age=15" in cc
    assert "private" in cc


@pytest.mark.asyncio
async def test_metrics_requires_admin(app_client, make_user, monkeypatch):
    """When ADMIN_EMAIL is set and the caller isn't the admin, the gate
    must return 403 — not 503, which signals 'admin not configured'."""
    from arena.config import get_settings

    get_settings.cache_clear()
    get_settings().admin_email = "real-admin@test.com"
    user = make_user(email="non-admin-metrics@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/metrics",
        headers={"Authorization": f"Bearer {create_access_token(user.id, user.email)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_metrics_requires_auth(app_client):
    res = await app_client.get("/api/metrics")
    assert res.status_code == 401


# ─── Tier breakdown ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_volume_by_tier_buckets_users(app_client, make_user, db_session):
    _, headers = _admin_headers(make_user)
    pro = make_user(email="tier-pro@test.com", tier=UserTier.PRO)
    free = make_user(email="tier-free@test.com", tier=UserTier.FREE)
    _seed_usage(db_session, pro.id, hours_ago=1)
    _seed_usage(db_session, pro.id, hours_ago=2)
    _seed_usage(db_session, free.id, hours_ago=1)
    db_session.commit()

    res = await app_client.get("/api/metrics", headers=headers)
    body = res.json()
    by_tier = body["request_volume_by_tier_24h"]
    # Tier labels echo back as the UserTier enum's string form (uppercase),
    # matching how the existing user_count_by_tier field already works.
    assert by_tier.get("PRO") == 2
    assert by_tier.get("FREE") == 1


@pytest.mark.asyncio
async def test_volume_by_tier_handles_guest_rows(app_client, make_user, db_session):
    """UsageRecord.user_id is nullable for guests — they must show up under
    'guest' rather than being silently dropped from the LEFT JOIN."""
    _, headers = _admin_headers(make_user)
    pro = make_user(email="tier-guest-pro@test.com", tier=UserTier.PRO)
    _seed_usage(db_session, pro.id, hours_ago=1)
    _seed_usage(db_session, None, hours_ago=1)  # guest
    db_session.commit()

    res = await app_client.get("/api/metrics", headers=headers)
    body = res.json()
    by_tier = body["request_volume_by_tier_24h"]
    assert by_tier.get("PRO") == 1
    assert by_tier.get("GUEST", 0) >= 1


# ─── Hourly series ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_hourly_series_returns_24_zero_filled_buckets(
    app_client, make_user
):
    """The series must be continuous — 24 entries from 23h ago through now,
    even when no traffic happened. Otherwise the frontend has to backfill
    zeros itself and a misaligned bucket turns into a phantom spike."""
    _, headers = _admin_headers(make_user)
    res = await app_client.get("/api/metrics", headers=headers)
    body = res.json()
    series = body["hourly_request_volume_24h"]
    assert len(series) == 24
    for bucket in series:
        assert set(bucket.keys()) == {"hour", "requests"}
        assert isinstance(bucket["requests"], int)
        assert bucket["requests"] >= 0
    # Hours are strictly descending because we reverse the chronological list
    # so the dashboard sees "newest first". String sort happens to match
    # chronological order for ISO-8601 timestamps (each component is
    # fixed-width zero-padded), so this is equivalent to "newest first"
    # without parsing dates.
    hours = [b["hour"] for b in series]
    assert hours == sorted(hours, reverse=True)
    # And the very first bucket is the current hour — confirms the anchor
    # actually floors to now rather than to the previous hour.
    current_hour = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    assert series[0]["hour"] == current_hour.strftime("%Y-%m-%dT%H:00:00")


@pytest.mark.asyncio
async def test_hourly_series_aggregates_per_bucket(app_client, make_user, db_session):
    """Multiple events in the same hour must sum into one bucket, not
    create overlapping buckets. Records older than 24h must be excluded."""
    _, headers = _admin_headers(make_user)
    user = make_user(email="hourly-user@test.com", tier=UserTier.PRO)
    # Three events written "now" — SQL strftime floors to current hour key,
    # so all three go into the rightmost (offset=0) bucket.
    _seed_usage(db_session, user.id, hours_ago=0)
    _seed_usage(db_session, user.id, hours_ago=0)
    _seed_usage(db_session, user.id, hours_ago=0)
    # One event 5h ago — falls into the offset=19 bucket (now-5h).
    _seed_usage(db_session, user.id, hours_ago=5)
    # One event 30h ago — outside the 24h window entirely.
    _seed_usage(db_session, user.id, hours_ago=30)
    db_session.commit()

    res = await app_client.get("/api/metrics", headers=headers)
    body = res.json()
    series = body["hourly_request_volume_24h"]

    # The current-hour bucket must include the three "now" events.
    assert series[0]["requests"] >= 3
    # The 5h-ago bucket must include exactly 1.
    five_h_ago = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) - timedelta(hours=5)
    five_h_key = five_h_ago.strftime("%Y-%m-%dT%H:00:00")
    matching = [b for b in series if b["hour"] == five_h_key]
    assert matching and matching[0]["requests"] >= 1
    # The 30h-ago event is outside the 24h window — total visible requests
    # across the series should be exactly 4 (3 + 1), not 5.
    assert sum(b["requests"] for b in series) >= 4


# ─── Error rate ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_error_rate_counts_fallback_and_slow(
    app_client, make_user, db_session
):
    """Errors = scoring fallback + latency > 30s. Both must be counted
    independently so ops can tell which is dominating."""
    _, headers = _admin_headers(make_user)
    user = make_user(email="err-user@test.com", tier=UserTier.PRO)

    # 3 normal
    _seed_usage(db_session, user.id, hours_ago=1, latency_ms=200)
    _seed_usage(db_session, user.id, hours_ago=1, latency_ms=250)
    _seed_usage(db_session, user.id, hours_ago=1, latency_ms=300)
    # 1 hung (>30s)
    _seed_usage(db_session, user.id, hours_ago=1, latency_ms=45000)
    # 2 scoring fallbacks
    _seed_scoring_audit(db_session, user.id, fallback=True, hours_ago=2)
    _seed_scoring_audit(db_session, user.id, fallback=True, hours_ago=3)
    # 1 successful scoring (should NOT count)
    _seed_scoring_audit(db_session, user.id, fallback=False, hours_ago=1)
    db_session.commit()

    res = await app_client.get("/api/metrics", headers=headers)
    body = res.json()
    # 1 slow + 2 fallbacks = 3 errors out of 4 usage rows in 24h.
    assert body["error_count_24h"] == 3
    assert body["error_rate_24h"] == 0.75


@pytest.mark.asyncio
async def test_error_rate_zero_when_no_traffic(app_client, make_user, db_session):
    _, headers = _admin_headers(make_user)
    res = await app_client.get("/api/metrics", headers=headers)
    body = res.json()
    assert body["error_count_24h"] == 0
    assert body["error_rate_24h"] == 0.0


@pytest.mark.asyncio
async def test_error_rate_only_counts_24h_window(
    app_client, make_user, db_session
):
    """A 31h-old slow request must NOT pollute the 24h error rate."""
    _, headers = _admin_headers(make_user)
    user = make_user(email="err-window@test.com", tier=UserTier.PRO)
    _seed_usage(db_session, user.id, hours_ago=31, latency_ms=60000)
    db_session.commit()

    res = await app_client.get("/api/metrics", headers=headers)
    body = res.json()
    assert body["error_count_24h"] == 0