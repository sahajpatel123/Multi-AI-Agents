"""Pro tier rolling window rate limiter"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.db_models import UsageRecord


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def check_pro_window_limit(db: Session, user_id: int) -> Optional[dict]:
    """
    Check Pro user against rolling window limit.
    Returns error dict if limit exceeded, None if OK.
    """
    settings = get_settings()
    window_hours = settings.pro_window_hours
    window_limit = settings.pro_window_messages
    now = _now_utc()
    window_start = now - timedelta(hours=window_hours)
    
    recent_count = db.query(UsageRecord).filter(
        UsageRecord.user_id == user_id,
        UsageRecord.timestamp >= window_start
    ).count()
    
    if recent_count >= window_limit:
        oldest = db.query(UsageRecord).filter(
            UsageRecord.user_id == user_id,
            UsageRecord.timestamp >= window_start
        ).order_by(UsageRecord.timestamp.asc()).first()
        
        reset_time = oldest.timestamp + timedelta(hours=window_hours) if oldest else now + timedelta(hours=window_hours)
        
        return {
            "error": "rate_limit_exceeded",
            "message": f"You have reached the limit of {window_limit} messages per {window_hours} hours. Your window resets at {reset_time.strftime('%I:%M %p UTC')}.",
            "limit": window_limit,
            "window_hours": window_hours,
            "reset_at": reset_time.isoformat(),
            "current_count": recent_count
        }
    
    return None
