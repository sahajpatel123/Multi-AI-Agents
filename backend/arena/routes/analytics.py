"""Analytics and UX tracking routes."""

from collections import Counter, defaultdict
from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from arena.core.admin_gate import require_admin_email
from arena.core.dependencies import get_current_user_optional, get_current_user_required
from arena.core.input_validation import sanitize_model_optional_text, sanitize_model_text
from arena.core.model_router import get_all_routes_summary
from arena.core.observability import log_ux_event
from arena.core.rate_limits import enforce_ip_rate_limit, enforce_user_rate_limit
from arena.database import get_db
from arena.db_models import PersonaDriftLog, SavedResponse, ScoringAudit, SessionSummary, UsageRecord, UXEvent, UserPreference
from arena.models.schemas import UserResponse

router = APIRouter(tags=["analytics"])

VALID_EVENT_TYPES = {
    "card_click",
    "deeper_opened",
    "debate_started",
    "discuss_started",
    "response_liked",
    "response_disliked",
    "response_saved",
    "response_shared",
    "response_copied",
    "leaderboard_viewed",
    "personas_viewed",
    "persona_swapped",
    "panel_saved",
    "new_chat_clicked",
}


class UXEventRequest(BaseModel):
    session_id: str
    event_type: str
    persona_id: str | None = None
    agent_id: str | None = None
    metadata: dict | None = None

    @field_validator("session_id", "event_type")
    @classmethod
    def validate_required_text(cls, v: str, info) -> str:
        return sanitize_model_text(v, max_length=100, field_name=info.field_name)

    @field_validator("persona_id", "agent_id")
    @classmethod
    def validate_optional_text(cls, v: str | None, info) -> str | None:
        return sanitize_model_optional_text(v, max_length=100, field_name=info.field_name)

    @field_validator("metadata")
    @classmethod
    def validate_metadata(cls, v: dict | None) -> dict | None:
        # This endpoint is anonymous-writable, so bound the free-form metadata
        # blob explicitly instead of relying only on the 10KB request-body cap:
        # cap key count and serialized size so callers can't bloat the uxevents
        # table with large or pathological payloads.
        if v is None:
            return None
        if not isinstance(v, dict):
            raise ValueError("metadata must be an object")
        if len(v) > 30:
            raise ValueError("metadata has too many keys (max 30)")
        import json

        try:
            serialized = json.dumps(v, default=str)
        except (TypeError, ValueError) as exc:
            raise ValueError("metadata is not JSON-serializable") from exc
        if len(serialized) > 4000:
            raise ValueError("metadata is too large (max 4000 chars)")
        return v


@router.post("/analytics/event")
async def track_event(
    request: Request,
    body: UXEventRequest,
    db: Session = Depends(get_db),
    user: UserResponse | None = Depends(get_current_user_optional),
) -> dict:
    # Anonymous-writable surface — bound write volume so a single IP cannot
    # fill the UXEvent table (cost / disk amplification).
    enforce_ip_rate_limit(
        request,
        scope="analytics_event",
        limit=120,
        window_seconds=60,
        message="Too many analytics events from this IP. Please slow down.",
    )
    if body.event_type not in VALID_EVENT_TYPES:
        raise HTTPException(status_code=422, detail={"error": "validation_error", "message": "Invalid event_type"})
    try:
        await log_ux_event(
            session_id=body.session_id,
            event_type=body.event_type,
            user_id=user.id if user else None,
            persona_id=body.persona_id,
            agent_id=body.agent_id,
            metadata=body.metadata,
            db=db,
        )
    except Exception:
        pass
    return {"status": "tracked"}


@router.get("/analytics/summary")
async def analytics_summary(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    # Full-history aggregation across several tables — bound call volume so a
    # single account cannot use this as a cheap DB-amplification DoS.
    enforce_user_rate_limit(
        user.id,
        scope="analytics_summary",
        limit=60,
        window_seconds=3600,
        message="Too many analytics summary requests. Limit is 60 per hour.",
    )
    user_id = user.id
    preference = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    scoring_rows = db.query(ScoringAudit).filter(ScoringAudit.user_id == user.id).all()
    event_rows = db.query(UXEvent).filter(UXEvent.user_id == user.id).all()
    summary_rows = db.query(SessionSummary).filter(SessionSummary.user_id == user.id).all()
    drift_rows = db.query(PersonaDriftLog).filter(PersonaDriftLog.user_id == user.id).all()
    saved_count = db.query(SavedResponse).filter(SavedResponse.user_id == user.id).count()

    persona_wins = Counter(row.winner_persona_id for row in scoring_rows if row.winner_persona_id)
    event_counts = Counter(row.event_type for row in event_rows)
    topic_counts = Counter()
    for row in summary_rows:
        for topic in row.main_topics or []:
            topic_counts[topic] += 1

    persona_engagement: dict[str, dict[str, int]] = defaultdict(lambda: {"deeper_opened": 0, "liked": 0, "saved": 0, "debated": 0})
    for row in event_rows:
        if not row.persona_id:
            continue
        if row.event_type == "deeper_opened":
            persona_engagement[row.persona_id]["deeper_opened"] += 1
        if row.event_type == "response_liked":
            persona_engagement[row.persona_id]["liked"] += 1
        if row.event_type == "response_saved":
            persona_engagement[row.persona_id]["saved"] += 1
        if row.event_type == "debate_started":
            persona_engagement[row.persona_id]["debated"] += 1

    # Count from usage_records instead of user_preferences
    total_prompts = db.query(func.count(UsageRecord.id)).filter(
        UsageRecord.user_id == user_id
    ).scalar() or 0

    total_debates = db.query(func.count(UsageRecord.id)).filter(
        UsageRecord.user_id == user_id,
        UsageRecord.mode == 'debate'
    ).scalar() or 0

    total_discusses = db.query(func.count(UsageRecord.id)).filter(
        UsageRecord.user_id == user_id,
        UsageRecord.mode == 'discuss'
    ).scalar() or 0

    # Calculate avg_session_prompts from usage_records
    distinct_sessions = db.query(func.count(func.distinct(UsageRecord.session_id))).filter(
        UsageRecord.user_id == user_id
    ).scalar() or 1

    avg_session_prompts = round(total_prompts / max(distinct_sessions, 1), 1)

    avg_winning_score = 0.0
    if scoring_rows:
        avg_winning_score = sum(row.winner_score for row in scoring_rows) / len(scoring_rows)

    drift_rate = 0.0
    if drift_rows:
        drift_rate = sum(1 for row in drift_rows if row.drift_detected) / len(drift_rows)

    return {
        "total_prompts": int(total_prompts),
        "total_debates": int(total_debates),
        "total_discusses": int(total_discusses),
        "total_saved": saved_count,
        "persona_wins": dict(persona_wins),
        "top_persona_by_wins": persona_wins.most_common(1)[0][0] if persona_wins else None,
        "most_used_event": event_counts.most_common(1)[0][0] if event_counts else None,
        "avg_session_prompts": round(avg_session_prompts, 1),
        "topic_distribution": [{"topic": topic, "count": count} for topic, count in topic_counts.most_common(10)],
        "persona_engagement": dict(persona_engagement),
        "avg_winning_score": round(avg_winning_score, 1),
        "drift_rate": round(drift_rate, 2),
    }


@router.get("/analytics/activity")
async def analytics_activity(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    days: int = Query(30, ge=1, le=366, description="Window length in days, ending today (UTC)."),
) -> dict:
    """GitHub-style activity timeline with streak metrics.

    Returns one bucket per UTC calendar day for the trailing ``days`` window
    (inclusive of today), plus aggregate counters split by arena mode and the
    user's current/longest consecutive-day streak.

    Bounded the same way as :func:`analytics_summary` so this can't be used as
    a DB-amplification surface: window length is capped, the row scan is
    restricted to two indexed columns, and the user-scoped rate limit is
    shared across analytics endpoints.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_activity",
        limit=60,
        window_seconds=3600,
        message="Too many analytics activity requests. Limit is 60 per hour.",
    )

    # _now() in db_models stores naive UTC, so we anchor the window in UTC
    # too — using local time here would mis-bucket events near day boundaries
    # for any user not on UTC.
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    end_day = now_utc.date()
    start_day = end_day - timedelta(days=days - 1)
    start_dt = datetime.combine(start_day, time.min)
    # Exclusive upper bound: anything timestamped after this belongs to
    # tomorrow's bucket and is correctly excluded from this window.
    end_dt = datetime.combine(end_day + timedelta(days=1), time.min)

    rows = (
        db.query(UsageRecord.timestamp, UsageRecord.mode)
        .filter(
            UsageRecord.user_id == user.id,
            UsageRecord.timestamp >= start_dt,
            UsageRecord.timestamp < end_dt,
        )
        .all()
    )

    # Per-day counters, keyed by ISO date string so the response is
    # JSON-native without a second normalization pass.
    daily: dict[str, dict[str, int]] = defaultdict(
        lambda: {"prompts": 0, "debates": 0, "discusses": 0, "agent_runs": 0}
    )
    for ts, mode in rows:
        bucket = daily[ts.date().isoformat()]
        if mode == "debate":
            bucket["debates"] += 1
        elif mode == "discuss":
            bucket["discusses"] += 1
        elif mode == "agent":
            bucket["agent_runs"] += 1
        else:
            # arena and any future modes count as a "prompt" for streak
            # purposes — a user shouldn't lose their streak because we shipped
            # a new mode and didn't classify it.
            bucket["prompts"] += 1

    activity = [
        {
            "date": (start_day + timedelta(days=offset)).isoformat(),
            "prompts": daily[(start_day + timedelta(days=offset)).isoformat()]["prompts"],
            "debates": daily[(start_day + timedelta(days=offset)).isoformat()]["debates"],
            "discusses": daily[(start_day + timedelta(days=offset)).isoformat()]["discusses"],
            "agent_runs": daily[(start_day + timedelta(days=offset)).isoformat()]["agent_runs"],
        }
        for offset in range(days)
    ]

    # "Active day" = at least one of any kind. Counting only arena prompts
    # would under-report engagement for users who exclusively use agent mode.
    # Sum only the counter fields — "date" is a string and would crash sum().
    counter_keys = ("prompts", "debates", "discusses", "agent_runs")
    active_dates = {
        (start_day + timedelta(days=offset))
        for offset in range(days)
        if sum(activity[offset][k] for k in counter_keys) > 0
    }

    # Current streak walks backwards from today. If today is empty we still
    # check whether yesterday started a streak — the user shouldn't see
    # "0 current streak" simply because they haven't chatted yet today.
    current_streak = 0
    cursor = end_day
    if cursor not in active_dates:
        cursor -= timedelta(days=1)
    while cursor in active_dates:
        current_streak += 1
        cursor -= timedelta(days=1)

    # Longest streak is the max run within the window. We deliberately don't
    # query beyond the window — a 366-day maximum prevents a multi-year scan
    # that would be cheap to abuse via the per-user rate limit.
    longest_streak = 0
    run = 0
    for offset in range(days):
        day = start_day + timedelta(days=offset)
        if day in active_dates:
            run += 1
            longest_streak = max(longest_streak, run)
        else:
            run = 0

    total_prompts = sum(b["prompts"] for b in activity)
    total_debates = sum(b["debates"] for b in activity)
    total_discusses = sum(b["discusses"] for b in activity)
    total_agent_runs = sum(b["agent_runs"] for b in activity)

    busiest_day = None
    busiest_count = 0
    for bucket in activity:
        day_total = sum(bucket[k] for k in counter_keys)
        if day_total > busiest_count:
            busiest_count = day_total
            busiest_day = bucket["date"]

    return {
        "window_days": days,
        "start_date": start_day.isoformat(),
        "end_date": end_day.isoformat(),
        "activity": activity,
        "totals": {
            "prompts": total_prompts,
            "debates": total_debates,
            "discusses": total_discusses,
            "agent_runs": total_agent_runs,
        },
        "active_days": len(active_dates),
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "busiest_day": busiest_day,
        "busiest_day_count": busiest_count,
    }


@router.get("/admin/routes")
async def admin_routes_summary(
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    # Use the shared admin gate so authorization is consistent across every
    # admin endpoint: it fails closed with 503 when ADMIN_EMAIL is unset and
    # 403 otherwise. The previous inline check did str(admin_email) on an unset
    # value, yielding the literal "none" — a footgun that only failed closed by
    # luck (no real account has the email "none").
    require_admin_email(user.email)
    return get_all_routes_summary()
