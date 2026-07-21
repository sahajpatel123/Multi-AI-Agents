"""Razorpay webhook replay protection + bounded webhook body size."""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from arena.core.request_size import (
    WEBHOOK_MAX_BODY_BYTES,
    max_request_body_bytes,
    payload_too_large_message,
)
from arena.core.webhook_idempotency import (
    build_webhook_event_key,
    claim_webhook_event,
    purge_expired_webhook_events,
    release_webhook_event,
)
from arena.db_models import ProcessedWebhookEvent
from arena.core.datetime_utils import utcnow_naive


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _body(event: str = "subscription.activated", sub_id: str = "sub_idem_1") -> bytes:
    return json.dumps(
        {
            "event": event,
            "created_at": 1_700_000_000,
            "payload": {
                "subscription": {"entity": {"id": sub_id, "plan_id": "plan_test"}},
            },
        },
        separators=(",", ":"),
    ).encode()


@pytest.fixture
def secret_env(monkeypatch):
    from arena.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "razorpay_webhook_secret", "whsec_unit_test_secret", raising=False)
    return settings


class TestWebhookEventKey:
    def test_prefers_event_id_header(self):
        key = build_webhook_event_key(
            {"event": "payment.failed"},
            event_id_header="evt_abc123",
        )
        assert key == "hdr:evt_abc123"

    def test_digest_stable_for_same_payload(self):
        payload = {
            "event": "subscription.charged",
            "created_at": 42,
            "payload": {"subscription": {"entity": {"id": "sub_x"}}},
        }
        a = build_webhook_event_key(payload)
        b = build_webhook_event_key(payload)
        assert a == b
        assert a.startswith("dig:")


class TestClaimRelease:
    def test_second_claim_is_rejected(self, db_session):
        assert claim_webhook_event(db_session, "hdr:once", event_name="subscription.charged")
        assert claim_webhook_event(db_session, "hdr:once", event_name="subscription.charged") is False

    def test_release_allows_reclaim(self, db_session):
        assert claim_webhook_event(db_session, "hdr:retry")
        release_webhook_event(db_session, "hdr:retry")
        assert claim_webhook_event(db_session, "hdr:retry")

    def test_purge_expired(self, db_session):
        now = utcnow_naive()
        row = ProcessedWebhookEvent(
            event_key="hdr:old",
            event_name="x",
            processed_at=now - timedelta(days=8),
            expires_at=now - timedelta(days=1),
        )
        db_session.add(row)
        db_session.commit()
        n = purge_expired_webhook_events(db_session)
        assert n >= 1
        assert (
            db_session.query(ProcessedWebhookEvent)
            .filter(ProcessedWebhookEvent.event_key == "hdr:old")
            .first()
            is None
        )


class TestWebhookReplayEndpoint:
    @pytest.mark.asyncio
    async def test_duplicate_delivery_returns_duplicate_flag(
        self, app_client, secret_env
    ):
        body = _body(sub_id="sub_replay_1")
        sig = _sign(secret_env.razorpay_webhook_secret, body)
        headers = {
            "Content-Type": "application/json",
            "X-Razorpay-Signature": sig,
            "X-Razorpay-Event-Id": "evt_replay_unique_1",
        }
        with patch("arena.routes.payments._find_subscription_by_rzp_id", return_value=None):
            first = await app_client.post(
                "/api/payments/webhook", content=body, headers=headers
            )
            second = await app_client.post(
                "/api/payments/webhook", content=body, headers=headers
            )
        assert first.status_code == 200, first.text
        assert first.json().get("duplicate") is not True
        assert second.status_code == 200, second.text
        assert second.json().get("duplicate") is True

    @pytest.mark.asyncio
    async def test_handler_failure_releases_claim_for_retry(
        self, app_client, secret_env
    ):
        body = _body(event="subscription.activated", sub_id="sub_fail_retry")
        sig = _sign(secret_env.razorpay_webhook_secret, body)
        headers = {
            "Content-Type": "application/json",
            "X-Razorpay-Signature": sig,
            "X-Razorpay-Event-Id": "evt_fail_then_retry",
        }
        with patch(
            "arena.routes.payments._apply_subscription_event",
            side_effect=RuntimeError("boom"),
        ):
            failed = await app_client.post(
                "/api/payments/webhook", content=body, headers=headers
            )
        assert failed.status_code == 500, failed.text

        with patch("arena.routes.payments._find_subscription_by_rzp_id", return_value=None):
            with patch("arena.routes.payments._apply_subscription_event"):
                retry = await app_client.post(
                    "/api/payments/webhook", content=body, headers=headers
                )
        assert retry.status_code == 200, retry.text
        assert retry.json().get("duplicate") is not True


class TestWebhookBodySize:
    def test_max_bytes_and_message(self):
        assert max_request_body_bytes("/api/payments/webhook") == WEBHOOK_MAX_BODY_BYTES
        assert "1MB" in payload_too_large_message("/api/payments/webhook")

    @pytest.mark.asyncio
    async def test_webhook_allows_over_default_under_1mb(self, app_client):
        # 20KB exceeds default 10KB API cap but is under webhook 1MB.
        res = await app_client.post(
            "/api/payments/webhook",
            content=b"x" * 20_000,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": "0" * 64,
            },
        )
        assert res.status_code != 413, res.text

    @pytest.mark.asyncio
    async def test_webhook_rejects_over_1mb(self, app_client):
        res = await app_client.post(
            "/api/payments/webhook",
            content=b"x" * (WEBHOOK_MAX_BODY_BYTES + 1),
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": "0" * 64,
            },
        )
        assert res.status_code == 413, res.text
        assert res.json().get("error") == "payload_too_large"
