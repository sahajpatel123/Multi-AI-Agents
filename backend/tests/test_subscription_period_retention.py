"""Paid-through-period retention on subscription.cancelled / completed.

Product contract (matches POST /api/payments/cancel): cancelling must not
steal Plus/Pro access mid-period. The webhook marks status cancelled and
retains tier until current_end; the hourly sweeper downgrades afterward.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import pytest

from arena.core.subscription_expiry_scheduler import expire_ended_subscriptions
from arena.db_models import Subscription, User, UserTier
from arena.routes.payments import (
    _apply_agent_addon_subscription_ended,
    _apply_primary_subscription_ended,
    _period_still_paid,
)


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _cancel_body(
    *,
    sub_id: str = "sub_cancel_1",
    event: str = "subscription.cancelled",
    current_end: int | None = None,
    plan_id: str = "plan_plus_monthly",
) -> bytes:
    entity: dict = {"id": sub_id, "plan_id": plan_id, "status": "cancelled"}
    if current_end is not None:
        entity["current_end"] = current_end
    return json.dumps(
        {
            "event": event,
            "payload": {"subscription": {"entity": entity}},
        },
        separators=(",", ":"),
    ).encode()


@pytest.fixture
def secret_env(monkeypatch):
    from arena.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "razorpay_webhook_secret", "whsec_unit_test_secret", raising=False)
    return settings


def _seed_primary(db_session, make_user, *, rzp_id: str, end: datetime, tier=UserTier.PLUS):
    seeded = make_user(email=f"cancel-{rzp_id}@example.com", tier=tier)
    user = db_session.query(User).filter(User.id == seeded.id).one()
    row = Subscription(
        user_id=user.id,
        razorpay_subscription_id=rzp_id,
        plan_id="plan_plus_monthly",
        plan_name="Plus Monthly",
        tier="PLUS",
        status="active",
        billing_period="monthly",
        amount=99900,
        currency="INR",
        current_start=(end - timedelta(days=30)),
        current_end=end,
        payment_count=1,
    )
    db_session.add(row)
    db_session.flush()
    user.subscription_id = row.id
    user.subscription_status = "active"
    user.subscription_end_date = end
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(row)
    return user, row


def _seed_addon(db_session, make_user, *, rzp_id: str, end: datetime):
    seeded = make_user(email=f"addon-cancel-{rzp_id}@example.com", tier=UserTier.PLUS)
    user = db_session.query(User).filter(User.id == seeded.id).one()
    row = Subscription(
        user_id=user.id,
        razorpay_subscription_id=rzp_id,
        plan_id="plan_agent_addon",
        plan_name="Agent Addon",
        tier="agent_addon",
        status="active",
        billing_period="monthly",
        amount=59900,
        currency="INR",
        current_start=(end - timedelta(days=30)),
        current_end=end,
        payment_count=1,
    )
    db_session.add(row)
    db_session.flush()
    user.agent_addon_active = True
    user.agent_addon_cancelling = False
    user.addon_subscription_id = rzp_id
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(row)
    return user, row


class TestPeriodStillPaid:
    def test_future_end_is_paid(self):
        end = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=5)
        assert _period_still_paid(end) is True

    def test_past_end_is_not_paid(self):
        end = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
        assert _period_still_paid(end) is False

    def test_none_is_not_paid(self):
        assert _period_still_paid(None) is False


class TestApplyPrimarySubscriptionEnded:
    def test_retains_tier_when_period_remaining(self, db_session, make_user):
        end = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=10)
        user, row = _seed_primary(db_session, make_user, rzp_id="sub_keep", end=end)
        _apply_primary_subscription_ended(
            db_session,
            user,
            row,
            {"current_end": int(end.replace(tzinfo=timezone.utc).timestamp())},
            event="subscription.cancelled",
        )
        db_session.commit()
        db_session.refresh(user)
        db_session.refresh(row)
        assert user.tier == UserTier.PLUS
        assert user.subscription_status == "cancelled"
        assert row.status == "cancelled"
        assert user.subscription_end_date is not None

    def test_downgrades_when_period_already_over(self, db_session, make_user):
        end = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)
        user, row = _seed_primary(db_session, make_user, rzp_id="sub_done", end=end)
        _apply_primary_subscription_ended(
            db_session,
            user,
            row,
            {"current_end": int(end.replace(tzinfo=timezone.utc).timestamp())},
            event="subscription.cancelled",
        )
        db_session.commit()
        db_session.refresh(user)
        assert user.tier == UserTier.FREE
        assert user.subscription_status == "cancelled"


class TestApplyAgentAddonEnded:
    def test_sets_cancelling_when_period_remaining(self, db_session, make_user):
        end = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7)
        user, row = _seed_addon(db_session, make_user, rzp_id="sub_addon_keep", end=end)
        _apply_agent_addon_subscription_ended(
            db_session,
            user,
            row,
            {"current_end": int(end.replace(tzinfo=timezone.utc).timestamp())},
            event="subscription.cancelled",
        )
        db_session.commit()
        db_session.refresh(user)
        assert user.agent_addon_active is True
        assert user.agent_addon_cancelling is True
        assert user.addon_subscription_id == "sub_addon_keep"

    def test_clears_when_period_over(self, db_session, make_user):
        end = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=2)
        user, row = _seed_addon(db_session, make_user, rzp_id="sub_addon_done", end=end)
        _apply_agent_addon_subscription_ended(
            db_session,
            user,
            row,
            {"current_end": int(end.replace(tzinfo=timezone.utc).timestamp())},
            event="subscription.completed",
        )
        db_session.commit()
        db_session.refresh(user)
        assert user.agent_addon_active is False
        assert user.agent_addon_cancelling is False
        assert user.addon_subscription_id is None


class TestExpireEndedSubscriptions:
    def test_sweeper_downgrades_due_primary(self, db_session, make_user):
        end = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5)
        user, row = _seed_primary(db_session, make_user, rzp_id="sub_sweep", end=end)
        user.subscription_status = "cancelled"
        user.tier = UserTier.PLUS
        db_session.add(user)
        db_session.commit()

        result = expire_ended_subscriptions(db_session)
        db_session.refresh(user)
        assert result["primary_downgraded"] >= 1
        assert user.tier == UserTier.FREE

    def test_sweeper_skips_future_period(self, db_session, make_user):
        end = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=3)
        user, _row = _seed_primary(db_session, make_user, rzp_id="sub_future", end=end)
        user.subscription_status = "cancelled"
        db_session.add(user)
        db_session.commit()

        result = expire_ended_subscriptions(db_session)
        db_session.refresh(user)
        assert result["primary_downgraded"] == 0
        assert user.tier == UserTier.PLUS

    def test_sweeper_clears_due_addon(self, db_session, make_user):
        end = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
        user, row = _seed_addon(db_session, make_user, rzp_id="sub_addon_sweep", end=end)
        user.agent_addon_cancelling = True
        user.agent_addon_active = True
        row.status = "cancelled"
        db_session.add(user)
        db_session.add(row)
        db_session.commit()

        result = expire_ended_subscriptions(db_session)
        db_session.refresh(user)
        assert result["addon_cleared"] >= 1
        assert user.agent_addon_active is False
        assert user.agent_addon_cancelling is False


class TestCancelledWebhookEndpoint:
    @pytest.mark.asyncio
    async def test_webhook_retains_plus_until_period_end(
        self, app_client, secret_env, db_session, make_user
    ):
        end = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=12)
        user, row = _seed_primary(db_session, make_user, rzp_id="sub_wh_keep", end=end)
        body = _cancel_body(
            sub_id=row.razorpay_subscription_id,
            current_end=int(end.replace(tzinfo=timezone.utc).timestamp()),
        )
        sig = _sign(secret_env.razorpay_webhook_secret, body)
        res = await app_client.post(
            "/api/payments/webhook",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": sig,
            },
        )
        assert res.status_code == 200, res.text
        db_session.expire_all()
        db_session.refresh(user)
        db_session.refresh(row)
        assert user.tier == UserTier.PLUS
        assert user.subscription_status == "cancelled"
        assert row.status == "cancelled"

    @pytest.mark.asyncio
    async def test_webhook_downgrades_when_already_ended(
        self, app_client, secret_env, db_session, make_user
    ):
        end = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
        user, row = _seed_primary(db_session, make_user, rzp_id="sub_wh_end", end=end)
        body = _cancel_body(
            sub_id=row.razorpay_subscription_id,
            current_end=int(end.replace(tzinfo=timezone.utc).timestamp()),
        )
        sig = _sign(secret_env.razorpay_webhook_secret, body)
        res = await app_client.post(
            "/api/payments/webhook",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": sig,
            },
        )
        assert res.status_code == 200, res.text
        db_session.expire_all()
        db_session.refresh(user)
        assert user.tier == UserTier.FREE
