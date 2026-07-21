"""payment.failed webhook must resolve Razorpay subscription ids correctly.

Historically the handler compared the Razorpay string subscription id
against ``User.subscription_id`` (integer FK to subscriptions.id), so
failed renewals never stamped ``subscription_status='failed'``. These
tests pin the repaired resolution path for primary and agent-addon
subscriptions, including the payment-fetch fallback when the entity
omits subscription_id.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from arena.db_models import Subscription, User, UserTier
from arena.routes.payments import (
    _mark_subscription_payment_failed,
    _resolve_payment_subscription_id,
)


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _failed_payment_body(
    *,
    payment_id: str = "pay_fail_1",
    subscription_id: str | None = "sub_rzp_primary",
) -> bytes:
    entity: dict = {"id": payment_id, "status": "failed"}
    if subscription_id is not None:
        entity["subscription_id"] = subscription_id
    return json.dumps(
        {
            "event": "payment.failed",
            "payload": {"payment": {"entity": entity}},
        },
        separators=(",", ":"),
    ).encode()


@pytest.fixture
def secret_env(monkeypatch):
    from arena.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "razorpay_webhook_secret", "whsec_unit_test_secret", raising=False)
    return settings


def _seed_primary_subscription(db_session, make_user, *, rzp_id: str = "sub_rzp_primary"):
    seeded = make_user(email=f"payfail-primary-{rzp_id}@example.com", tier=UserTier.PLUS)
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
        current_start=datetime.now(timezone.utc).replace(tzinfo=None),
        current_end=(datetime.now(timezone.utc) + timedelta(days=30)).replace(tzinfo=None),
        payment_count=1,
    )
    db_session.add(row)
    db_session.flush()
    user.subscription_id = row.id
    user.subscription_status = "active"
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(row)
    return user, row


def _seed_addon_subscription(db_session, make_user, *, rzp_id: str = "sub_rzp_addon"):
    seeded = make_user(email=f"payfail-addon-{rzp_id}@example.com", tier=UserTier.PLUS)
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
        current_start=datetime.now(timezone.utc).replace(tzinfo=None),
        current_end=(datetime.now(timezone.utc) + timedelta(days=30)).replace(tzinfo=None),
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


class TestMarkSubscriptionPaymentFailed:
    def test_primary_subscription_marks_user_failed(self, db_session, make_user):
        user, row = _seed_primary_subscription(db_session, make_user)
        ok = _mark_subscription_payment_failed(
            db_session,
            razorpay_subscription_id=row.razorpay_subscription_id,
            payment_id="pay_x",
        )
        assert ok is True
        db_session.refresh(user)
        db_session.refresh(row)
        assert user.subscription_status == "failed"
        assert row.status == "failed"

    def test_string_vs_int_lookup_no_longer_misses(self, db_session, make_user):
        """Regression: comparing Razorpay id to User.subscription_id never matched."""
        user, row = _seed_primary_subscription(db_session, make_user, rzp_id="sub_string_id")
        # Prove the old broken predicate would miss:
        broken = (
            db_session.query(User)
            .filter(User.subscription_id == "sub_string_id")
            .first()
        )
        assert broken is None
        assert user.subscription_id == row.id

        ok = _mark_subscription_payment_failed(
            db_session,
            razorpay_subscription_id="sub_string_id",
            payment_id="pay_y",
        )
        assert ok is True
        db_session.refresh(user)
        assert user.subscription_status == "failed"

    def test_agent_addon_deactivates_on_failure(self, db_session, make_user):
        user, row = _seed_addon_subscription(db_session, make_user)
        ok = _mark_subscription_payment_failed(
            db_session,
            razorpay_subscription_id=row.razorpay_subscription_id,
            payment_id="pay_addon",
        )
        assert ok is True
        db_session.refresh(user)
        db_session.refresh(row)
        assert user.agent_addon_active is False
        assert user.agent_addon_cancelling is False
        assert row.status == "failed"

    def test_unknown_subscription_is_noop(self, db_session):
        ok = _mark_subscription_payment_failed(
            db_session,
            razorpay_subscription_id="sub_does_not_exist",
            payment_id="pay_z",
        )
        assert ok is False


class TestResolvePaymentSubscriptionId:
    def test_uses_entity_subscription_id(self):
        assert (
            _resolve_payment_subscription_id(
                {"id": "pay_1", "subscription_id": "sub_a"},
                event_label="payment.failed",
            )
            == "sub_a"
        )

    def test_fetches_when_entity_omits_subscription_id(self):
        client = MagicMock()
        client.payment.fetch.return_value = {"subscription_id": "sub_fetched"}
        with patch("arena.routes.payments._get_razorpay_client", return_value=client):
            assert (
                _resolve_payment_subscription_id(
                    {"id": "pay_2"},
                    event_label="payment.failed",
                )
                == "sub_fetched"
            )
        client.payment.fetch.assert_called_once_with("pay_2")

    def test_returns_none_when_fetch_fails(self):
        client = MagicMock()
        client.payment.fetch.side_effect = RuntimeError("network")
        with patch("arena.routes.payments._get_razorpay_client", return_value=client):
            assert (
                _resolve_payment_subscription_id(
                    {"id": "pay_3"},
                    event_label="payment.failed",
                )
                is None
            )


class TestPaymentFailedWebhookEndpoint:
    @pytest.mark.asyncio
    async def test_webhook_marks_primary_failed(
        self, app_client, secret_env, db_session, make_user
    ):
        user, row = _seed_primary_subscription(db_session, make_user)
        body = _failed_payment_body(subscription_id=row.razorpay_subscription_id)
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
        db_session.refresh(user)
        db_session.refresh(row)
        assert user.subscription_status == "failed"
        assert row.status == "failed"

    @pytest.mark.asyncio
    async def test_webhook_fetches_subscription_when_omitted(
        self, app_client, secret_env, db_session, make_user
    ):
        user, row = _seed_primary_subscription(
            db_session, make_user, rzp_id="sub_from_fetch"
        )
        body = _failed_payment_body(payment_id="pay_omit", subscription_id=None)
        sig = _sign(secret_env.razorpay_webhook_secret, body)

        client = MagicMock()
        client.payment.fetch.return_value = {"subscription_id": "sub_from_fetch"}
        with patch("arena.routes.payments._get_razorpay_client", return_value=client):
            res = await app_client.post(
                "/api/payments/webhook",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Razorpay-Signature": sig,
                },
            )
        assert res.status_code == 200, res.text
        db_session.refresh(user)
        assert user.subscription_status == "failed"
