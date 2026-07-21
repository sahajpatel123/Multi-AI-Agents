"""Expire cancelled/completed subscriptions after the paid period ends.

POST /api/payments/cancel and the repaired ``subscription.cancelled``
webhook keep the user's paid tier until ``current_end``. This sweeper
is the deferred half of that contract: once the billed period is over,
downgrade primary tiers to FREE and clear agent-addon flags.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy.orm import Session

from arena.core.datetime_utils import utcnow_naive
from arena.database import SessionLocal
from arena.db_models import Subscription, User, UserTier
from arena.core.tier_config import get_tier_str

logger = logging.getLogger(__name__)

# How many users to process per sweep — keeps a single cycle bounded.
_BATCH_LIMIT = 100


def _log_tier_change(
    *,
    user_id: int,
    old_tier: object,
    new_tier: object,
    trigger: str,
    subscription_id: str | None,
) -> None:
    def _label(t: object) -> str:
        return t.value if hasattr(t, "value") else str(t)

    logger.info(
        "[TIER_CHANGE] user_id=%s old_tier=%s new_tier=%s trigger=%s subscription_id=%s",
        user_id,
        _label(old_tier),
        _label(new_tier),
        trigger,
        subscription_id,
    )


def expire_ended_subscriptions(db: Session, *, now=None) -> dict[str, int]:
    """Downgrade users whose cancelled/completed period has elapsed.

    Returns counts for observability: ``primary_downgraded``,
    ``addon_cleared``, ``examined``.
    """
    anchor = now or utcnow_naive()
    examined = 0
    primary_downgraded = 0
    addon_cleared = 0

    # Primary Plus/Pro: status cancelled/completed and end date passed,
    # still holding a paid tier.
    due_primary = (
        db.query(User)
        .filter(
            User.subscription_status.in_(("cancelled", "completed")),
            User.subscription_end_date.isnot(None),
            User.subscription_end_date <= anchor,
            User.tier.in_((UserTier.PLUS, UserTier.PRO)),
        )
        .order_by(User.subscription_end_date.asc())
        .limit(_BATCH_LIMIT)
        .all()
    )

    for user in due_primary:
        examined += 1
        try:
            old_tier = user.tier
            if get_tier_str(user) in ("free", "guest", ""):
                continue
            user.tier = UserTier.FREE
            db.add(user)
            rzp_id = None
            if user.subscription_id:
                row = (
                    db.query(Subscription)
                    .filter(Subscription.id == user.subscription_id)
                    .first()
                )
                if row:
                    rzp_id = row.razorpay_subscription_id
                    if row.status not in ("cancelled", "completed", "expired"):
                        row.status = "expired"
                        db.add(row)
            _log_tier_change(
                user_id=user.id,
                old_tier=old_tier,
                new_tier=user.tier,
                trigger="subscription_period_expired",
                subscription_id=rzp_id,
            )
            db.commit()
            primary_downgraded += 1
        except Exception:
            logger.exception(
                "subscription expiry: failed primary downgrade user_id=%s",
                user.id,
            )
            try:
                db.rollback()
            except Exception:
                logger.warning(
                    "subscription expiry: rollback failed after primary error",
                    exc_info=True,
                )

    # Agent add-on: cancelling flag set, linked sub period ended (or no
    # end date and status already terminal).
    due_addon = (
        db.query(User)
        .filter(User.agent_addon_cancelling.is_(True))
        .order_by(User.id.asc())
        .limit(_BATCH_LIMIT)
        .all()
    )
    for user in due_addon:
        examined += 1
        try:
            row = None
            if user.addon_subscription_id:
                row = (
                    db.query(Subscription)
                    .filter(
                        Subscription.razorpay_subscription_id
                        == user.addon_subscription_id
                    )
                    .first()
                )
            end = row.current_end if row else None
            status = (row.status if row else "") or ""
            period_over = end is not None and end <= anchor
            terminal_without_end = end is None and status in (
                "cancelled",
                "completed",
                "expired",
            )
            if not (period_over or terminal_without_end):
                continue
            user.agent_addon_active = False
            user.agent_addon_cancelling = False
            user.addon_subscription_id = None
            db.add(user)
            if row and row.status not in ("cancelled", "completed", "expired"):
                row.status = "expired"
                db.add(row)
            db.commit()
            addon_cleared += 1
            logger.info(
                "subscription expiry: cleared agent addon user_id=%s",
                user.id,
            )
        except Exception:
            logger.exception(
                "subscription expiry: failed addon clear user_id=%s",
                user.id,
            )
            try:
                db.rollback()
            except Exception:
                logger.warning(
                    "subscription expiry: rollback failed after addon error",
                    exc_info=True,
                )

    return {
        "examined": examined,
        "primary_downgraded": primary_downgraded,
        "addon_cleared": addon_cleared,
    }


async def check_subscription_expiries(db: Session) -> None:
    result = expire_ended_subscriptions(db)
    if result["primary_downgraded"] or result["addon_cleared"]:
        logger.info(
            "subscription expiry sweep: examined=%s primary_downgraded=%s addon_cleared=%s",
            result["examined"],
            result["primary_downgraded"],
            result["addon_cleared"],
        )


async def schedule_subscription_expiry_checks() -> None:
    """Hourly paid-period expiry sweep (alongside loyalty / live / watchlist)."""
    while True:
        await asyncio.sleep(3600)
        db = SessionLocal()
        try:
            await check_subscription_expiries(db)
        except Exception:
            logger.exception("Subscription expiry scheduler sweep failed")
        finally:
            db.close()
