"""Integration tests for /api/condura/migration-flags/summary."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from arena.core.auth import create_access_token
from arena.db_models import MigrationFlag, MigrationKind, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_flag(
    db,
    *,
    user_id: int,
    kind: MigrationKind = MigrationKind.WATCHLIST_ITEM,
    capability: str = "delegate_task",
    ref_id: str = "ref-1",
    resolved_at=None,
):
    return MigrationFlag(
        user_id=user_id,
        kind=kind,
        ref_id=ref_id,
        affected_capability=capability,
        resolved_at=resolved_at,
        surfaced_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


# ─── Summary endpoint ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_summary_returns_envelope(app_client, make_user):
    user = make_user(email="mig-env@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/condura/migration-flags/summary", headers=_pro_headers(user)
    )
    body = res.json()
    assert "total_open" in body
    assert "by_kind" in body
    assert "by_capability" in body
    assert body["total_open"] == 0


@pytest.mark.asyncio
async def test_summary_counts_only_open_flags(
    app_client, make_user, db_session
):
    """Resolved flags must NOT count toward total_open or the by_* maps."""
    user = make_user(email="mig-open@test.com", tier=UserTier.PRO)
    db_session.add(_seed_flag(db_session, user_id=user.id, capability="delegate_task"))
    db_session.add(_seed_flag(
        db_session, user_id=user.id, capability="hybrid_delegate",
        ref_id="ref-2",
        resolved_at=datetime.now(timezone.utc).replace(tzinfo=None),
    ))
    db_session.commit()

    res = await app_client.get(
        "/api/condura/migration-flags/summary", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["total_open"] == 1
    assert body["by_capability"] == {"delegate_task": 1}


@pytest.mark.asyncio
async def test_summary_groups_by_kind(
    app_client, make_user, db_session
):
    user = make_user(email="mig-kind@test.com", tier=UserTier.PRO)
    db_session.add(_seed_flag(
        db_session, user_id=user.id, kind=MigrationKind.WATCHLIST_ITEM,
    ))
    db_session.add(_seed_flag(
        db_session, user_id=user.id, kind=MigrationKind.WATCHLIST_ITEM,
        ref_id="r2",
    ))
    db_session.add(_seed_flag(
        db_session, user_id=user.id, kind=MigrationKind.LIVE_AGENT_TASK,
        capability="hybrid_delegate", ref_id="r3",
    ))
    db_session.commit()

    res = await app_client.get(
        "/api/condura/migration-flags/summary", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["by_kind"]["watchlist_item"] == 2
    assert body["by_kind"]["live_agent_task"] == 1


@pytest.mark.asyncio
async def test_summary_groups_by_capability(
    app_client, make_user, db_session
):
    user = make_user(email="mig-cap@test.com", tier=UserTier.PRO)
    db_session.add(_seed_flag(db_session, user_id=user.id, capability="delegate_task"))
    db_session.add(_seed_flag(db_session, user_id=user.id, capability="delegate_task", ref_id="r2"))
    db_session.add(_seed_flag(db_session, user_id=user.id, capability="hybrid_delegate", ref_id="r3"))
    db_session.commit()

    res = await app_client.get(
        "/api/condura/migration-flags/summary", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["by_capability"] == {"delegate_task": 2, "hybrid_delegate": 1}


@pytest.mark.asyncio
async def test_summary_scoped_to_caller(
    app_client, make_user, db_session
):
    alice = make_user(email="mig-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="mig-bob@test.com", tier=UserTier.PRO)
    db_session.add(_seed_flag(db_session, user_id=alice.id))
    db_session.add(_seed_flag(db_session, user_id=bob.id, ref_id="bob-1"))
    db_session.commit()

    res = await app_client.get(
        "/api/condura/migration-flags/summary", headers=_pro_headers(alice)
    )
    body = res.json()
    assert body["total_open"] == 1


@pytest.mark.asyncio
async def test_summary_requires_auth(app_client):
    res = await app_client.get("/api/condura/migration-flags/summary")
    assert res.status_code == 401