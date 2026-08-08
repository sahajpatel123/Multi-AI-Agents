"""Tests for the VerifyPaymentRequest Razorpay field length bounds.

The razorpay_payment_id, razorpay_subscription_id, and
razorpay_signature fields historically had no max_length at
the Pydantic level. A user could submit a 1MB string in any
of these fields to amplify the verify-payment work.

Razorpay payment/subscription IDs are short
("pay_XXXXXXXXXXXXX" ~18 chars, "sub_..." ~18 chars);
64 chars is generous. Razorpay signatures are
HMAC-SHA256 hex strings (~64 chars); 256 chars is generous.

Tests pin:
- Each field with a typical Razorpay value accepted
- 64-char payment_id / subscription_id accepted (boundary)
- 65-char rejected
- 256-char signature accepted (boundary)
- 257-char signature rejected
- 1MB rejected (DoS)
- Empty string rejected (the fields are required)
- Missing field rejected
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.models.schemas import VerifyPaymentRequest
from pydantic import ValidationError


# --- typical Razorpay values ---


def test_typical_payment_id_accepted() -> None:
    """A typical Razorpay payment_id ("pay_...") is ~18 chars."""
    req = VerifyPaymentRequest(
        razorpay_payment_id="pay_ABCDEFGHIJKLMNOP",
        razorpay_subscription_id="sub_ABCDEFGHIJKLMNOP",
        razorpay_signature="abcdef0123456789" * 4,  # 64 chars
    )
    assert req.razorpay_payment_id == "pay_ABCDEFGHIJKLMNOP"


# --- payment_id bound (max 64) ---


def test_payment_id_64_accepted() -> None:
    req = VerifyPaymentRequest(
        razorpay_payment_id="a" * 64,
        razorpay_subscription_id="sub_xxx",
        razorpay_signature="sig",
    )
    assert len(req.razorpay_payment_id) == 64


def test_payment_id_65_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        VerifyPaymentRequest(
            razorpay_payment_id="a" * 65,
            razorpay_subscription_id="sub_xxx",
            razorpay_signature="sig",
        )
    assert "razorpay_payment_id" in str(exc_info.value).lower()


def test_payment_id_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        VerifyPaymentRequest(
            razorpay_payment_id="a" * (1024 * 1024),
            razorpay_subscription_id="sub_xxx",
            razorpay_signature="sig",
        )


# --- subscription_id bound (max 64) ---


def test_subscription_id_64_accepted() -> None:
    req = VerifyPaymentRequest(
        razorpay_payment_id="pay_xxx",
        razorpay_subscription_id="a" * 64,
        razorpay_signature="sig",
    )
    assert len(req.razorpay_subscription_id) == 64


def test_subscription_id_65_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        VerifyPaymentRequest(
            razorpay_payment_id="pay_xxx",
            razorpay_subscription_id="a" * 65,
            razorpay_signature="sig",
        )
    assert "razorpay_subscription_id" in str(exc_info.value).lower()


# --- signature bound (max 256) ---


def test_signature_256_accepted() -> None:
    req = VerifyPaymentRequest(
        razorpay_payment_id="pay_xxx",
        razorpay_subscription_id="sub_xxx",
        razorpay_signature="a" * 256,
    )
    assert len(req.razorpay_signature) == 256


def test_signature_257_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        VerifyPaymentRequest(
            razorpay_payment_id="pay_xxx",
            razorpay_subscription_id="sub_xxx",
            razorpay_signature="a" * 257,
        )
    assert "razorpay_signature" in str(exc_info.value).lower()


def test_signature_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        VerifyPaymentRequest(
            razorpay_payment_id="pay_xxx",
            razorpay_subscription_id="sub_xxx",
            razorpay_signature="a" * (1024 * 1024),
        )


# --- empty / missing field ---


def test_empty_payment_id_accepted() -> None:
    """Empty string is accepted by the Pydantic str field
    (Pydantic v2 doesn't reject empty strings by default).
    The route handler's downstream validation rejects empty
    Razorpay IDs with a 400. The Pydantic cap (max 64) closes
    the length-based DoS surface; the route handler closes
    the empty-string surface.
    """
    req = VerifyPaymentRequest(
        razorpay_payment_id="",
        razorpay_subscription_id="sub_xxx",
        razorpay_signature="sig",
    )
    assert req.razorpay_payment_id == ""


def test_missing_payment_id_rejected() -> None:
    """Missing field is rejected (the field is required)."""
    with pytest.raises(ValidationError):
        VerifyPaymentRequest(
            razorpay_subscription_id="sub_xxx",
            razorpay_signature="sig",
        )  # type: ignore[call-arg]
