"""Razorpay subscription payments — /api/payments/*"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.core.hmac_verify import hmac_sha256_hex_equal
from arena.core.rate_limits import enforce_user_rate_limit
from arena.core.tier_config import get_tier_str
from arena.core.dependencies import get_current_user_required_orm
from arena.database import get_db
from arena.db_models import Subscription, User, UserTier
from arena.models.schemas import SubscribePlanRequest, VerifyPaymentRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["payments"])


def _enforce_payment_rate_limit(user_id: int) -> None:
    enforce_user_rate_limit(
        user_id,
        scope="payments",
        limit=5,
        window_seconds=60,
        message="Too many payment requests. Limit is 5 per minute.",
    )


def _razorpay_ts_to_naive_utc(ts: Any) -> Optional[datetime]:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, OSError):
        return None


def _get_razorpay_client() -> razorpay.Client:
    settings = get_settings()
    if not settings.razorpay_api_key or not settings.razorpay_key_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments are not configured",
        )
    return razorpay.Client(auth=(settings.razorpay_api_key, settings.razorpay_key_secret))


def _plan_map(settings) -> dict[str, dict[str, Any]]:
    """Plan IDs from settings; amounts in paise from product pricing."""
    return {
        "plus_monthly": {
            "plan_id": settings.razorpay_plus_monthly_plan_id,
            "tier": "PLUS",
            "billing_period": "monthly",
            "amount": 99900,
            "name": "Arena Plus Monthly",
        },
        "plus_annual": {
            "plan_id": settings.razorpay_plus_annual_plan_id,
            "tier": "PLUS",
            "billing_period": "annual",
            "amount": 889_900,
            "name": "Arena Plus Annual",
        },
        "pro_monthly": {
            "plan_id": settings.razorpay_pro_monthly_plan_id,
            "tier": "PRO",
            "billing_period": "monthly",
            "amount": 249_900,
            "name": "Arena Pro Monthly",
        },
        "pro_annual": {
            "plan_id": settings.razorpay_pro_annual_plan_id,
            "tier": "PRO",
            "billing_period": "annual",
            "amount": 1_980_000,
            "name": "Arena Pro Annual",
        },
        "agent_addon_monthly": {
            "plan_id": settings.razorpay_agent_addon_plan_id,
            "tier": "AGENT_ADDON",
            "billing_period": "monthly",
            "amount": 59_900,
            "name": "Agent Mode Add-on",
        },
    }


# Static feature highlights per tier — the public pricing page renders
# this directly, so it lives next to the plan map (single source of truth).
# Feature names match keys in arena.core.tier_config.TIER_FEATURES so a
# future expansion stays in sync.
PLAN_FEATURE_HIGHLIGHTS: dict[str, list[str]] = {
    "FREE": [
        "3 Arena messages per day",
        "6 starter personas",
    ],
    "PLUS": [
        "15 Arena messages per day",
        "All 16 personas",
        "Saved responses",
        "Discuss mode",
    ],
    "PRO": [
        "35 Arena messages per day",
        "Rolling 5-hour window",
        "Agent Mode add-on eligible",
        "Priority rate limits",
    ],
    "AGENT_ADDON": [
        "Persistent Agent Mode",
        "Cross-session memory",
        "Watchlists",
    ],
}


def _ensure_razorpay_customer(
    client: razorpay.Client,
    db: Session,
    user: User,
) -> str:
    if user.razorpay_customer_id:
        return user.razorpay_customer_id
    try:
        created = client.customer.create(
            {
                "email": user.email,
                "fail_existing": "0",
                "notes": {"user_id": str(user.id)},
            }
        )
    except Exception as exc:
        logger.exception("Razorpay customer create failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not start checkout. Please try again.",
        ) from exc
    cid = created.get("id")
    if not cid:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not start checkout. Please try again.",
        )
    user.razorpay_customer_id = cid
    db.add(user)
    db.flush()
    return cid


def _tier_enum_from_label(label: str) -> UserTier:
    try:
        return UserTier[label]
    except KeyError:
        return UserTier.FREE


def _tier_label(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _log_tier_change(
    *,
    user_id: int,
    old_tier: Any,
    new_tier: Any,
    trigger: str,
    subscription_id: Optional[str],
) -> None:
    logger.info(
        "[TIER_CHANGE] user_id=%s old_tier=%s new_tier=%s trigger=%s subscription_id=%s",
        user_id,
        _tier_label(old_tier),
        _tier_label(new_tier),
        trigger,
        subscription_id,
    )


def _find_subscription_by_rzp_id(db: Session, sub_id: str) -> Optional[Subscription]:
    return (
        db.query(Subscription)
        .filter(Subscription.razorpay_subscription_id == sub_id)
        .first()
    )


def _activate_subscription_and_user(
    db: Session,
    row: Subscription,
    *,
    trigger: str,
    status_value: str = "active",
) -> Optional[User]:
    row.status = status_value
    db.add(row)

    user = db.query(User).filter(User.id == row.user_id).first()
    if not user:
        return None

    old_tier = user.tier
    user.tier = _tier_enum_from_label(row.tier)
    user.subscription_id = row.id
    user.subscription_status = status_value
    user.subscription_end_date = row.current_end
    db.add(user)

    _log_tier_change(
        user_id=user.id,
        old_tier=old_tier,
        new_tier=user.tier,
        trigger=trigger,
        subscription_id=row.razorpay_subscription_id,
    )
    return user


def _cancel_agent_addon_if_active(db: Session, user: User, client: razorpay.Client) -> None:
    sid = getattr(user, "addon_subscription_id", None)
    if not sid and not getattr(user, "agent_addon_active", False) and not getattr(
        user, "agent_addon_cancelling", False
    ):
        return
    if sid:
        try:
            client.subscription.cancel(sid, {"cancel_at_cycle_end": 0})
        except Exception as exc:
            logger.warning("Cancel agent add-on subscription failed: %s", exc)
    user.agent_addon_active = False
    user.agent_addon_cancelling = False
    user.addon_subscription_id = None
    db.add(user)


def _apply_agent_addon_subscription_event(
    db: Session,
    row: Subscription,
    entity: dict[str, Any],
    *,
    trigger: str,
) -> None:
    row.status = "active"
    row.current_start = _razorpay_ts_to_naive_utc(entity.get("current_start")) or row.current_start
    row.current_end = _razorpay_ts_to_naive_utc(entity.get("current_end")) or row.current_end
    if trigger == "subscription.charged":
        row.payment_count = int(entity.get("paid_count", int(row.payment_count or 0) + 1))
    user = db.query(User).filter(User.id == row.user_id).first()
    if user:
        user.agent_addon_active = True
        user.agent_addon_cancelling = False
        user.addon_subscription_id = row.razorpay_subscription_id
        db.add(user)
    db.add(row)


def _loyalty_on_pro_monthly_charged(
    db: Session, row: Subscription, settings: Any, *, is_new_charge: bool = True
) -> None:
    if not is_new_charge:
        # Redelivered / duplicate charge webhook — do not accrue loyalty again,
        # otherwise a user could reach the 10-payment reward with fewer than 10
        # actual payments (Razorpay retries webhooks at least once).
        return
    if get_tier_str(row) != "pro" or row.billing_period != "monthly":
        return
    expected = (settings.razorpay_pro_monthly_plan_id or "").strip()
    if expected and row.plan_id != expected:
        return
    user = db.query(User).filter(User.id == row.user_id).first()
    if not user:
        return
    if getattr(user, "loyalty_reward_active", False):
        return
    user.consecutive_payments = int(getattr(user, "consecutive_payments", 0) or 0) + 1
    if user.consecutive_payments == 10:
        user.loyalty_reward_active = True
        user.loyalty_free_months_remaining = 2
        user.loyalty_resume_at = datetime.utcnow() + timedelta(days=62)
        try:
            client = _get_razorpay_client()
            client.subscription.pause(row.razorpay_subscription_id, {"pause_at": "now"})
        except Exception as exc:
            logger.exception("Loyalty subscription pause failed: %s", exc)
    db.add(user)


@router.post("/subscribe")
async def create_subscription(
    body: SubscribePlanRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    _enforce_payment_rate_limit(user.id)
    settings = get_settings()
    plans = _plan_map(settings)
    plan_key = body.plan_key.strip()
    if plan_key not in plans:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid plan_key",
        )
    plan = plans[plan_key]
    if not plan["plan_id"]:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Plan is not configured",
        )

    client = _get_razorpay_client()
    customer_id = _ensure_razorpay_customer(client, db, user)

    # Annual: single yearly renewal cycle; monthly: long-running (10 years cap in Razorpay)
    total_count = 1 if plan["billing_period"] == "annual" else 120

    try:
        rzp_sub = client.subscription.create(
            {
                "plan_id": plan["plan_id"],
                "customer_id": customer_id,
                "customer_notify": 1,
                "quantity": 1,
                "total_count": total_count,
                "notes": {
                    "user_id": str(user.id),
                    "email": user.email,
                    "plan_key": plan_key,
                },
            }
        )
    except Exception as exc:
        logger.exception("Razorpay subscription create failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not create subscription. Please try again.",
        ) from exc

    sub_id = rzp_sub.get("id")
    if not sub_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not create subscription. Please try again.",
        )

    ent = rzp_sub
    current_start = _razorpay_ts_to_naive_utc(ent.get("current_start"))
    current_end = _razorpay_ts_to_naive_utc(ent.get("current_end"))

    row = Subscription(
        user_id=user.id,
        razorpay_subscription_id=sub_id,
        razorpay_customer_id=customer_id,
        plan_id=plan["plan_id"],
        plan_name=plan["name"],
        tier=plan["tier"],
        billing_period=plan["billing_period"],
        status="created",
        current_start=current_start,
        current_end=current_end,
        amount=int(plan["amount"]),
        currency="INR",
        payment_count=0,
    )
    db.add(row)
    db.flush()

    user.subscription_id = row.id
    user.subscription_status = "created"
    user.subscription_end_date = current_end
    db.add(user)
    db.commit()

    return {
        "subscription_id": sub_id,
        "key_id": settings.razorpay_api_key,
        "plan_name": plan["name"],
        "amount": plan["amount"],
        "currency": "INR",
    }


def _user_is_plus_tier(user: User) -> bool:
    return get_tier_str(user) == "plus"


@router.post("/addon/agent/subscribe")
async def subscribe_agent_addon(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    """Plus-only Agent Mode add-on. Persists Subscription row for verify/webhook flow."""
    _enforce_payment_rate_limit(user.id)
    _ = request  # reserved for future client-IP / audit logging
    # Temporary debug — remove after confirming tier/plan issues in production logs
    logger.info(
        "Addon subscribe: user %s tier=%r raw_type=%s",
        user.id,
        user.tier,
        type(user.tier).__name__,
    )

    if not _user_is_plus_tier(user):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent add-on is only available for Plus plan users",
        )
    if getattr(user, "agent_addon_active", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent add-on is already active on your account",
        )
    if getattr(user, "agent_addon_cancelling", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add-on is scheduled to cancel; use reactivate or wait until it ends.",
        )

    settings = get_settings()
    plans = _plan_map(settings)
    plan = plans["agent_addon_monthly"]
    addon_plan_id = (plan.get("plan_id") or "").strip()
    # Temporary debug — remove after confirming tier/plan issues in production logs
    logger.debug("Addon plan ID from env: '%s'", addon_plan_id)
    if not addon_plan_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Agent add-on plan not configured. Contact support.",
        )

    client = _get_razorpay_client()
    customer_id = _ensure_razorpay_customer(client, db, user)
    total_count = 0

    try:
        rzp_sub = client.subscription.create(
            {
                "plan_id": addon_plan_id,
                "customer_id": customer_id,
                "customer_notify": 1,
                "quantity": 1,
                "total_count": total_count,
                "notes": {
                    "user_id": str(user.id),
                    "email": user.email,
                    "plan_key": "agent_addon_monthly",
                    "type": "agent_addon",
                },
            }
        )
    except Exception as exc:
        # Never surface Razorpay / SDK exception text to the client — it can
        # include plan ids, customer ids, request dumps, or internal errors.
        logger.exception("Addon subscribe error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not create add-on subscription. Please try again.",
        ) from exc

    sub_id = rzp_sub.get("id")
    if not sub_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not create add-on subscription. Please try again.",
        )

    ent = rzp_sub
    current_start = _razorpay_ts_to_naive_utc(ent.get("current_start"))
    current_end = _razorpay_ts_to_naive_utc(ent.get("current_end"))

    row = Subscription(
        user_id=user.id,
        razorpay_subscription_id=sub_id,
        razorpay_customer_id=customer_id,
        plan_id=addon_plan_id,
        plan_name=plan["name"],
        tier=plan["tier"],
        billing_period=plan["billing_period"],
        status="created",
        current_start=current_start,
        current_end=current_end,
        amount=int(plan["amount"]),
        currency="INR",
        payment_count=0,
    )
    db.add(row)
    db.commit()

    key = settings.razorpay_api_key
    return {
        "subscription_id": sub_id,
        "razorpay_key": key,
        "key_id": key,
        "plan_name": plan["name"],
        "amount": plan["amount"],
        "currency": "INR",
    }


@router.post("/addon/agent/cancel")
async def cancel_agent_addon(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    _enforce_payment_rate_limit(user.id)
    if not getattr(user, "agent_addon_active", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active add-on to cancel",
        )
    sid = getattr(user, "addon_subscription_id", None)
    if not sid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active add-on to cancel",
        )
    client = _get_razorpay_client()
    try:
        client.subscription.cancel(sid, {"cancel_at_cycle_end": True})
    except Exception as exc:
        logger.exception("Razorpay agent add-on cancel failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not cancel add-on. Please try again.",
        ) from exc

    user.agent_addon_active = False
    user.agent_addon_cancelling = True
    db.add(user)
    db.commit()

    return {
        "success": True,
        "message": "Add-on will cancel at period end",
    }


@router.post("/addon/agent/reactivate")
async def reactivate_agent_addon(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    _enforce_payment_rate_limit(user.id)
    if not getattr(user, "agent_addon_cancelling", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add-on is not scheduled for cancellation",
        )
    sid = getattr(user, "addon_subscription_id", None)
    if not sid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No add-on subscription to resume",
        )
    client = _get_razorpay_client()
    try:
        client.subscription.resume(sid, {"resume_at": "now"})
    except Exception as exc:
        logger.exception("Razorpay agent add-on resume failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reactivate add-on. Please try again.",
        ) from exc

    user.agent_addon_cancelling = False
    user.agent_addon_active = True
    db.add(user)
    db.commit()

    return {"success": True, "message": "Add-on reactivated"}


@router.post("/verify")
async def verify_payment(
    body: VerifyPaymentRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    _enforce_payment_rate_limit(user.id)
    settings = get_settings()
    if not settings.razorpay_key_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments are not configured",
        )

    message = f"{body.razorpay_payment_id}|{body.razorpay_subscription_id}"
    if not hmac_sha256_hex_equal(
        settings.razorpay_key_secret,
        message,
        body.razorpay_signature,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid signature",
        )

    row = (
        db.query(Subscription)
        .filter(Subscription.razorpay_subscription_id == body.razorpay_subscription_id)
        .first()
    )
    if not row or row.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found",
        )

    row.status = "authenticated"
    if get_tier_str(row) == "agent_addon":
        user.agent_addon_active = True
        user.agent_addon_cancelling = False
        user.addon_subscription_id = row.razorpay_subscription_id
        user.subscription_status = "authenticated"
        db.add(row)
        db.add(user)
        db.commit()
        db.refresh(user)
        return {
            "status": "success",
            "tier": _tier_label(user.tier),
            "message": "Agent add-on activated",
        }

    old_tier = user.tier
    user.tier = _tier_enum_from_label(row.tier)
    user.subscription_id = row.id
    user.subscription_status = "authenticated"
    user.subscription_end_date = row.current_end
    db.add(row)
    db.add(user)
    db.commit()
    db.refresh(user)

    _log_tier_change(
        user_id=user.id,
        old_tier=old_tier,
        new_tier=user.tier,
        trigger="verify_endpoint",
        subscription_id=row.razorpay_subscription_id,
    )

    return {
        "status": "success",
        "tier": _tier_label(user.tier),
        "message": "Subscription activated",
    }


def _subscription_entity_from_payload(payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    try:
        return payload["payload"]["subscription"]["entity"]
    except (KeyError, TypeError):
        return None


def _payment_entity_from_payload(payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    try:
        return payload["payload"]["payment"]["entity"]
    except (KeyError, TypeError):
        return None


def _apply_subscription_event(
    db: Session,
    entity: dict[str, Any],
    *,
    trigger: str,
) -> None:
    sub_id = entity.get("id")
    if not sub_id:
        return
    row = _find_subscription_by_rzp_id(db, sub_id)
    if not row:
        logger.warning("%s: no subscription found for %s", trigger, sub_id)
        return

    if get_tier_str(row) == "agent_addon":
        exp = (get_settings().razorpay_agent_addon_plan_id or "").strip()
        ent_plan = (entity.get("plan_id") or "").strip()
        if exp and ent_plan and ent_plan != exp:
            logger.warning(
                "%s: AGENT_ADDON plan_id mismatch entity=%s expected=%s",
                trigger,
                ent_plan,
                exp,
            )
            return
        _apply_agent_addon_subscription_event(db, row, entity, trigger=trigger)
        return

    row.status = "active"
    row.current_start = _razorpay_ts_to_naive_utc(entity.get("current_start")) or row.current_start
    row.current_end = _razorpay_ts_to_naive_utc(entity.get("current_end")) or row.current_end
    is_new_charge = False
    if trigger == "subscription.charged":
        prev_paid_count = int(row.payment_count or 0)
        new_paid_count = int(entity.get("paid_count", prev_paid_count + 1))
        # Razorpay delivers webhooks at least once, so the same charge event can
        # arrive multiple times. paid_count is monotonic and authoritative, so we
        # only treat a strictly higher value as a genuinely new charge — this keeps
        # loyalty accrual idempotent under redelivery and never regresses the count.
        is_new_charge = new_paid_count > prev_paid_count
        row.payment_count = max(new_paid_count, prev_paid_count)

    user = _activate_subscription_and_user(
        db,
        row,
        trigger=trigger,
        status_value="active",
    )
    if user and get_tier_str(row) == "pro":
        try:
            _cancel_agent_addon_if_active(db, user, _get_razorpay_client())
        except HTTPException:
            pass

    if trigger == "subscription.charged" and get_tier_str(row) == "pro":
        _loyalty_on_pro_monthly_charged(
            db, row, get_settings(), is_new_charge=is_new_charge
        )


@router.post("/webhook")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    settings = get_settings()
    raw_body = await request.body()

    try:
        sig_header = request.headers.get("X-Razorpay-Signature") or ""
        secret = (settings.razorpay_webhook_secret or "").encode()
        if not secret:
            # Never process unsigned webhooks. In production fail closed so a
            # missing secret is a loud misconfiguration (503) instead of a
            # silent 200 that looks healthy to operators and Razorpay dashboards.
            # Outside production return 200 so local/CI without billing secrets
            # is not hammered by retries, while still skipping all side effects.
            logger.error(
                "RAZORPAY_WEBHOOK_SECRET not set; refusing webhook processing"
            )
            if settings.is_production:
                raise HTTPException(
                    status_code=503,
                    detail="Webhook endpoint is not configured",
                )
            return JSONResponse(status_code=200, content={"status": "ok"})

        if not hmac_sha256_hex_equal(secret, raw_body, sig_header):
            logger.warning("Invalid Razorpay webhook signature")
            raise HTTPException(status_code=400, detail="Invalid signature")

        payload = json.loads(raw_body.decode("utf-8"))
        event = payload.get("event")

        if event == "subscription.activated":
            try:
                ent = _subscription_entity_from_payload(payload)
                if ent and ent.get("id"):
                    _apply_subscription_event(
                        db,
                        ent,
                        trigger="subscription.activated",
                    )
                    db.commit()
                else:
                    logger.warning("subscription.activated: no subscription entity in payload")
            except Exception as exc:
                logger.error("subscription.activated error: %s", exc)

        elif event == "subscription.charged":
            try:
                ent = _subscription_entity_from_payload(payload)
                if ent and ent.get("id"):
                    _apply_subscription_event(
                        db,
                        ent,
                        trigger="subscription.charged",
                    )
                    db.commit()
                else:
                    logger.warning("subscription.charged: no subscription entity in payload")
            except Exception as exc:
                logger.error("subscription.charged error: %s", exc)

        elif event == "subscription.halted":
            ent = _subscription_entity_from_payload(payload)
            if ent and ent.get("id"):
                row = (
                    db.query(Subscription)
                    .filter(Subscription.razorpay_subscription_id == ent["id"])
                    .first()
                )
                if row:
                    row.status = "halted"
                    db.add(row)
                    u = db.query(User).filter(User.id == row.user_id).first()
                    if u:
                        u.subscription_status = "halted"
                        db.add(u)
                    db.commit()

        elif event in ("subscription.cancelled", "subscription.completed"):
            ent = _subscription_entity_from_payload(payload)
            if ent and ent.get("id"):
                row = (
                    db.query(Subscription)
                    .filter(Subscription.razorpay_subscription_id == ent["id"])
                    .first()
                )
                if row:
                    row.status = "cancelled" if event == "subscription.cancelled" else "completed"
                    db.add(row)
                    u = db.query(User).filter(User.id == row.user_id).first()
                    if u and get_tier_str(row) == "agent_addon":
                        plan_id_ent = (ent.get("plan_id") or "").strip()
                        expected_addon = (get_settings().razorpay_agent_addon_plan_id or "").strip()
                        if expected_addon and plan_id_ent and plan_id_ent != expected_addon:
                            logger.warning(
                                "subscription.cancelled: addon plan_id mismatch entity=%s expected=%s",
                                plan_id_ent,
                                expected_addon,
                            )
                            db.commit()
                        else:
                            u.agent_addon_active = False
                            u.agent_addon_cancelling = False
                            u.addon_subscription_id = None
                            db.add(u)
                            db.commit()
                    elif u:
                        old_tier = u.tier
                        u.tier = UserTier.FREE
                        u.subscription_status = row.status
                        u.subscription_end_date = _razorpay_ts_to_naive_utc(
                            ent.get("current_end")
                        ) or row.current_end
                        db.add(u)
                        _log_tier_change(
                            user_id=u.id,
                            old_tier=old_tier,
                            new_tier=u.tier,
                            trigger="subscription.cancelled",
                            subscription_id=row.razorpay_subscription_id,
                        )
                        db.commit()

        elif event == "payment.captured":
            try:
                ent = _payment_entity_from_payload(payload)
                if ent:
                    payment_id = ent.get("id")
                    subscription_id = ent.get("subscription_id")

                    if payment_id and not subscription_id:
                        try:
                            razorpay_client = _get_razorpay_client()
                            payment_details = razorpay_client.payment.fetch(payment_id)
                            subscription_id = payment_details.get("subscription_id")
                            logger.info(
                                "payment.captured fetched sub_id: %s",
                                subscription_id,
                            )
                        except Exception as fetch_err:
                            logger.warning("Could not fetch payment details: %s", fetch_err)

                    logger.info(
                        "payment.captured id=%s subscription_id=%s",
                        payment_id,
                        subscription_id,
                    )

                    if subscription_id:
                        row = _find_subscription_by_rzp_id(db, subscription_id)
                        if row:
                            if get_tier_str(row) == "agent_addon":
                                _apply_agent_addon_subscription_event(
                                    db,
                                    row,
                                    ent if isinstance(ent, dict) else {},
                                    trigger="payment.captured",
                                )
                            else:
                                user = _activate_subscription_and_user(
                                    db,
                                    row,
                                    trigger="payment.captured",
                                    status_value="active",
                                )
                                if user and get_tier_str(row) == "pro":
                                    try:
                                        _cancel_agent_addon_if_active(
                                            db, user, _get_razorpay_client()
                                        )
                                    except HTTPException:
                                        pass
                            db.commit()
                        else:
                            logger.warning("payment.captured: no subscription found for %s", subscription_id)
            except Exception as exc:
                logger.error("payment.captured handler error: %s", exc)

        elif event == "payment.failed":
            ent = _payment_entity_from_payload(payload)
            if ent:
                logger.info(
                    "payment.failed id=%s subscription_id=%s",
                    ent.get("id"),
                    ent.get("subscription_id"),
                )
                subscription_id = ent.get("subscription_id")
                if subscription_id:
                    user = db.query(User).filter(
                        User.subscription_id == subscription_id
                    ).first()
                    if user:
                        user.subscription_status = "failed"
                        db.commit()
                        logger.info(
                            "Payment failed for user %s, status updated",
                            user.id
                        )

    except HTTPException:
        raise
    except Exception:
        logger.exception("Webhook handler error")

    return JSONResponse(status_code=200, content={"status": "ok"})


@router.get("/subscription")
async def get_subscription_status(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    _enforce_payment_rate_limit(user.id)
    tier_val = user.tier.value if hasattr(user.tier, "value") else str(user.tier)

    row: Optional[Subscription] = None
    if user.subscription_id:
        row = db.query(Subscription).filter(Subscription.id == user.subscription_id).first()
    if row is None:
        row = (
            db.query(Subscription)
            .filter(Subscription.user_id == user.id)
            .order_by(Subscription.id.desc())
            .first()
        )

    if not row:
        return {"has_subscription": False, "tier": tier_val}

    if row.status in ("completed", "expired"):
        return {"has_subscription": False, "tier": tier_val}

    has_sub = row.status in (
        "created",
        "authenticated",
        "active",
        "halted",
        "cancelled",
    )

    if not has_sub:
        return {"has_subscription": False, "tier": tier_val}

    current_end_iso = row.current_end.isoformat() if row.current_end else None

    return {
        "has_subscription": True,
        "tier": tier_val,
        "plan_name": row.plan_name,
        "status": row.status,
        "billing_period": row.billing_period,
        "amount": row.amount,
        "currency": row.currency,
        "current_end": current_end_iso,
        "payment_count": row.payment_count,
        "razorpay_subscription_id": row.razorpay_subscription_id,
    }


@router.post("/cancel")
async def cancel_subscription(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    _enforce_payment_rate_limit(user.id)
    row: Optional[Subscription] = None
    if user.subscription_id:
        row = db.query(Subscription).filter(Subscription.id == user.subscription_id).first()
    if row is None:
        row = (
            db.query(Subscription)
            .filter(Subscription.user_id == user.id)
            .order_by(Subscription.id.desc())
            .first()
        )

    if not row or row.status not in ("active", "authenticated", "created"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active subscription found",
        )

    client = _get_razorpay_client()
    try:
        client.subscription.cancel(
            row.razorpay_subscription_id,
            {"cancel_at_cycle_end": True},
        )
    except Exception as exc:
        logger.exception("Razorpay subscription cancel failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not cancel subscription. Please try again.",
        ) from exc

    row.status = "cancelled"
    user.subscription_status = "cancelled"
    db.add(row)
    db.add(user)
    db.commit()

    access_until = row.current_end.isoformat() if row.current_end else ""

    return {
        "status": "cancelled",
        "message": (
            "Subscription cancelled. You will retain access until end of current billing period."
        ),
        "access_until": access_until,
    }


# ──────────────────────────────────────────────────────────────
# Plans catalog (public, no auth) — drives the pricing page
# ──────────────────────────────────────────────────────────────


@router.get("/plans")
async def list_plans() -> dict:
    """Public plans catalog for the pricing page. No auth required —
    anyone (including logged-out visitors) can see what we sell and at
    what price. Amounts are in paise (smallest currency unit) so the
    client formats them; we don't round-trip currency conversion here.

    Two layers of response shape: `plans` (the buyable list) plus a
    per-tier `feature_highlights` block so the pricing page can render
    checkmarks without a second roundtrip.
    """
    settings = get_settings()
    plans = _plan_map(settings)
    items = []
    for key, p in plans.items():
        # Skip plans whose Razorpay id isn't configured — surfacing an
        # unconfigured plan as a 'buy' button would 502 at checkout.
        if not p.get("plan_id"):
            continue
        items.append({
            "id": key,
            "plan_id": p["plan_id"],
            "name": p["name"],
            "tier": p["tier"],
            "billing_period": p["billing_period"],
            "amount": p["amount"],
            "currency": "INR",
        })
    # Stable order by tier then billing period so the pricing page
    # doesn't shuffle between fetches.
    items.sort(key=lambda p: (p["tier"], 0 if p["billing_period"] == "monthly" else 1))
    return {
        "plans": items,
        "total": len(items),
        "currency": "INR",
        "feature_highlights": PLAN_FEATURE_HIGHLIGHTS,
    }


# ──────────────────────────────────────────────────────────────
# Subscription history — paginated list of all subscriptions ever
# ──────────────────────────────────────────────────────────────


@router.get("/subscriptions/history")
async def subscription_history(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    tier: Optional[str] = Query(None, max_length=16, description="Filter by tier label."),
    status: Optional[str] = Query(None, max_length=32, description="Filter by Razorpay status."),
) -> dict:
    """Paginated history of all subscriptions ever created for the caller.

    Powers a 'Billing history' table on the account page. The single
    GET /subscription endpoint returns only the current row; this one
    is the full timeline (renewals, downgrades, cancellations, agent
    add-on toggles) so a user can answer 'when did I last renew?'.
    """
    _enforce_payment_rate_limit(user.id)

    q = db.query(Subscription).filter(Subscription.user_id == user.id)

    if tier:
        # Exact match — tier is a closed enum string.
        q = q.filter(Subscription.tier == tier)

    if status:
        q = q.filter(Subscription.status == status)

    total = q.count()
    rows = (
        q.order_by(Subscription.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    items = [
        {
            "id": row.id,
            "tier": row.tier,
            "plan_name": row.plan_name,
            "billing_period": row.billing_period,
            "status": row.status,
            "amount": row.amount,
            "currency": row.currency,
            "payment_count": row.payment_count,
            "current_start": row.current_start.isoformat() if row.current_start else None,
            "current_end": row.current_end.isoformat() if row.current_end else None,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in rows
    ]

    return {
        "subscriptions": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page if per_page else 0,
        "filters": {"tier": tier, "status": status},
    }
