"""Analytics and UX tracking routes."""

import logging
from collections import Counter, defaultdict
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from arena.core.admin_gate import require_admin_email

logger = logging.getLogger(__name__)
from arena.core.dependencies import get_current_user_optional, get_current_user_required
from arena.core.input_validation import sanitize_model_optional_text, sanitize_model_text
from arena.core.model_router import get_all_routes_summary
from arena.core.observability import log_ux_event
from arena.core.rate_limits import enforce_ip_rate_limit, enforce_user_rate_limit
from arena.core.tier_config import get_tier_str, normalize_tier
from arena.database import get_db
from arena.core.datetime_utils import utcnow_naive
from arena.db_models import (
    PersonaDriftLog, SavedResponse, ScoringAudit, SessionSummary, UsageRecord, UserPreference, UXEvent, UserTier,
)
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


# Personas seated on a panel, as recorded in ScoringAudit.persona_ids_used.
# A pathological or corrupted row must not be able to inflate the win-rate
# denominators, so the panel is capped at a sane multiple of the real 4-slot
# panel rather than trusted as-is.
_MAX_PANEL_SIZE = 16


def _coerce_persona_panel(raw) -> list[str]:
    """Normalize a persisted ``persona_ids_used`` value into a list of ids.

    The column is JSON, but the concrete shape varies by write path and
    backend: SQLAlchemy's JSON type round-trips a real list on PostgreSQL,
    while some rows were written as a JSON *string* and come back needing a
    second decode. Anything that isn't a usable list of ids degrades to an
    empty list, which callers treat as "no denominator recorded" rather than
    guessing at a panel.
    """
    if raw is None:
        return []
    if isinstance(raw, str):
        import json

        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            return []
    if not isinstance(raw, (list, tuple)):
        return []
    panel = [str(item).strip() for item in raw if isinstance(item, str) and str(item).strip()]
    return panel[:_MAX_PANEL_SIZE]


class UXEventRequest(BaseModel):
    # All str fields are bounded at the Pydantic level
    # (max 100 chars). The field validators below still run
    # (and slice the trimmed value), so the per-field cap
    # is enforced at both the schema level (parse-time 422)
    # and the validator level (defense-in-depth). The
    # Pydantic cap closes the gap on this anonymous-writable
    # endpoint, where a 1MB string in any of these fields
    # would otherwise be accepted by Pydantic and amplified
    # through the validate_required_text / validate_optional_text
    # validators.
    session_id: str = Field(..., max_length=100)
    event_type: str = Field(..., max_length=100)
    persona_id: str | None = Field(default=None, max_length=100)
    agent_id: str | None = Field(default=None, max_length=100)
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
        logger.warning("Failed to log UX event", exc_info=True)
    return {"status": "tracked"}


@router.get("/analytics/summary")
async def analytics_summary(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        30,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC). Caps the heavy scans.",
    ),
    topic_limit: int = Query(
        10,
        ge=1,
        le=50,
        description="Max number of topics returned in topic_distribution.",
    ),
) -> dict:
    """Per-user analytics summary over a configurable window.

    Adds three things over the previous shape:

    - ?window_days=N (default 30, max 365): caps heavy full-history scans
      so a user with years of activity doesn't trigger a multi-second
      aggregation on every refresh. The cap also keeps the response
      payload bounded for the percentile / streak computations below.

    - engagement_rate: ratio of meaningful UX events (deeper_opened,
      liked, saved, debated) to total prompts. A user with 100 prompts
      and 5 engagement events has engagement_rate=0.05 — they browse but
      don't interact. The metric is intentionally a fraction in [0,1]
      so a dashboard can render it as a percentage without recomputing.

    - current_streak / longest_streak: consecutive days with at least
      one prompt, computed within the window. The window-cap also
      bounds the streak computation — a 365-day window can't return a
      streak longer than 365.

    Bound call volume so a single account cannot use this as a cheap
    DB-amplification DoS.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_summary",
        limit=60,
        window_seconds=3600,
        message="Too many analytics summary requests. Limit is 60 per hour.",
    )
    user_id = user.id

    # Anchor the window in UTC to match the naive-UTC timestamps written
    # by db_models._now(); using local time would mis-bucket events near
    # midnight for any user not on UTC.
    now_utc = utcnow_naive()
    window_start = now_utc - timedelta(days=window_days - 1)
    window_start_day = window_start.date()

    preference = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    scoring_rows = (
        db.query(ScoringAudit)
        .filter(
            ScoringAudit.user_id == user.id,
            ScoringAudit.created_at >= window_start,
        )
        .all()
    )
    event_rows = (
        db.query(UXEvent)
        .filter(
            UXEvent.user_id == user.id,
            UXEvent.created_at >= window_start,
        )
        .all()
    )
    summary_rows = (
        db.query(SessionSummary)
        .filter(
            SessionSummary.user_id == user.id,
            SessionSummary.compressed_at >= window_start,
        )
        .all()
    )
    drift_rows = (
        db.query(PersonaDriftLog)
        .filter(
            PersonaDriftLog.user_id == user.id,
            PersonaDriftLog.created_at >= window_start,
        )
        .all()
    )
    saved_count = (
        db.query(func.count(SavedResponse.id))
        .filter(
            SavedResponse.user_id == user.id,
            SavedResponse.saved_at >= window_start,
        )
        .scalar()
        or 0
    )

    persona_wins = Counter(row.winner_persona_id for row in scoring_rows if row.winner_persona_id)
    event_counts = Counter(row.event_type for row in event_rows)
    topic_counts = Counter()
    for row in summary_rows:
        for topic in row.main_topics or []:
            topic_counts[topic] += 1

    persona_engagement: dict[str, dict[str, int]] = defaultdict(lambda: {"deeper_opened": 0, "liked": 0, "saved": 0, "debated": 0})
    meaningful_events = 0
    for row in event_rows:
        if not row.persona_id:
            continue
        if row.event_type == "deeper_opened":
            persona_engagement[row.persona_id]["deeper_opened"] += 1
            meaningful_events += 1
        elif row.event_type == "response_liked":
            persona_engagement[row.persona_id]["liked"] += 1
            meaningful_events += 1
        elif row.event_type == "response_saved":
            persona_engagement[row.persona_id]["saved"] += 1
            meaningful_events += 1
        elif row.event_type == "debate_started":
            persona_engagement[row.persona_id]["debated"] += 1
            meaningful_events += 1

    # Count from usage_records filtered by window.
    total_prompts = db.query(func.count(UsageRecord.id)).filter(
        UsageRecord.user_id == user_id,
        UsageRecord.timestamp >= window_start,
    ).scalar() or 0

    total_debates = db.query(func.count(UsageRecord.id)).filter(
        UsageRecord.user_id == user_id,
        UsageRecord.mode == 'debate',
        UsageRecord.timestamp >= window_start,
    ).scalar() or 0

    total_discusses = db.query(func.count(UsageRecord.id)).filter(
        UsageRecord.user_id == user_id,
        UsageRecord.mode == 'discuss',
        UsageRecord.timestamp >= window_start,
    ).scalar() or 0

    # avg_session_prompts is computed within the window so a single
    # ancient session doesn't drag the average down forever.
    distinct_sessions = db.query(func.count(func.distinct(UsageRecord.session_id))).filter(
        UsageRecord.user_id == user_id,
        UsageRecord.timestamp >= window_start,
    ).scalar() or 1

    avg_session_prompts = round(int(total_prompts) / max(int(distinct_sessions), 1), 1)

    avg_winning_score = 0.0
    if scoring_rows:
        avg_winning_score = sum(row.winner_score for row in scoring_rows) / len(scoring_rows)

    drift_rate = 0.0
    if drift_rows:
        drift_rate = sum(1 for row in drift_rows if row.drift_detected) / len(drift_rows)

    # Engagement rate: meaningful UX events / total prompts. Capped at 1.0
    # in case a future event-type change breaks the denominator — never
    # want a UI percentage showing >100%.
    engagement_rate = (
        min(1.0, meaningful_events / int(total_prompts)) if int(total_prompts) > 0 else 0.0
    )

    # Streak math. Active days = days with at least one prompt in the
    # window. Pull only timestamps (the indexed column) to keep the
    # scan cheap. .with_entities() ensures we get scalar timestamps,
    # not Row objects — SQLAlchemy returns Row when there's >1 column
    # in the query, scalar otherwise.
    prompt_days = {
        row[0].date()
        for row in db.query(UsageRecord.timestamp)
        .filter(
            UsageRecord.user_id == user_id,
            UsageRecord.timestamp >= window_start,
        )
        .all()
        if row[0] is not None
    }

    # Current streak: walk back from today. If today is empty, give the
    # user a one-day grace and check yesterday — they shouldn't see a
    # zero streak just because they haven't chatted yet today.
    today = now_utc.date()
    current_streak = 0
    cursor = today
    if cursor not in prompt_days:
        cursor = cursor - timedelta(days=1)
    while cursor in prompt_days and cursor >= window_start_day:
        current_streak += 1
        cursor = cursor - timedelta(days=1)

    # Longest streak: max run within the window only — we deliberately
    # don't query beyond the window, so a 365-day window can return a
    # longest streak of at most 365.
    longest_streak = 0
    run = 0
    for offset in range(window_days):
        day = window_start_day + timedelta(days=offset)
        if day in prompt_days:
            run += 1
            longest_streak = max(longest_streak, run)
        else:
            run = 0

    return {
        "window_days": window_days,
        "window_start": window_start_day.isoformat(),
        "window_end": now_utc.date().isoformat(),
        "total_prompts": int(total_prompts),
        "total_debates": int(total_debates),
        "total_discusses": int(total_discusses),
        "total_saved": int(saved_count),
        "persona_wins": dict(persona_wins),
        "top_persona_by_wins": persona_wins.most_common(1)[0][0] if persona_wins else None,
        "most_used_event": event_counts.most_common(1)[0][0] if event_counts else None,
        "engagement_rate": round(engagement_rate, 3),
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "avg_session_prompts": avg_session_prompts,
        "topic_distribution": [
            {"topic": topic, "count": count}
            for topic, count in topic_counts.most_common(topic_limit)
        ],
        "persona_engagement": dict(persona_engagement),
        "avg_winning_score": round(avg_winning_score, 1),
        "drift_rate": round(drift_rate, 2),
    }


@router.get("/analytics/engagement")
async def analytics_engagement(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    days: int = Query(30, ge=1, le=366, description="Window length in days, ending today (UTC)."),
) -> dict:
    """Engagement metrics broken down by subscription tier.

    Returns engagement_rate (meaningful UX events / total prompts)
    and the supporting counts per tier over the window. Useful for
    the analytics dashboard's 'are paying users actually engaging
    deeper?' question — a free user with 100 prompts and 0 events
    has a different product story than a PRO user with 100 prompts
    and 0 events.

    All other rows from /analytics/summary compute a single
    engagement_rate for the caller; this endpoint exists to surface
    how engagement correlates with tier without exposing per-user
    data from other accounts.
    """
    # Caller-scoped — we don't aggregate across users here. The
    # dashboard wanting cross-user analytics should hit /metrics
    # (admin-only). This endpoint is for a single user to see
    # whether their engagement rate matches the rest of their tier.
    # Bound like summary/activity — multi-join aggregation is not free.
    enforce_user_rate_limit(
        user.id,
        scope="analytics_engagement",
        limit=60,
        window_seconds=3600,
        message="Too many analytics engagement requests. Limit is 60 per hour.",
    )
    from arena.db_models import User as UserModel

    now_utc = utcnow_naive()
    window_start = now_utc - timedelta(days=days - 1)

    # Caller's tier — used for the per-tier row that includes them.
    caller_tier = normalize_tier(get_tier_str(user))

    # Single SQL join so the per-tier breakdown is one query rather
    # than N queries. NULL user_id rows (guest IPs) bucket under
    # UserTier.GUEST.
    tier_rows = (
        db.query(
            func.coalesce(UserModel.tier, UserTier.GUEST).label("tier"),
            func.count(func.distinct(UsageRecord.id)).label("prompts"),
            func.count(func.distinct(UXEvent.id)).label("events"),
        )
        .outerjoin(UserModel, UsageRecord.user_id == UserModel.id)
        .outerjoin(
            UXEvent,
            (UXEvent.user_id == UsageRecord.user_id)
            & (UXEvent.created_at >= UsageRecord.timestamp - timedelta(minutes=5))
            & (UXEvent.created_at <= UsageRecord.timestamp + timedelta(minutes=5)),
        )
        .filter(UsageRecord.timestamp >= window_start)
        .group_by("tier")
        .all()
    )

    MEANINGFUL_EVENTS = {
        "deeper_opened", "response_liked", "response_saved", "debate_started",
    }

    # For each tier, compute meaningful_event_count and engagement_rate
    # in a second pass. The join above double-counts (one row per
    # prompt × event) so we normalize.
    by_tier: dict[str, dict[str, int | float]] = {}
    for row in tier_rows:
        tier_label = str(row.tier.value if hasattr(row.tier, "value") else row.tier)
        by_tier[tier_label] = {
            "prompts": int(row.prompts or 0),
            "meaningful_events": 0,
            "engagement_rate": 0.0,
        }

    # Now count meaningful events per tier — separate query so the
    # double-counting above doesn't pollute the rate.
    event_rows = (
        db.query(
            func.coalesce(UserModel.tier, UserTier.GUEST).label("tier"),
            func.count(UXEvent.id).label("event_count"),
        )
        .join(UserModel, UXEvent.user_id == UserModel.id)
        .filter(
            UXEvent.created_at >= window_start,
            UXEvent.event_type.in_(MEANINGFUL_EVENTS),
        )
        .group_by("tier")
        .all()
    )
    for row in event_rows:
        tier_label = str(row.tier.value if hasattr(row.tier, "value") else row.tier)
        if tier_label not in by_tier:
            by_tier[tier_label] = {
                "prompts": 0,
                "meaningful_events": 0,
                "engagement_rate": 0.0,
            }
        by_tier[tier_label]["meaningful_events"] = int(row.event_count or 0)

    # Compute rates.
    for tier_label, data in by_tier.items():
        if data["prompts"] > 0:
            data["engagement_rate"] = round(
                min(1.0, data["meaningful_events"] / data["prompts"]),
                3,
            )

    # Stable tier order so the dashboard doesn't shuffle.
    tier_order = ["FREE", "PLUS", "PRO", "GUEST", "AGENT_ADDON"]
    sorted_keys = [t for t in tier_order if t in by_tier] + [
        t for t in by_tier if t not in tier_order
    ]
    tiers_list = [{"tier": t, **by_tier[t]} for t in sorted_keys]

    return {
        "window_days": days,
        "window_start": window_start.date().isoformat(),
        "window_end": now_utc.date().isoformat(),
        "caller_tier": caller_tier.value if hasattr(caller_tier, "value") else str(caller_tier),
        "tiers": tiers_list,
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
    now_utc = utcnow_naive()
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


@router.get("/analytics/persona-win-rate")
async def analytics_persona_win_rate(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        90,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC).",
    ),
    min_appearances: int = Query(
        1,
        ge=1,
        le=1000,
        description="Drop personas that appeared on fewer than N panels.",
    ),
    include_fallback: bool = Query(
        False,
        description=(
            "Include exchanges where the scorer LLM failed and a fallback "
            "winner was assigned. Off by default — see the docstring."
        ),
    ),
) -> dict:
    """Per-persona win rate: wins divided by panel appearances.

    ``/analytics/summary`` already returns ``persona_wins``, but a raw win
    count is not comparable across personas — a persona that sat on 50 panels
    and won 10 is weaker than one that sat on 12 and won 9, yet the count
    ranks it higher. The denominator is what makes the number meaningful, and
    it was already being persisted: ``ScoringAudit.persona_ids_used`` records
    the full 4-persona panel for every scored exchange, and
    ``idx_scoring_audits_winner_persona`` was already indexed for exactly this
    read. This endpoint closes that gap.

    Honesty rules baked into the math:

    - **Fallback exchanges are excluded by default.** When the scorer LLM call
      fails, ``scorer.py`` assigns ``is_winner`` to whichever response happens
      to be at index 0 and gives everyone score=50. That is an arbitrary
      winner, not a judged one, so counting it would silently reward whichever
      persona occupies the first panel slot. Pass ``include_fallback=true`` to
      see the unfiltered numbers.

    - **Rows with no recorded panel cannot contribute a denominator.** Audit
      rows written before ``persona_ids_used`` was populated still carry a
      winner. Counting their win without their appearance would push win rates
      above 100%, so those rows are skipped entirely and reported separately as
      ``unattributed_exchanges`` rather than being quietly folded in.

    - **Small samples are flagged, not hidden.** A persona with 2 appearances
      and 2 wins is 100% and means nothing. Each row carries
      ``low_confidence`` (fewer than ``LOW_CONFIDENCE_APPEARANCES``
      appearances) so a dashboard can grey it out instead of celebrating noise.

    Scoped to the caller — this is "which minds win for *me*", not a global
    leaderboard. Bounded like the sibling analytics endpoints: capped window,
    two-column projection, and a per-user hourly limit.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_persona_win_rate",
        limit=60,
        window_seconds=3600,
        message="Too many persona win-rate requests. Limit is 60 per hour.",
    )

    from arena.core.agents import PERSONA_METADATA

    LOW_CONFIDENCE_APPEARANCES = 5

    now_utc = utcnow_naive()
    window_start_day = (now_utc - timedelta(days=window_days - 1)).date()
    window_start = datetime.combine(window_start_day, time.min)

    # Project only the three columns the math needs. Pulling whole ORM rows
    # here would load prompt snippets and score blobs for every exchange in a
    # year-long window purely to throw them away.
    rows = (
        db.query(
            ScoringAudit.winner_persona_id,
            ScoringAudit.persona_ids_used,
            ScoringAudit.fallback_used,
        )
        .filter(
            ScoringAudit.user_id == user.id,
            ScoringAudit.created_at >= window_start,
        )
        .all()
    )

    appearances: Counter = Counter()
    wins: Counter = Counter()
    scored_exchanges = 0
    unattributed_exchanges = 0
    fallback_exchanges = 0

    for winner_persona_id, persona_ids_used, fallback_used in rows:
        if fallback_used:
            fallback_exchanges += 1
            if not include_fallback:
                continue

        panel = _coerce_persona_panel(persona_ids_used)
        if not panel:
            # No denominator available — see the docstring. Count it so the
            # caller can see the gap instead of wondering why the totals
            # don't reconcile.
            unattributed_exchanges += 1
            continue

        scored_exchanges += 1
        # De-duplicate within a panel: a persona seated twice in one exchange
        # still only had one chance to win it.
        for persona_id in set(panel):
            appearances[persona_id] += 1
        if winner_persona_id and winner_persona_id in panel:
            wins[winner_persona_id] += 1

    personas = []
    for persona_id, appearance_count in appearances.items():
        if appearance_count < min_appearances:
            continue
        win_count = wins.get(persona_id, 0)
        metadata = PERSONA_METADATA.get(persona_id) or {}
        personas.append(
            {
                "persona_id": persona_id,
                "name": str(metadata.get("name") or persona_id),
                "color": str(metadata.get("color") or ""),
                "appearances": appearance_count,
                "wins": win_count,
                "win_rate": round(win_count / appearance_count, 3),
                "low_confidence": appearance_count < LOW_CONFIDENCE_APPEARANCES,
            }
        )

    # Deterministic ordering: strongest first, then the better-evidenced of two
    # equal rates, then persona_id so the list never shuffles between refreshes
    # for a tie the data can't break.
    personas.sort(key=lambda row: (-row["win_rate"], -row["appearances"], row["persona_id"]))

    # "Best" deliberately ignores low-confidence rows — surfacing a 1-of-1
    # persona as the user's strongest mind would be a lie dressed as a stat.
    confident = [row for row in personas if not row["low_confidence"]]
    best = confident[0] if confident else None

    return {
        "window_days": window_days,
        "window_start": window_start_day.isoformat(),
        "window_end": now_utc.date().isoformat(),
        "min_appearances": min_appearances,
        "include_fallback": include_fallback,
        "low_confidence_threshold": LOW_CONFIDENCE_APPEARANCES,
        "scored_exchanges": scored_exchanges,
        "unattributed_exchanges": unattributed_exchanges,
        "fallback_exchanges": fallback_exchanges,
        "personas": personas,
        "best_persona_id": best["persona_id"] if best else None,
        "best_win_rate": best["win_rate"] if best else None,
    }


@router.get("/analytics/persona-win-rate/export.csv")
async def analytics_persona_win_rate_csv(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        90,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC).",
    ),
    min_appearances: int = Query(
        1,
        ge=1,
        le=200,
        description="Drop personas that appeared on fewer than N panels.",
    ),
) -> Response:
    """CSV export of the persona win-rate table.

    Same computation as /analytics/persona-win-rate — reuses the route's
    shape rather than reimplementing it, so the export and the JSON
    response can never drift. CSV is the format dashboards + spreadsheets
    consume directly; the JSON endpoint remains the canonical shape for
    the web UI.

    Columns mirror the JSON personas[] rows in the same order:
      persona_id, name, appearances, wins, win_rate, low_confidence

    No pagination: the response is bounded by min_appearances (≥ 1) and
    by the 16-persona catalog, so the worst-case payload is one row per
    persona. Anyone exporting "all personas that ever appeared on a
    panel" will see at most 16 rows — well within CSV-row size limits
    even with naive Excel handling.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_persona_win_rate_csv",
        limit=60,
        window_seconds=3600,
        message="Too many persona win-rate export requests. Limit is 60 per hour.",
    )

    payload = await analytics_persona_win_rate(
        window_days=window_days,
        min_appearances=min_appearances,
        user=user,
        db=db,
    )

    import csv
    import io

    buf = io.StringIO()
    # RFC 4180 quoting + Excel-friendly \r\n line endings. The header row
    # is intentional — a downstream consumer should never have to guess
    # which column is which, and the column order is part of the contract.
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow(
        ["persona_id", "name", "appearances", "wins", "win_rate", "low_confidence"]
    )
    for row in payload["personas"]:
        writer.writerow(
            [
                row["persona_id"],
                row["name"],
                row["appearances"],
                row["wins"],
                row["win_rate"],
                "true" if row["low_confidence"] else "false",
            ]
        )

    filename = (
        f"arena-persona-win-rate-"
        f"{payload['window_start']}-to-{payload['window_end']}.csv"
    )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


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
