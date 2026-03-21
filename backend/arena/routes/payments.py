"""Razorpay subscription payments — /api/payments/*"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.core.auth import (
    get_current_user_required_orm,
    set_auth_cookies_on_response,
)
from arena.database import get_db
from arena.db_models import Subscription, User, UserTier
from arena.models.schemas import SubscribePlanRequest, VerifyPaymentRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["payments"])


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
            "amount": 829900,
            "name": "Arena Plus Annual",
        },
        "pro_monthly": {
            "plan_id": settings.razorpay_pro_monthly_plan_id,
            "tier": "PRO",
            "billing_period": "monthly",
            "amount": 199900,
            "name": "Arena Pro Monthly",
        },
        "pro_annual": {
            "plan_id": settings.razorpay_pro_annual_plan_id,
            "tier": "PRO",
            "billing_period": "annual",
            "amount": 1659900,
            "name": "Arena Pro Annual",
        },
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


@router.post("/subscribe")
async def create_subscription(
    body: SubscribePlanRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
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

    total_count = 10 if plan["billing_period"] == "annual" else 120

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


@router.post("/verify")
async def verify_payment(
    body: VerifyPaymentRequest,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.razorpay_key_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments are not configured",
        )

    message = f"{body.razorpay_payment_id}|{body.razorpay_subscription_id}"
    expected = hmac.new(
        settings.razorpay_key_secret.encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, body.razorpay_signature):
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

    old_tier = user.tier
    row.status = "authenticated"
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
    set_auth_cookies_on_response(response, user)

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

    row.status = "active"
    row.current_start = _razorpay_ts_to_naive_utc(entity.get("current_start")) or row.current_start
    row.current_end = _razorpay_ts_to_naive_utc(entity.get("current_end")) or row.current_end
    if trigger == "subscription.charged":
        row.payment_count = int(entity.get("paid_count", int(row.payment_count or 0) + 1))

    _activate_subscription_and_user(
        db,
        row,
        trigger=trigger,
        status_value="active",
    )


@router.post("/webhook")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    settings = get_settings()
    raw_body = await request.body()

    try:
        sig_header = request.headers.get("X-Razorpay-Signature") or ""
        secret = (settings.razorpay_webhook_secret or "").encode()
        if not secret:
            logger.error("RAZORPAY_WEBHOOK_SECRET not set; ignoring webhook payload processing")
            return JSONResponse(status_code=200, content={"status": "ok"})

        expected_signature = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_signature, sig_header):
            logger.warning("Invalid Razorpay webhook signature")
            return JSONResponse(status_code=200, content={"status": "ok"})

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
                    if u:
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
                            _activate_subscription_and_user(
                                db,
                                row,
                                trigger="payment.captured",
                                status_value="active",
                            )
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

    except Exception:
        logger.exception("Webhook handler error")

    return JSONResponse(status_code=200, content={"status": "ok"})


@router.get("/subscription")
async def get_subscription_status(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required_orm),
) -> dict[str, Any]:
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
