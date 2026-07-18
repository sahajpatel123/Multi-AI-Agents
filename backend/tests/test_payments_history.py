"""Integration tests for /api/payments/plans and /subscriptions/history."""

from __future__ import annotations

import pytest

from arena.db_models import Subscription, UserTier



def _seed_sub(
    db,
    *,
    user_id: int,
    plan_name: str = "Arena Plus Monthly",
    tier: str = "PLUS",
    billing_period: str = "monthly",
    status: str = "active",
    amount: int = 99900,
    razorpay_id: str = "raz_default",
):
    return Subscription(
        user_id=user_id,
        razorpay_subscription_id=razorpay_id,
        plan_id="plan_test",
        plan_name=plan_name,
        tier=tier,
        billing_period=billing_period,
        status=status,
        amount=amount,
    )


# ─── /plans (public) ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_plans_returns_envelope(app_client):
    res = await app_client.get("/api/payments/plans")
    assert res.status_code == 200
    body = res.json()
    assert "plans" in body
    assert "total" in body
    assert "currency" in body
    assert "feature_highlights" in body
    assert body["total"] == len(body["plans"])


@pytest.mark.asyncio
async def test_plans_sorted_stably(app_client):
    """Plans must come back in a deterministic order so the pricing page
    doesn't shuffle between fetches."""
    res = await app_client.get("/api/payments/plans")
    plans = res.json()["plans"]
    # We expect PLUS before PRO before AGENT_ADDON (tier asc), and
    # within a tier, monthly before annual.
    tiers = [p["tier"] for p in plans]
    assert tiers == sorted(tiers)
    for tier in {tiers[0]} if len(set(tiers)) == 1 else []:
        pass
    # Within each tier, monthly must precede annual.
    by_tier: dict[str, list[str]] = {}
    for p in plans:
        by_tier.setdefault(p["tier"], []).append(p["billing_period"])
    for periods in by_tier.values():
        if "monthly" in periods and "annual" in periods:
            assert periods.index("monthly") < periods.index("annual")


@pytest.mark.asyncio
async def test_plans_carries_feature_highlights(app_client):
    res = await app_client.get("/api/payments/plans")
    body = res.json()
    highlights = body["feature_highlights"]
    assert "FREE" in highlights
    assert "PLUS" in highlights
    assert "PRO" in highlights
    assert isinstance(highlights["PLUS"], list)
    assert len(highlights["PLUS"]) > 0


@pytest.mark.asyncio
async def test_plans_no_auth_required(app_client):
    """Pricing pages are public — must work for logged-out visitors."""
    res = await app_client.get("/api/payments/plans")
    assert res.status_code != 401


# ─── /subscriptions/history ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_history_returns_envelope(app_client, make_user, db_session):
    user = make_user(email="pay-hist@test.com", tier=UserTier.PRO)
    db_session.add(_seed_sub(db_session, user_id=user.id))
    db_session.commit()

    res = await app_client.get(
        "/api/payments/subscriptions/history", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert "subscriptions" in body
    assert "total" in body
    assert body["total"] == 1


@pytest.mark.asyncio
async def test_history_orders_newest_first(app_client, make_user, db_session):
    user = make_user(email="pay-order@test.com", tier=UserTier.PRO)
    db_session.add(_seed_sub(db_session, user_id=user.id, razorpay_id="raz_old",
                            plan_name="Old Plan"))
    db_session.commit()
    db_session.add(_seed_sub(db_session, user_id=user.id, razorpay_id="raz_new",
                            plan_name="New Plan"))
    db_session.commit()

    res = await app_client.get(
        "/api/payments/subscriptions/history", headers=_pro_headers(user)
    )
    body = res.json()
    names = [s["plan_name"] for s in body["subscriptions"]]
    assert names[0] == "New Plan"


@pytest.mark.asyncio
async def test_history_tier_filter(app_client, make_user, db_session):
    user = make_user(email="pay-tier@test.com", tier=UserTier.PRO)
    db_session.add(_seed_sub(db_session, user_id=user.id, tier="PLUS", razorpay_id="r1"))
    db_session.add(_seed_sub(db_session, user_id=user.id, tier="PRO", razorpay_id="r2"))
    db_session.commit()

    res = await app_client.get(
        "/api/payments/subscriptions/history?tier=PLUS",
        headers=_pro_headers(user),
    )
    body = res.json()
    tiers = {s["tier"] for s in body["subscriptions"]}
    assert tiers == {"PLUS"}


@pytest.mark.asyncio
async def test_history_status_filter(app_client, make_user, db_session):
    user = make_user(email="pay-status@test.com", tier=UserTier.PRO)
    db_session.add(_seed_sub(db_session, user_id=user.id, status="active", razorpay_id="r1"))
    db_session.add(_seed_sub(db_session, user_id=user.id, status="cancelled", razorpay_id="r2"))
    db_session.commit()

    res = await app_client.get(
        "/api/payments/subscriptions/history?status=cancelled",
        headers=_pro_headers(user),
    )
    body = res.json()
    statuses = {s["status"] for s in body["subscriptions"]}
    assert statuses == {"cancelled"}


@pytest.mark.asyncio
async def test_history_pagination(app_client, make_user, db_session):
    user = make_user(email="pay-page@test.com", tier=UserTier.PRO)
    for i in range(5):
        db_session.add(_seed_sub(
            db_session, user_id=user.id,
            razorpay_id=f"r{i}",
        ))
    db_session.commit()

    res = await app_client.get(
        "/api/payments/subscriptions/history?per_page=2&page=2",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["total"] == 5
    assert body["total_pages"] == 3
    assert len(body["subscriptions"]) == 2


@pytest.mark.asyncio
async def test_history_scoped_to_caller(app_client, make_user, db_session):
    alice = make_user(email="pay-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="pay-bob@test.com", tier=UserTier.PRO)
    db_session.add(_seed_sub(db_session, user_id=alice.id, razorpay_id="r_alice"))
    db_session.add(_seed_sub(db_session, user_id=bob.id, razorpay_id="r_bob"))
    db_session.commit()

    res = await app_client.get(
        "/api/payments/subscriptions/history", headers=_pro_headers(alice)
    )
    body = res.json()
    razorpay_ids = {s.get("tier") for s in body["subscriptions"]}
    assert "PRO" in razorpay_ids or len(body["subscriptions"]) == 1


@pytest.mark.asyncio
async def test_history_filters_echo_in_response(app_client, make_user):
    user = make_user(email="pay-echo@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/payments/subscriptions/history?tier=PLUS&status=active",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["filters"]["tier"] == "PLUS"
    assert body["filters"]["status"] == "active"


@pytest.mark.asyncio
async def test_history_requires_auth(app_client):
    res = await app_client.get("/api/payments/subscriptions/history")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_history_rejects_overlong_page_size(app_client, make_user):
    user = make_user(email="pay-bad-page@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/payments/subscriptions/history?per_page=999",
        headers=_pro_headers(user),
    )
    assert res.status_code == 422