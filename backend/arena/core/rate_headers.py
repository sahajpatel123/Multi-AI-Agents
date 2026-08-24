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

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required
from arena.core.cost_tracker import RateLimitExceeded, get_today_token_usage
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


def rate_limit_429(e: RateLimitExceeded) -> HTTPException:
    """Build the canonical 429 for an exceeded daily message limit.

    Mirrors the sliding-window limiter's contract (rate_limits.py): when the
    moment the limit lifts is known, the ``Retry-After`` header and the body's
    ``retry_after_seconds`` carry the same number, and ``resets_at`` names the
    instant in UTC. When it isn't known (token budgets, missing reset), neither
    appears — an absent field is the honest answer, not a guessed one.

    Every route that catches RateLimitExceeded must raise this so all five
    surfaces (prompt, debate ×2, discuss ×2) refuse identically.
    """
    detail = {
        "error": "rate_limit_exceeded",
        "message": e.message,
        "tier": e.tier,
        "prompts_used": e.used,
        "daily_limit": e.limit,
        "scope": e.scope,
    }
    headers: dict[str, str] = {}
    retry_after = e.retry_after_seconds
    if retry_after is not None:
        # Keep the body and HTTP header identical. A stale reset can produce
        # zero from the countdown property, but clients need a positive
        # backoff value and existing limiters use the same one-second floor.
        retry_after = max(1, retry_after)
        detail["resets_at"] = e.reset_at
        detail["retry_after_seconds"] = retry_after
        # Retry-After is seconds-from-now; a just-passed reset still needs a
        # positive value or some clients treat the header as malformed.
        headers["Retry-After"] = str(retry_after)
    return HTTPException(status_code=429, detail=detail, headers=headers or None)
