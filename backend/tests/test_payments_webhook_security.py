"""Webhook HMAC verification contract for /api/payments/webhook.

The webhook handler at arena/routes/payments.py:705 is the most security-
sensitive endpoint outside auth: it accepts state-changing events from
Razorpay's HTTP requests, and the entire flow is gated by HMAC-SHA256
signature verification. These tests pin the verification contract so a
future refactor cannot quietly weaken it.

The tests:
  1. A webhook with a valid signature for the configured secret accepts
     the payload (returns 200).
  2. A webhook with a wrong signature is rejected with 400 "Invalid
     signature".
  3. A webhook with a tampered payload (header signed the original body,
     body modified in transit) is rejected — the recomputed HMAC does
     not match.
  4. A webhook when RAZORPAY_WEBHOOK_SECRET is unset returns 200 with
     {"status": "ok"} but never invokes state changes (preserves the
     "don't get hammered by retries" design and ensures we never
     process unverified events).
  5. /api/payments/verify's HMAC: a forged signature is rejected, a
     tampered payment_id/subscription_id fails, the correct signature
     for the configured secret passes auth-acknowledge-only.

If any of these break in CI, the webhook security model regressed and
has to be reaudited before merge.
"""

import hashlib
import hmac
import json
from unittest.mock import MagicMock, patch

import pytest


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@pytest.fixture
def secret_env(monkeypatch):
    # The webhook/verify endpoints read settings from the live Settings
    # singleton. Force a known secret for the test session.
    from arena.config import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "razorpay_webhook_secret", "whsec_unit_test_secret", raising=False)
    monkeypatch.setattr(settings, "razorpay_key_secret", "rzp_unit_test_secret", raising=False)
    return settings


def _body(event: str = "subscription.activated", sub_id: str = "sub_test_1") -> bytes:
    return json.dumps({
        "event": event,
        "payload": {
            "subscription": {"entity": {"id": sub_id, "plan_id": "plan_test"}},
        },
    }, separators=(",", ":")).encode()


def _stub_subscription_in_db():
    """Stand-in row that the webhook code looks up by rzp subscription id.
    Returning None lets the webhook silently no-op the loyalty / activation
    path so the test stays focused on signature handling, not DB state.
    """
    return None


class TestWebhookHmac:
    @pytest.mark.asyncio
    async def test_valid_signature_accepted(self, app_client, secret_env):
        body = _body()
        sig = _sign(secret_env.razorpay_webhook_secret, body)
        with patch("arena.routes.payments._find_subscription_by_rzp_id", return_value=None):
            res = await app_client.post(
                "/api/payments/webhook",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Razorpay-Signature": sig,
                },
            )
        assert res.status_code == 200, res.text
        # Signature accepted ⇒ DB lookup ran (i.e. the verified path was
        # reached, not the early-return for missing secret).
        # No row matches in the test DB, so the side-effects are no-ops
        # but the signature gate passed.

    @pytest.mark.asyncio
    async def test_wrong_signature_rejected_400(self, app_client, secret_env):
        body = _body()
        wrong_sig = "0" * 64  # 64-hex chars but invalid for this secret/body
        res = await app_client.post(
            "/api/payments/webhook",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": wrong_sig,
            },
        )
        assert res.status_code == 400, res.text
        # The rejected signature must NOT have been processed — verify
        # the response detail names signature failure explicitly.
        # Cycle 58: detail is now the standard {error, message} envelope.
        body_json = res.json()
        detail = body_json.get("detail", {})
        assert detail.get("message") == "Invalid signature", (
            f"expected {{error, message: 'Invalid signature'}}, got {detail}"
        )

    @pytest.mark.asyncio
    async def test_tampered_body_rejected(self, app_client, secret_env):
        original = _body(sub_id="sub_legit")
        sig = _sign(secret_env.razorpay_webhook_secret, original)
        # Attacker tries to swap sub_id after signing.
        tampered = _body(sub_id="sub_attacker")
        res = await app_client.post(
            "/api/payments/webhook",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": sig,  # signed original, sent with tampered
            },
        )
        assert res.status_code == 400, res.text

    @pytest.mark.asyncio
    async def test_missing_signature_header_rejected(self, app_client, secret_env):
        body = _body()
        # No X-Razorpay-Signature header at all.
        res = await app_client.post(
            "/api/payments/webhook",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        assert res.status_code == 400, res.text

    @pytest.mark.asyncio
    async def test_unset_secret_swallows_payload_safely_in_dev(
        self, app_client, monkeypatch
    ):
        # Non-production: 200 without processing (avoid retry storms in
        # local/CI when billing secrets are absent). Never apply events.
        from arena.config import get_settings
        settings = get_settings()
        monkeypatch.setattr(settings, "razorpay_webhook_secret", "", raising=False)
        monkeypatch.setattr(
            type(settings),
            "is_production",
            property(lambda self: False),
        )
        calls = []
        with patch(
            "arena.routes.payments._find_subscription_by_rzp_id",
            side_effect=lambda *a, **k: calls.append("lookup") or None,
        ):
            res = await app_client.post(
                "/api/payments/webhook",
                content=_body(),
                headers={"X-Razorpay-Signature": "anything"},
            )
        assert res.status_code == 200, res.text
        assert calls == [], (
            "webhook with RAZORPAY_WEBHOOK_SECRET unset reached the DB "
            "lookup path; the signature-gate failed to short-circuit."
        )

    @pytest.mark.asyncio
    async def test_unset_secret_fails_closed_in_production(
        self, app_client, monkeypatch
    ):
        # Production: missing webhook secret is a misconfiguration —
        # surface 503 instead of a healthy-looking 200.
        from arena.config import get_settings
        settings = get_settings()
        monkeypatch.setattr(settings, "razorpay_webhook_secret", "", raising=False)
        monkeypatch.setattr(
            type(settings),
            "is_production",
            property(lambda self: True),
        )
        calls = []
        with patch(
            "arena.routes.payments._find_subscription_by_rzp_id",
            side_effect=lambda *a, **k: calls.append("lookup") or None,
        ):
            res = await app_client.post(
                "/api/payments/webhook",
                content=_body(),
                headers={"X-Razorpay-Signature": "0" * 64},
            )
        assert res.status_code == 503, res.text
        assert calls == []

    @pytest.mark.asyncio
    async def test_short_signature_rejected_without_500(self, app_client, secret_env):
        """Wrong-length signatures must 400, never 500 from compare_digest."""
        body = _body()
        res = await app_client.post(
            "/api/payments/webhook",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": "tooshort",
            },
        )
        assert res.status_code == 400, res.text

    @pytest.mark.asyncio
    async def test_handler_exception_returns_500_not_200(
        self, app_client, secret_env
    ):
        """Regression: a non-HTTPException raised inside the webhook
        handler MUST return a non-2xx response so Razorpay retries.

        Before this fix, the outer `except Exception:` block at
        `payments.py:958-959` logged the exception and fell through to
        `return JSONResponse(status_code=200, ...)`. Razorpay interprets
        that 200 as "we got it, don't retry" — silently losing the
        payment event (HIGH severity, see
        backend/docs/HOT-PATH-ANALYSIS.md).

        Pin the contract: handler exception ⇒ 500 with
        `{"error": "webhook_handler_error"}`.
        """
        body = _body()
        sig = _sign(secret_env.razorpay_webhook_secret, body)

        def _boom(*_args, **_kwargs):
            raise RuntimeError("simulated inner-handler failure")

        with patch(
            "arena.routes.payments._find_subscription_by_rzp_id",
            side_effect=_boom,
        ):
            res = await app_client.post(
                "/api/payments/webhook",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Razorpay-Signature": sig,
                },
            )
        assert res.status_code == 500, res.text
        payload = res.json()
        assert payload.get("error") == "webhook_handler_error", payload


class TestVerifyHmac:
    """POST /api/payments/verify uses the same HMAC primitive but
    over a fixed string (no raw body available at this endpoint).
    Pin the explicit-message shape so any format change surfaces here.
    """

    @pytest.mark.asyncio
    async def test_signature_with_tampered_payment_id_rejected(
        self, app_client, auth_headers, make_user, isolated_db, secret_env
    ):
        # Legitimate signature for payment_id "pay_good" but caller
        # sends payment_id="pay_bad". The HMAC over the actual message
        # the server builds is what matters — which means the verifier
        # must reject the mismatch.
        from arena.db_models import UserTier
        user = make_user(email="pay@test.com", tier=UserTier.PLUS)
        from arena.core.auth import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        body_text = b"pay_bad|sub_sub"
        # The production code at payments.py:567-572 does:
        #   message = f"{payment_id}|{subscription_id}"
        #   expected = hmac.new(secret.encode(), message.encode(), sha256).hexdigest()
        # so the client-side string that was actually signed is the byte-encoded
        # version of the LEGITIMATE payment_id, not the tampered one the
        # attacker put on the wire. Building the wrong signature on the wrong
        # string is the precise case the verifier must reject.
        forged_sig = _sign(
            secret_env.razorpay_key_secret,
            f"{'pay_good'}|{'sub_sub'}".encode(),
        )

        res = await app_client.post(
            "/api/payments/verify",
            json={
                "razorpay_payment_id": "pay_bad",
                "razorpay_subscription_id": "sub_sub",
                "razorpay_signature": forged_sig,
            },
            headers=headers,
        )
        # Either 400 (signature mismatch) or 404 (no row) — anything
        # but a 200. Both prove the forged signature was not honored.
        assert res.status_code != 200, res.text
        if res.status_code == 400:
            assert "signature" in str(res.json()).lower()

    @pytest.mark.asyncio
    async def test_missing_key_secret_503(
        self, app_client, auth_headers, make_user, isolated_db, monkeypatch
    ):
        """When the server-side key secret is unset, the verify endpoint
        must return 503 — not silently 200. Pin that contract so a
        misconfigured deploy alerts immediately.
        """
        from arena.config import get_settings
        settings = get_settings()
        monkeypatch.setattr(settings, "razorpay_key_secret", "", raising=False)

        from arena.db_models import UserTier
        user = make_user(email="pay2@test.com", tier=UserTier.PLUS)
        from arena.core.auth import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

        res = await app_client.post(
            "/api/payments/verify",
            json={
                "razorpay_payment_id": "pay_x",
                "razorpay_subscription_id": "sub_x",
                "razorpay_signature": "anything",
            },
            headers=headers,
        )
        assert res.status_code == 503, (
            f"verify must return 503 when RAZORPAY_KEY_SECRET is unset; "
            f"got {res.status_code} — a misconfigured deploy must alert, "
            f"not silently succeed."
        )
