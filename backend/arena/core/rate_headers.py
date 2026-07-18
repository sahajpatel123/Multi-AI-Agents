"""Rate-limit response headers — FastAPI dependency that decorates responses.

Usage in a route:
    from arena.core.rate_headers import rate_limit_headers
    @router.post("/prompt")
    async def submit_prompt(rl: dict = Depends(rate_limit_headers)):
        ...
        response.headers.update(rl)

The dependency reads the user's current message-count + token usage from the
DB and emits standard X-RateLimit-* headers. It does NOT enforce the limit —
that's still done by _check_rate_limit in the request handler.
"""

from __future__ import annotations

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required
from arena.core.cost_tracker import get_today_token_usage
from arena.core.tier_config import (
    TIER_DAILY_LIMITS,
    TIER_MESSAGE_LIMITS,
    UserTier,
    get_tier_str,
    normalize_tier,
)
from arena.database import get_db
from arena.models.schemas import UserResponse


async def rate_limit_headers(
    request: Request,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Return a dict of headers to attach to the response.

    - X-RateLimit-Limit-Messages: tier's daily message cap
    - X-RateLimit-Remaining-Messages: cap - count
    - X-RateLimit-Limit-Tokens: tier's daily token budget
    - X-RateLimit-Remaining-Tokens: budget - usage (UTC day)
    - X-RateLimit-Tier: normalised tier label
    """
    tier = normalize_tier(get_tier_str(user))

    # Pull fresh values off the DB so they're not stale in long-running processes.
    from arena.db_models import User

    db_user = db.query(User).filter(User.id == user.id).first()
    # Missing row (race after hard-delete) must still emit stable headers.
    messages_used = (
        int(getattr(db_user, "prompt_count_today", 0) or 0) if db_user is not None else 0
    )
    messages_limit = TIER_MESSAGE_LIMITS.get(tier, TIER_MESSAGE_LIMITS[UserTier.FREE])
    tokens_used = get_today_token_usage(db, user.id) if db_user is not None else 0
    tokens_limit = TIER_DAILY_LIMITS.get(tier, TIER_DAILY_LIMITS[UserTier.FREE])

    return {
        "X-RateLimit-Limit-Messages": str(messages_limit),
        "X-RateLimit-Remaining-Messages": str(max(messages_limit - messages_used, 0)),
        "X-RateLimit-Limit-Tokens": str(tokens_limit),
        "X-RateLimit-Remaining-Tokens": str(max(tokens_limit - tokens_used, 0)),
        "X-RateLimit-Tier": tier.value,
    }