"""Tests for compute_user_entitlements.

The entitlements payload powers:
  - the Account page 'what does my plan include' panel
  - the agent access gate that route handlers consult before any real work

Drift here means either the Account page shows wrong capabilities or the
agent gate mis-routes Plus+add-on users. We pin the contract by mocking
the SQLAlchemy Session and a User-shaped object.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from arena.core.entitlements import compute_user_entitlements
from arena.core.tier_config import (
    TIER_DAILY_LIMITS,
    TIER_FEATURES,
    TIER_MESSAGE_LIMITS,
    UserTier,
)


def _user(
    *,
    tier: str = "free",
    subscription_id: Optional[int] = None,
    user_id: int = 7,
    agent_addon_active: bool = False,
    agent_addon_cancelling: bool = False,
    addon_subscription_id: Optional[str] = None,
    loyalty_reward_active: bool = False,
    loyalty_free_months_remaining: int = 0,
    loyalty_resume_at: Optional[datetime] = None,
    loyalty_resume_attempts: int = 0,
    loyalty_resume_next_attempt_at: Optional[datetime] = None,
    consecutive_payments: int = 0,
) -> Any:
    obj = type("User", (), {})()
    obj.id = user_id
    obj.tier = tier
    obj.subscription_id = subscription_id
    obj.agent_addon_active = agent_addon_active
    obj.agent_addon_cancelling = agent_addon_cancelling
    obj.addon_subscription_id = addon_subscription_id
    obj.loyalty_reward_active = loyalty_reward_active
    obj.loyalty_free_months_remaining = loyalty_free_months_remaining
    obj.loyalty_resume_at = loyalty_resume_at
    obj.loyalty_resume_attempts = loyalty_resume_attempts
    obj.loyalty_resume_next_attempt_at = loyalty_resume_next_attempt_at
    obj.consecutive_payments = consecutive_payments
    return obj


def _sub(
    *,
    sub_id: int = 1,
    tier: str = "plus",
    plan_name: str = "Plus Monthly",
    status: str = "active",
    billing_period: str = "monthly",
    amount: int = 999,
    currency: str = "INR",
    current_start: Optional[datetime] = None,
    current_end: Optional[datetime] = None,
    payment_count: int = 1,
    razorpay_id: str = "rzp_test_1",
    user_id: int = 7,
) -> Any:
    obj = type("Subscription", (), {})()
    obj.id = sub_id
    obj.user_id = user_id
    obj.tier = tier
    obj.plan_name = plan_name
    obj.status = status
    obj.billing_period = billing_period
    obj.amount = amount
    obj.currency = currency
    obj.current_start = current_start
    obj.current_end = current_end
    obj.payment_count = payment_count
    obj.razorpay_subscription_id = razorpay_id
    return obj


class _FakeSubscriptionQuery:
    """Returns subscriptions matching the queried id, or all on fallback."""

    def __init__(self, subscriptions: list[Any]) -> None:
        self._subs = subscriptions

    def filter(self, *args: Any, **kwargs: Any) -> "_FakeSubscriptionQuery":
        # The entitlements code calls .filter(Subscription.id == ...)
        # and .filter(Subscription.user_id == ...).order_by(...).first().
        # We can't introspect the SQLAlchemy expressions without
        # pulling in SQLAlchemy itself, so we honor the *call pattern*
        # — the first .filter() is by id, the second is by user_id with
        # an order_by. The test sets user.subscription_id to choose
        # which branch fires.
        self._last_filter = (args, kwargs)
        return self

    def order_by(self, *args: Any, **kwargs: Any) -> "_FakeSubscriptionQuery":
        return self

    def first(self) -> Optional[Any]:
        # If the filter includes an id match, the caller already has
        # user.subscription_id set; otherwise this is the fallback
        # "latest by user_id" lookup.
        return self._subs[0] if self._subs else None


class _FakeSession:
    def __init__(self, subscriptions: list[Any]) -> None:
        self.subscriptions = subscriptions

    def query(self, _model: Any) -> _FakeSubscriptionQuery:
        return _FakeSubscriptionQuery(self.subscriptions)


# ── Tier + features ────────────────────────────────────────────────


def test_free_user_gets_free_tier_and_features() -> None:
    user = _user(tier="free")
    out = compute_user_entitlements(db=_FakeSession([]), user=user)
    assert out["tier"] == "FREE"
    assert out["is_guest"] is False
    # Free tier features: no agent_mode, no scoring_audit, etc.
    assert out["features"]["agent_mode"] is False
    assert out["features"]["scoring_audit"] is False
    assert out["features"]["agent_orchestrate"] is False
    # Limits pulled from TIER_MESSAGE_LIMITS / TIER_DAILY_LIMITS
    assert out["limits"]["daily_messages"] == TIER_MESSAGE_LIMITS[UserTier.FREE]
    assert out["limits"]["daily_credits"] == TIER_DAILY_LIMITS[UserTier.FREE]


def test_pro_tier_unlocks_agent_mode_without_addon() -> None:
    user = _user(tier="pro")
    out = compute_user_entitlements(db=_FakeSession([]), user=user)
    assert out["tier"] == "PRO"
    # Pro tier features already include agent_mode per the tier matrix
    assert out["features"]["agent_mode"] is True
    assert out["features"]["agent_orchestrate"] is True
    assert out["features"]["scoring_audit"] is True
    assert out["limits"]["daily_messages"] == TIER_MESSAGE_LIMITS[UserTier.PRO]


def test_plus_without_addon_does_not_unlock_agent_mode() -> None:
    # Plus is gated behind the add-on. Without it, agent_mode stays False.
    user = _user(tier="plus")
    out = compute_user_entitlements(db=_FakeSession([]), user=user)
    assert out["tier"] == "PLUS"
    assert out["features"]["agent_mode"] is False


def test_plus_with_addon_active_unlocks_agent_features() -> None:
    user = _user(tier="plus", agent_addon_active=True)
    out = compute_user_entitlements(db=_FakeSession([]), user=user)
    assert out["features"]["agent_mode"] is True
    assert out["features"]["agent_orchestrate"] is True
    assert out["features"]["scoring_audit"] is True


def test_plus_with_addon_cancelling_keeps_agent_features() -> None:
    # Cancelling means the user is still paid through the period end —
    # they must keep access until the cancellation takes effect.
    user = _user(tier="plus", agent_addon_cancelling=True)
    out = compute_user_entitlements(db=_FakeSession([]), user=user)
    assert out["features"]["agent_mode"] is True


def test_guest_tier_sets_is_guest_flag() -> None:
    user = _user(tier="guest")
    out = compute_user_entitlements(db=_FakeSession([]), user=user)
    assert out["tier"] == "GUEST"
    assert out["is_guest"] is True


# ── Subscription payload ────────────────────────────────────────────


def test_no_subscription_yields_null_payload() -> None:
    user = _user(tier="free", subscription_id=None, user_id=1)
    out = compute_user_entitlements(db=_FakeSession([]), user=user)
    assert out["subscription"] is None


def test_subscription_payload_carries_all_fields() -> None:
    sub = _sub(
        sub_id=42,
        tier="plus",
        plan_name="Plus Monthly",
        status="active",
        billing_period="monthly",
        amount=999,
        currency="INR",
        current_start=datetime(2026, 1, 1, tzinfo=timezone.utc),
        current_end=datetime(2026, 2, 1, tzinfo=timezone.utc),
        payment_count=3,
        razorpay_id="rzp_sub_42",
    )
    user = _user(tier="plus", subscription_id=42)
    out = compute_user_entitlements(db=_FakeSession([sub]), user=user)
    assert out["subscription"]["id"] == 42
    assert out["subscription"]["tier"] == "plus"
    assert out["subscription"]["plan_name"] == "Plus Monthly"
    assert out["subscription"]["status"] == "active"
    assert out["subscription"]["billing_period"] == "monthly"
    assert out["subscription"]["amount"] == 999
    assert out["subscription"]["currency"] == "INR"
    assert out["subscription"]["payment_count"] == 3
    assert out["subscription"]["razorpay_subscription_id"] == "rzp_sub_42"
    assert out["subscription"]["is_active"] is True


def test_subscription_status_active_set_flag() -> None:
    sub = _sub(status="active")
    user = _user(tier="plus", subscription_id=1)
    out = compute_user_entitlements(db=_FakeSession([sub]), user=user)
    assert out["subscription"]["is_active"] is True


def test_subscription_status_cancelled_kept_active_until_period_end() -> None:
    # Cancelled is intentionally in the "active" set — the user keeps
    # access through the paid period end. If a future edit drops this
    # from the set, the UI would instantly revoke access on cancellation
    # which is a product-honesty violation.
    sub = _sub(status="cancelled")
    user = _user(tier="plus", subscription_id=1)
    out = compute_user_entitlements(db=_FakeSession([sub]), user=user)
    assert out["subscription"]["is_active"] is True


def test_subscription_status_expired_is_not_active() -> None:
    sub = _sub(status="expired")
    user = _user(tier="plus", subscription_id=1)
    out = compute_user_entitlements(db=_FakeSession([sub]), user=user)
    assert out["subscription"]["is_active"] is False


def test_subscription_dates_are_iso_strings() -> None:
    sub = _sub(
        current_start=datetime(2026, 1, 1, 5, 30, 0, tzinfo=timezone.utc),
        current_end=datetime(2026, 2, 1, 5, 30, 0, tzinfo=timezone.utc),
    )
    user = _user(tier="plus", subscription_id=1)
    out = compute_user_entitlements(db=_FakeSession([sub]), user=user)
    assert out["subscription"]["current_start"] == "2026-01-01T05:30:00"
    assert out["subscription"]["current_end"] == "2026-02-01T05:30:00"


# ── Add-on + loyalty + computed_at ──────────────────────────────────


def test_agent_addon_payload_reflects_user_flags() -> None:
    user = _user(
        tier="plus",
        agent_addon_active=True,
        agent_addon_cancelling=False,
        addon_subscription_id="rzp_addon_42",
    )
    out = compute_user_entitlements(db=_FakeSession([]), user=user)
    assert out["agent_addon"] == {
        "active": True,
        "cancelling": False,
        "subscription_id": "rzp_addon_42",
    }


def test_agent_addon_payload_when_inactive() -> None:
    user = _user(tier="plus")
    out = compute_user_entitlements(db=_FakeSession([]), user=user)
    assert out["agent_addon"] == {
        "active": False,
        "cancelling": False,
        "subscription_id": None,
    }


def test_loyalty_payload_reflects_user_fields() -> None:
    resume = datetime(2026, 9, 1, tzinfo=timezone.utc)
    user = _user(
        tier="plus",
        loyalty_reward_active=True,
        loyalty_free_months_remaining=3,
        loyalty_resume_at=resume,
        loyalty_resume_attempts=2,
        loyalty_resume_next_attempt_at=resume,
        consecutive_payments=12,
    )
    out = compute_user_entitlements(db=_FakeSession([]), user=user)
    assert out["loyalty"] == {
        "reward_active": True,
        "free_months_remaining": 3,
        "resume_at": "2026-09-01T00:00:00",
        "next_attempt_at": "2026-09-01T00:00:00",
        "attempts": 2,
        "consecutive_payments": 12,
    }


def test_computed_at_is_present_and_iso() -> None:
    user = _user(tier="free")
    out = compute_user_entitlements(db=_FakeSession([]), user=user)
    # computed_at must be a non-null ISO string (the now() call always
    # produces one — never None, which would break the Account page).
    assert isinstance(out["computed_at"], str)
    assert "T" in out["computed_at"]


def test_top_level_shape_is_stable() -> None:
    # Lock the top-level keys so a future edit that adds/removes a
    # section trips this test loudly. The Account page consumes
    # `tier`, `is_guest`, `limits`, `features`, `subscription`, `loyalty`,
    # `agent_addon`, `computed_at` — any rename breaks the consumer.
    user = _user(tier="free")
    out = compute_user_entitlements(db=_FakeSession([]), user=user)
    assert set(out.keys()) == {
        "tier",
        "is_guest",
        "limits",
        "features",
        "subscription",
        "loyalty",
        "agent_addon",
        "computed_at",
    }
