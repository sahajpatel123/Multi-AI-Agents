"""Resume Razorpay subscriptions after Pro monthly loyalty free period."""

import logging
from datetime import datetime, timezone

import razorpay
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.database import SessionLocal
from arena.db_models import Subscription, User

logger = logging.getLogger(__name__)


def _get_razorpay_client() -> razorpay.Client:
    settings = get_settings()
    if not settings.razorpay_api_key or not settings.razorpay_key_secret:
        raise RuntimeError("Razorpay not configured")
    return razorpay.Client(auth=(settings.razorpay_api_key, settings.razorpay_key_secret))


async def check_loyalty_resumes(db: Session) -> None:
    """Resume paused Pro subscriptions when loyalty free period ends."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    due = (
        db.query(User)
        .filter(
            User.loyalty_reward_active.is_(True),
            User.loyalty_resume_at.isnot(None),
            User.loyalty_resume_at <= now,
        )
        .all()
    )
    if not due:
        return
    try:
        client = _get_razorpay_client()
    except Exception as e:
        logger.warning("Loyalty resume skipped (Razorpay): %s", e)
        return

    for user in due:
        sub_id = user.subscription_id
        row = db.query(Subscription).filter(Subscription.id == sub_id).first() if sub_id else None
        rzp_id = row.razorpay_subscription_id if row else None
        if not rzp_id:
            logger.warning("Loyalty resume: no razorpay id for user %s", user.id)
            continue
        try:
            client.subscription.resume(rzp_id, {"resume_at": "now"})
            user.loyalty_reward_active = False
            user.loyalty_free_months_remaining = 0
            user.loyalty_resume_at = None
            user.consecutive_payments = 0
            db.add(user)
            db.commit()
        except Exception as e:
            logger.warning("Loyalty resume failed user %s: %s", user.id, e)
            db.rollback()


async def schedule_loyalty_checks() -> None:
    import asyncio

    while True:
        await asyncio.sleep(3600)
        db = SessionLocal()
        try:
            await check_loyalty_resumes(db)
        except Exception as e:
            print(f"Loyalty scheduler error: {e}")
        finally:
            db.close()
