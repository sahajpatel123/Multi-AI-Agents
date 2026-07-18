"""Aggregate the caller's tier + add-on + loyalty state into a single
entitlements payload. Powers the account page's 'what does my plan
include' panel and the agent access gate that route handlers consult
before they do any real work."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from arena.core.tier_config import (
    TIER_DAILY_LIMITS,
    TIER_FEATURES,
    TIER_MESSAGE_LIMITS,
    UserTier,
    get_tier_str,
    normalize_tier,
)
from arena.db_models import Subscription, User


def _coerce_iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.isoformat()


def compute_user_entitlements(
    db: Session,
    user: User,
    *,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    """Return the caller's current plan + add-on + loyalty summary.

    Tier lookup mirrors the agent-route gate: Plus users see the
    Agent add-on as active when ``agent_addon_active`` is set OR
    the loyalty free-period window has not yet ended. Loyalty
    fields expose both the next-resume time and the attempts/next
    attempt counters from the loyalty scheduler, so a UI can show
    'we'll bill you again on Y' without a second roundtrip.
    """
    tier = normalize_tier(get_tier_str(user))
    features = dict(TIER_FEATURES.get(tier, TIER_FEATURES[UserTier.FREE]))

    # Plus + agent add-on: surface as an extra entitlement.
    if tier == UserTier.PLUS and bool(
        getattr(user, "agent_addon_active", False)
        or getattr(user, "agent_addon_cancelling", False)
    ):
        features["agent_mode"] = True
        features["agent_orchestrate"] = True
        features["scoring_audit"] = True

    now = now or datetime.now(timezone.utc).replace(tzinfo=None)

    subscription: Optional[Subscription] = None
    if user.subscription_id:
        subscription = db.query(Subscription).filter(
            Subscription.id == user.subscription_id
        ).first()
    if subscription is None:
        subscription = (
            db.query(Subscription)
            .filter(Subscription.user_id == user.id)
            .order_by(Subscription.id.desc())
            .first()
        )

    sub_payload: Optional[dict[str, Any]] = None
    if subscription is not None:
        is_active_status = subscription.status in {
            "created",
            "authenticated",
            "active",
            "halted",
            "cancelled",
        }
        sub_payload = {
            "id": subscription.id,
            "tier": subscription.tier,
            "plan_name": subscription.plan_name,
            "status": subscription.status,
            "billing_period": subscription.billing_period,
            "amount": subscription.amount,
            "currency": subscription.currency,
            "current_start": _coerce_iso(subscription.current_start),
            "current_end": _coerce_iso(subscription.current_end),
            "payment_count": subscription.payment_count,
            "is_active": is_active_status,
            "razorpay_subscription_id": subscription.razorpay_subscription_id,
        }

    loyalty = {
        "reward_active": bool(getattr(user, "loyalty_reward_active", False)),
        "free_months_remaining": int(
            getattr(user, "loyalty_free_months_remaining", 0) or 0
        ),
        "resume_at": _coerce_iso(getattr(user, "loyalty_resume_at", None)),
        "next_attempt_at": _coerce_iso(
            getattr(user, "loyalty_resume_next_attempt_at", None)
        ),
        "attempts": int(getattr(user, "loyalty_resume_attempts", 0) or 0),
        "consecutive_payments": int(
            getattr(user, "consecutive_payments", 0) or 0
        ),
    }

    agent_addon = {
        "active": bool(getattr(user, "agent_addon_active", False)),
        "cancelling": bool(getattr(user, "agent_addon_cancelling", False)),
        "subscription_id": getattr(user, "addon_subscription_id", None),
    }

    return {
        "tier": tier.value if hasattr(tier, "value") else str(tier),
        "is_guest": tier == UserTier.GUEST,
        "limits": {
            "daily_messages": TIER_MESSAGE_LIMITS.get(
                tier, TIER_MESSAGE_LIMITS[UserTier.FREE]
            ),
            "daily_credits": TIER_DAILY_LIMITS.get(
                tier, TIER_DAILY_LIMITS[UserTier.FREE]
            ),
        },
        "features": features,
        "subscription": sub_payload,
        "loyalty": loyalty,
        "agent_addon": agent_addon,
        "computed_at": _coerce_iso(now),
    }