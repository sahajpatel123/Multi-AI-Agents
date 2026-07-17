"""Integration tests for /api/agent/capability-usage."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UsageRecord, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_usage(
    db,
    *,
    user_id: int,
    mode: str = "agent",
    prompt_category: str | None = "agent.run_pipeline",
    hours_ago: int = 1,
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rec = UsageRecord(
        user_id=user_id,
        request_id=str(uuid.uuid4()),
        mode=mode,
        prompt_category=prompt_category,
        input_tokens=1,
        output_tokens=1,
        estimated_cost_usd=0.0,
        total_processing_ms=100,
        timestamp=now - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


# ─── Auth + envelope ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_capability_usage_requires_auth(app_client):
    res = await app_client.get("/api/agent/capability-usage")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_capability_usage_returns_envelope(app_client, make_user):
    user = make_user(email="cap-env@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/capability-usage", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert "window_days" in body
    assert "window_start" in body
    assert "window_end" in body
    assert "by_mode" in body
    assert "by_category" in body
    assert "totals" in body


# ─── Window filter + counting ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_capability_usage_window_default_is_30(app_client, make_user):
    user = make_user(email="cap-window@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/capability-usage", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["window_days"] == 30


@pytest.mark.asyncio
async def test_capability_usage_excludes_old_data(app_client, make_user, db_session):
    """Out-of-window records must not pollute in-window counts."""
    user = make_user(email="cap-window-excl@test.com", tier=UserTier.PRO)
    _seed_usage(db_session, user_id=user.id, hours_ago=72)  # in 30-day window
    _seed_usage(db_session, user_id=user.id, hours_ago=240)  # outside 7-day window
    db_session.commit()

    res = await app_client.get(
        "/api/agent/capability-usage?days=7", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["totals"]["all"] == 1


@pytest.mark.asyncio
async def test_capability_usage_separates_agent_and_web(
    app_client, make_user, db_session
):
    """The 'agent' mode and 'arena' mode must aggregate into separate
    buckets — the dashboard renders them as separate cards."""
    user = make_user(email="cap-split@test.com", tier=UserTier.PRO)
    _seed_usage(db_session, user_id=user.id, mode="agent", hours_ago=1)
    _seed_usage(db_session, user_id=user.id, mode="agent", hours_ago=2)
    _seed_usage(db_session, user_id=user.id, mode="arena", hours_ago=1)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/capability-usage", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["totals"]["agent"] == 2
    assert body["totals"]["web"] == 1
    assert body["totals"]["all"] == 3


@pytest.mark.asyncio
async def test_capability_usage_groups_by_category(
    app_client, make_user, db_session
):
    """The by_category map powers the 'Top capabilities' widget."""
    user = make_user(email="cap-cat@test.com", tier=UserTier.PRO)
    _seed_usage(db_session, user_id=user.id, mode="agent",
                prompt_category="agent.run_pipeline", hours_ago=1)
    _seed_usage(db_session, user_id=user.id, mode="agent",
                prompt_category="agent.run_pipeline", hours_ago=2)
    _seed_usage(db_session, user_id=user.id, mode="agent",
                prompt_category="agent.refine", hours_ago=1)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/capability-usage", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["by_category"]["agent.run_pipeline"] == 2
    assert body["by_category"]["agent.refine"] == 1


@pytest.mark.asyncio
async def test_capability_usage_scoped_to_caller(
    app_client, make_user, db_session
):
    alice = make_user(email="cap-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="cap-bob@test.com", tier=UserTier.PRO)
    _seed_usage(db_session, user_id=alice.id, hours_ago=1)
    _seed_usage(db_session, user_id=bob.id, hours_ago=1)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/capability-usage", headers=_pro_headers(alice)
    )
    body = res.json()
    assert body["totals"]["all"] == 1


@pytest.mark.asyncio
async def test_capability_usage_rejects_zero_window(app_client, make_user):
    user = make_user(email="cap-zero@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/capability-usage?days=0", headers=_pro_headers(user)
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_capability_usage_rejects_overlong_window(app_client, make_user):
    user = make_user(email="cap-overflow@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/capability-usage?days=400", headers=_pro_headers(user)
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_capability_usage_empty_for_new_user(app_client, make_user):
    user = make_user(email="cap-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/capability-usage", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["totals"]["all"] == 0
    assert body["totals"]["agent"] == 0
    assert body["totals"]["web"] == 0