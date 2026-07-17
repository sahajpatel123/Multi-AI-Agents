"""Agent add-on subscribe must not leak Razorpay/SDK exception text."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


@pytest.mark.asyncio
async def test_addon_subscribe_does_not_leak_exception_text(
    app_client, make_user, monkeypatch
):
    from arena.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "razorpay_agent_addon_plan_id", "plan_test_addon", raising=False)
    monkeypatch.setattr(settings, "razorpay_api_key", "rzp_test_key", raising=False)
    monkeypatch.setattr(settings, "razorpay_key_secret", "rzp_test_secret", raising=False)

    user = make_user(email="addon-leak@test.com", tier=UserTier.PLUS)

    client = MagicMock()
    client.customer.create.return_value = {"id": "cust_test_1"}
    client.subscription.create.side_effect = RuntimeError(
        "RAZORPAY_INTERNAL plan_secret_xyz customer=cust_leak"
    )

    with patch("arena.routes.payments._get_razorpay_client", return_value=client):
        res = await app_client.post(
            "/api/payments/addon/agent/subscribe",
            headers=_headers(user),
        )

    assert res.status_code == 502, res.text
    body = res.text
    assert "RAZORPAY_INTERNAL" not in body
    assert "plan_secret_xyz" not in body
    assert "cust_leak" not in body
    assert "Could not create add-on subscription" in body
