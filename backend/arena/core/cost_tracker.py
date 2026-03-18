"""Cost tracking — per-request token accounting and per-user daily limits"""

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.core.model_router import estimate_call_cost
from arena.core.tier_config import get_daily_limit, normalize_tier, upgrade_target
from arena.db_models import GuestRateLimit, User, UsageRecord

logger = logging.getLogger(__name__)

def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def estimate_cost(input_tokens: int, output_tokens: int, model_key: str = "claude_sonnet") -> float:
    """Return estimated USD cost for a set of token counts."""
    return estimate_call_cost(model_key=model_key, input_tokens=input_tokens, output_tokens=output_tokens)


# ─────────────────────────────────────────────────
# Per-request accumulator (passed through pipeline)
# ─────────────────────────────────────────────────

@dataclass
class RequestCostAccumulator:
    """Accumulates token usage across all LLM calls in a single request."""
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    input_tokens: int = 0
    output_tokens: int = 0
    cost_by_model_usd: float = 0.0

    def add(self, input_tokens: int, output_tokens: int, model_key: str = "claude_sonnet") -> None:
        self.input_tokens += input_tokens
        self.output_tokens += output_tokens
        self.cost_by_model_usd += estimate_call_cost(model_key=model_key, input_tokens=input_tokens, output_tokens=output_tokens)

    @property
    def estimated_cost_usd(self) -> float:
        return round(self.cost_by_model_usd or estimate_cost(self.input_tokens, self.output_tokens), 6)

    def to_dict(self) -> dict:
        return {
            "request_id": self.request_id,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "estimated_cost_usd": round(self.estimated_cost_usd, 6),
        }


# ─────────────────────────────────────────────────
# Rate limiting
# ─────────────────────────────────────────────────

class RateLimitExceeded(Exception):
    def __init__(self, message: str, tier: str, used: int, limit: int, reset_at: Optional[str] = None, window_hours: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.tier = tier
        self.used = used
        self.limit = limit
        self.reset_at = reset_at
        self.window_hours = window_hours


def _reset_if_new_day(reset_at: datetime) -> bool:
    """Return True if reset_at is from a previous UTC day."""
    now = _now_utc()
    return reset_at.date() < now.date()


def check_and_increment_guest(db: Session, ip: str) -> None:
    """
    Check guest rate limit. Increments counter.
    Raises RateLimitExceeded if over limit.
    
    Message counting rules:
    - User submits a prompt → agents respond = 1 message
    - User triggers debate mode = 1 message
    - User triggers 1-on-1 discuss mode reply = 1 message
    - Error responses do NOT count toward the limit
    - Toxicity rejections do NOT count toward the limit
    - Only successful responses count
    """
    limit = get_daily_limit("GUEST")

    record = db.query(GuestRateLimit).filter(GuestRateLimit.ip_address == ip).first()
    now = _now_utc()

    if record is None:
        record = GuestRateLimit(ip_address=ip, prompt_count_today=0, reset_at=now)
        db.add(record)
        db.flush()

    if _reset_if_new_day(record.reset_at):
        record.prompt_count_today = 0
        record.reset_at = now

    if record.prompt_count_today >= limit:
        raise RateLimitExceeded(
            message=(
                f"You've used your {limit} free messages today. "
                "Create an account or upgrade for more daily messages."
            ),
            tier="GUEST",
            used=record.prompt_count_today,
            limit=limit,
        )

    record.prompt_count_today += 1
    db.commit()


def check_and_increment_user(db: Session, user_id: int, user_tier: str) -> None:
    """
    Check registered/pro rate limit. Increments counter.
    Raises RateLimitExceeded if over limit.
    
    Message counting rules:
    - User submits a prompt → agents respond = 1 message
    - User triggers debate mode = 1 message
    - User triggers 1-on-1 discuss mode reply = 1 message
    - Error responses do NOT count toward the limit
    - Toxicity rejections do NOT count toward the limit
    - Only successful responses count
    """
    # Fetch fresh User instance from DB to avoid detached instance issues
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return

    normalized_tier = normalize_tier(user_tier or (user.tier.value if hasattr(user.tier, "value") else str(user.tier)))
    limit = get_daily_limit(normalized_tier)
    now = _now_utc()

    if _reset_if_new_day(user.prompt_count_reset_at):
        user.prompt_count_today = 0
        user.prompt_count_reset_at = now

    if user.prompt_count_today >= limit:
        upgrade_to = upgrade_target(normalized_tier)
        raise RateLimitExceeded(
            message=(
                f"You've reached your {limit} daily messages. "
                f"{'Upgrade to ' + upgrade_to.capitalize() + ' for more access.' if upgrade_to else 'Please try again tomorrow.'}"
            ),
            tier=normalized_tier.value,
            used=user.prompt_count_today,
            limit=limit,
        )

    user.prompt_count_today += 1
    user.last_active = now
    db.commit()


# ─────────────────────────────────────────────────
# Persist usage record
# ─────────────────────────────────────────────────

def record_usage(
    db: Session,
    cost: RequestCostAccumulator,
    session_id: Optional[str] = None,
    user_id: Optional[int] = None,
    guest_ip: Optional[str] = None,
    prompt_category: Optional[str] = None,
    winner_agent_id: Optional[str] = None,
    persona_ids: Optional[list[str]] = None,
    panel_used: Optional[list[dict]] = None,
    mode: str = "arena",
    winning_persona_id: Optional[str] = None,
    total_processing_ms: int = 0,
) -> None:
    """Persist a usage record to the database."""
    try:
        record = UsageRecord(
            user_id=user_id,
            guest_ip=guest_ip,
            session_id=session_id,
            request_id=cost.request_id,
            input_tokens=cost.input_tokens,
            output_tokens=cost.output_tokens,
            estimated_cost_usd=cost.estimated_cost_usd,
            prompt_category=prompt_category,
            winner_agent_id=winner_agent_id,
            persona_ids=persona_ids,
            panel_used=panel_used,
            mode=mode,
            winning_persona_id=winning_persona_id,
            total_processing_ms=total_processing_ms,
            timestamp=_now_utc(),
        )
        db.add(record)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to record usage: {e}")
        db.rollback()


# ─────────────────────────────────────────────────
# Usage summary for the user dropdown
# ─────────────────────────────────────────────────

def get_user_usage_summary(db: Session, user: User) -> dict:
    """Return today's usage summary for display in the UI."""
    normalized_tier = normalize_tier(user.tier.value if hasattr(user.tier, "value") else str(user.tier))
    limit = get_daily_limit(normalized_tier)

    # Reset if stale
    if _reset_if_new_day(user.prompt_count_reset_at):
        count = 0
    else:
        count = user.prompt_count_today

    return {
        "prompts_used": count,
        "daily_limit": limit,
        "tier": normalized_tier.value,
    }
