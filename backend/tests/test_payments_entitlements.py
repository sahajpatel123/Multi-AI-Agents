"""Payment entitlements endpoint and aggregator contract."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.core.entitlements import compute_user_entitlements
from arena.db_models import Subscription, User, UserTier


def test_entitlements_for_free_tier_disables_agent_mode(db_session):
    user = User(
        email="ent-free@test.com",
        password_hash="x",
        tier=UserTier.FREE,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    payload = compute_user_entitlements(db=db_session, user=user)
    assert payload["tier"] == "FREE"
    assert payload["is_guest"] is False
    assert payload["features"]["agent_mode"] is False
    assert payload["features"]["debate"] is False
    assert payload["limits"]["daily_messages"] == 5
    assert payload["subscription"] is None


def test_entitlements_for_pro_tier_enables_agent_mode(db_session):
    user = User(
        email="ent-pro@test.com",
        password_hash="x",
        tier=UserTier.PRO,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    payload = compute_user_entitlements(db=db_session, user=user)
    assert payload["tier"] == "PRO"
    assert payload["features"]["agent_mode"] is True
    assert payload["features"]["agent_orchestrate"] is True
    assert payload["features"]["unlimited_debates"] is True
    assert payload["limits"]["daily_credits"] == 300_000


def test_entitlements_plus_user_with_agent_addon_unlocks_agent(
    db_session,
):
    user = User(
        email="ent-plus-addon@test.com",
        password_hash="x",
        tier=UserTier.PLUS,
        agent_addon_active=True,
        addon_subscription_id="addon-sub-1",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    payload = compute_user_entitlements(db=db_session, user=user)
    assert payload["tier"] == "PLUS"
    assert payload["features"]["agent_mode"] is True
    assert payload["agent_addon"]["active"] is True
    assert payload["agent_addon"]["subscription_id"] == "addon-sub-1"


def test_entitlements_for_guest_tier_has_no_subscription(db_session):
    user = User(
        email="ent-guest@test.com",
        password_hash="x",
        tier=UserTier.GUEST,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    payload = compute_user_entitlements(db=db_session, user=user)
    assert payload["is_guest"] is True
    assert payload["subscription"] is None
    assert payload["features"]["agent_mode"] is False


def test_entitlements_includes_loyalty_state(db_session):
    user = User(
        email="ent-loyalty@test.com",
        password_hash="x",
        tier=UserTier.PRO,
        loyalty_reward_active=True,
        loyalty_free_months_remaining=2,
        consecutive_payments=6,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    payload = compute_user_entitlements(db=db_session, user=user)
    loyalty = payload["loyalty"]
    assert loyalty["reward_active"] is True
    assert loyalty["free_months_remaining"] == 2
    assert loyalty["consecutive_payments"] == 6


def test_entitlements_pulls_subscription_row(db_session):
    user = User(
        email="ent-sub@test.com",
        password_hash="x",
        tier=UserTier.PLUS,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    sub = Subscription(
        user_id=user.id,
        razorpay_subscription_id="rzp_ent_1",
        plan_id="plan-plus-monthly",
        plan_name="Plus Monthly",
        tier="PLUS",
        billing_period="monthly",
        status="active",
        amount=49900,
        currency="INR",
    )
    db_session.add(sub)
    db_session.commit()
    db_session.refresh(sub)
    user.subscription_id = sub.id
    db_session.add(user)
    db_session.commit()

    payload = compute_user_entitlements(db=db_session, user=user)
    sub_payload = payload["subscription"]
    assert sub_payload is not None
    assert sub_payload["plan_name"] == "Plus Monthly"
    assert sub_payload["is_active"] is True
    assert sub_payload["razorpay_subscription_id"] == "rzp_ent_1"


@pytest.mark.asyncio
async def test_entitlements_endpoint_requires_auth(app_client):
    res = await app_client.get("/api/payments/entitlements")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_entitlements_endpoint_returns_payload(app_client, make_user):
    user = make_user(email="ent-endpoint@test.com", tier=UserTier.PRO)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/payments/entitlements", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["tier"] == "PRO"
    assert body["features"]["agent_mode"] is True
    assert "daily_credits" in body["limits"]
    assert "loyalty" in body
    assert "agent_addon" in body
    assert "computed_at" in body