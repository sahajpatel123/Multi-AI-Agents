"""Resume Razorpay subscriptions after Pro monthly loyalty free period."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import razorpay
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.database import SessionLocal
from arena.db_models import Subscription, User
from arena.core.datetime_utils import utcnow_naive

logger = logging.getLogger(__name__)


# Backoff ladder (in minutes) applied to consecutive failures. Cap at
# 24h so a permanently misconfigured Razorpay key never causes a tight
# retry storm once a transient outage clears.
_RETRY_BACKOFF_MINUTES = (5, 30, 120, 720, 1440)
_MAX_RETRY_BACKOFF_MINUTES = _RETRY_BACKOFF_MINUTES[-1]


def _get_razorpay_client() -> razorpay.Client:
    settings = get_settings()
    if not settings.razorpay_api_key or not settings.razorpay_key_secret:
        raise RuntimeError("Razorpay not configured")
    return razorpay.Client(auth=(settings.razorpay_api_key, settings.razorpay_key_secret))


def _next_retry_after(failures: int) -> datetime:
    """Return the next allowed attempt time based on prior failure count."""
    minutes = _RETRY_BACKOFF_MINUTES[min(failures, len(_RETRY_BACKOFF_MINUTES) - 1)]
    return utcnow_naive() + timedelta(minutes=minutes)


def _user_is_due(user: User, now: datetime) -> bool:
    """A user is due only when their resume time has passed AND any
    prior-failure backoff has elapsed. This keeps a transient Razorpay
    outage from immediately retrying a misconfigured subscription."""
    if not user.loyalty_resume_at or user.loyalty_resume_at > now:
        return False
    if user.loyalty_resume_next_attempt_at and user.loyalty_resume_next_attempt_at > now:
        return False
    return True


async def check_loyalty_resumes(db: Session) -> None:
    """Resume paused Pro subscriptions when loyalty free period ends.

    Per-user exception isolation: one user's Razorpay failure must not
    skip the rest of the queue. Failed attempts record
    ``loyalty_resume_attempts`` and back off; a successful resume resets
    all loyalty state to neutral.
    """
    now = utcnow_naive()
    due = (
        db.query(User)
        .filter(
            User.loyalty_reward_active.is_(True),
            User.loyalty_resume_at.isnot(None),
        )
        .all()
    )
    due = [user for user in due if _user_is_due(user, now)]
    if not due:
        return
    try:
        client = _get_razorpay_client()
    except Exception as exc:
        logger.warning("Loyalty resume skipped (Razorpay): %s", exc)
        return

    for user in due:
        sub_id = user.subscription_id
        row = (
            db.query(Subscription).filter(Subscription.id == sub_id).first()
            if sub_id
            else None
        )
        rzp_id = row.razorpay_subscription_id if row else None
        if not rzp_id:
            logger.warning("Loyalty resume: no razorpay id for user %s", user.id)
            user.loyalty_reward_active = False
            user.loyalty_free_months_remaining = 0
            user.loyalty_resume_at = None
            user.loyalty_resume_attempts = 0
            user.loyalty_resume_next_attempt_at = None
            try:
                db.add(user)
                db.commit()
            except Exception:
                db.rollback()
            continue
        try:
            client.subscription.resume(rzp_id, {"resume_at": "now"})
        except Exception as exc:
            user.loyalty_resume_attempts = (user.loyalty_resume_attempts or 0) + 1
            user.loyalty_resume_next_attempt_at = _next_retry_after(
                user.loyalty_resume_attempts
            )
            logger.warning(
                "Loyalty resume failed user=%s attempts=%s retry_at=%s err=%s",
                user.id,
                user.loyalty_resume_attempts,
                user.loyalty_resume_next_attempt_at,
                exc,
            )
            try:
                db.add(user)
                db.commit()
            except Exception:
                db.rollback()
            continue

        user.loyalty_reward_active = False
        user.loyalty_free_months_remaining = 0
        user.loyalty_resume_at = None
        user.loyalty_resume_attempts = 0
        user.loyalty_resume_next_attempt_at = None
        user.consecutive_payments = 0
        try:
            db.add(user)
            db.commit()
        except Exception as exc:
            logger.warning(
                "Loyalty resume: failed to persist success state for user=%s: %s",
                user.id,
                exc,
            )
            db.rollback()


async def schedule_loyalty_checks() -> None:
    """Hourly loyalty resume sweep. Runs in the background alongside the
    other app-level schedulers (live checks, watchlist, condura).
    """
    while True:
        await asyncio.sleep(3600)
        db = SessionLocal()
        try:
            await check_loyalty_resumes(db)
        except Exception:
            logger.exception("Loyalty scheduler sweep failed")
        finally:
            db.close()
