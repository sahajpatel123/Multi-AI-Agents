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
from arena.core.tier_config import get_tier_str, has_feature, normalize_tier
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


def _coerce_json_dict(raw) -> dict:
    """Normalize a JSON column that must be an object.

    The JSON columns on ScoringAudit are written by SQLAlchemy's JSON type,
    but corrupted or legacy rows can carry a JSON *string* that needs a
    second decode. Anything that isn't a usable mapping degrades to an empty
    dict rather than leaking into the response or crashing serialization.
    """
    if raw is None:
        return {}
    if isinstance(raw, str):
        import json

        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            return {}
    if not isinstance(raw, dict):
        return {}
    return raw


def _coerce_json_list(raw) -> list:
    """Normalize a JSON column that must be a list (see ``_coerce_json_dict``)."""
    if raw is None:
        return []
    if isinstance(raw, str):
        import json

        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            return []
    if not isinstance(raw, list):
        return []
    return raw


def _scoring_audit_allowed(user: UserResponse) -> bool:
    """Pro entitlement check for the per-round scoring audit.

    ``scoring_audit`` is Pro-only in the tier matrix. Plus users who bought
    the Agent add-on inherit the same audit entitlement (mirrors
    ``entitlements.py``), so the gate checks the add-on explicitly rather
    than relying only on the static tier lookup.
    """
    tier = normalize_tier(get_tier_str(user))
    if has_feature(tier, "scoring_audit"):
        return True
    if tier == UserTier.PLUS:
        return bool(
            getattr(user, "agent_addon_active", False)
            or getattr(user, "agent_addon_cancelling", False)
        )
    return False


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

    The dashboard endpoint owns the dashboard rate-limit budget. Export
    routes call the shared aggregation helper directly so downloading a
    report does not unexpectedly consume dashboard refresh capacity.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_summary",
        limit=60,
        window_seconds=3600,
        message="Too many analytics summary requests. Limit is 60 per hour.",
    )
    return _analytics_summary_payload(
        user=user,
        db=db,
        window_days=window_days,
        topic_limit=topic_limit,
    )


def _analytics_summary_payload(
    *,
    user: UserResponse,
    db: Session,
    window_days: int,
    topic_limit: int,
) -> dict:
    """Build the summary payload without applying a route-level throttle.

    ``analytics_summary`` and each export have separate user-scoped budgets,
    but all of them must return the same aggregation. Keeping the database
    work here prevents an export from calling the route handler and charging
    two rate-limit scopes for one request.

    The payload adds three things over the previous shape:

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

    The route-level rate limiter above bounds call volume so a single account
    cannot use this as a cheap DB-amplification DoS.
    """
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


@router.get("/analytics/summary/export.json")
async def analytics_summary_json(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        30,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC). Must match the JSON endpoint.",
    ),
    topic_limit: int = Query(
        10,
        ge=1,
        le=50,
        description="Max number of topics in the topic_distribution section.",
    ),
) -> Response:
    """Download the exact analytics summary payload as JSON.

    Reuses the summary aggregation so an archive or BI script receives the
    same metrics as /analytics/summary without scraping the UI. The export
    has its own user-scoped budget and no-store download headers.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_summary_json",
        limit=60,
        window_seconds=3600,
        message="Too many summary JSON exports. Please wait.",
    )

    payload = _analytics_summary_payload(
        window_days=window_days,
        topic_limit=topic_limit,
        user=user,
        db=db,
    )

    import json

    filename = (
        f"arena-summary-"
        f"{payload['window_start']}-to-{payload['window_end']}.json"
    )
    return Response(
        content=json.dumps(payload, indent=2, default=str),
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/analytics/summary/export.csv")
async def analytics_summary_csv(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        30,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC). Must match the JSON endpoint.",
    ),
    topic_limit: int = Query(
        10,
        ge=1,
        le=50,
        description="Max number of topics in the topic_distribution section.",
    ),
) -> Response:
    """CSV export of the analytics summary.

    Reuses the shared summary aggregation so the CSV and the API response
    cannot drift. Each metric becomes a row (metric, value) with
    persona_wins and topic_distribution as sub-rows.

    Follows the same defenses as the other CSV exports:
    rate-limit scoped, security headers, RFC 4180 quoting,
    and formula-injection defense via _csv_safe.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_summary_csv",
        limit=60,
        window_seconds=3600,
        message="Too many summary CSV exports. Limit is 60 per hour.",
    )

    payload = _analytics_summary_payload(
        window_days=window_days,
        topic_limit=topic_limit,
        user=user,
        db=db,
    )

    import csv
    import io

    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow(["metric", "value"])

    # Top-level scalar metrics
    scalar_metrics = [
        ("window_days", payload["window_days"]),
        ("window_start", payload["window_start"]),
        ("window_end", payload["window_end"]),
        ("total_prompts", payload["total_prompts"]),
        ("total_debates", payload["total_debates"]),
        ("total_discusses", payload["total_discusses"]),
        ("total_saved", payload["total_saved"]),
        ("top_persona_by_wins", payload["top_persona_by_wins"] or ""),
        ("most_used_event", payload["most_used_event"] or ""),
        ("engagement_rate", payload["engagement_rate"]),
        ("current_streak", payload["current_streak"]),
        ("longest_streak", payload["longest_streak"]),
        ("avg_session_prompts", payload["avg_session_prompts"]),
        ("avg_winning_score", payload["avg_winning_score"]),
        ("drift_rate", payload["drift_rate"]),
    ]
    for metric, value in scalar_metrics:
        writer.writerow([_csv_safe(metric), _csv_safe(value)])

    # Persona wins section
    for pid, wins in payload["persona_wins"].items():
        writer.writerow([_csv_safe(f"persona_wins:{pid}"), wins])

    # Topic distribution section
    for topic_entry in payload["topic_distribution"]:
        writer.writerow(
            [
                _csv_safe(f"topic:{topic_entry['topic']}"),
                topic_entry["count"],
            ]
        )

    # Footer rollup
    writer.writerow(
        [
            f"# total_prompts={payload['total_prompts']}",
            f"total_debates={payload['total_debates']}",
            f"total_discusses={payload['total_discusses']}",
            f"total_saved={payload['total_saved']}",
        ]
    )

    filename = (
        f"arena-summary-"
        f"{payload['window_start']}-to-{payload['window_end']}.csv"
    )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/analytics/summary/export.md")
async def analytics_summary_markdown(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        30,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC). Must match the JSON endpoint.",
    ),
    topic_limit: int = Query(
        10,
        ge=1,
        le=50,
        description="Max number of topics in the topic_distribution section.",
    ),
) -> Response:
    """Download the analytics summary as a portable Markdown report.

    The report is intended for notes, reviews, and issue trackers rather
    than spreadsheets. It reuses the shared summary aggregation so every
    scalar and breakdown stays aligned with the JSON and CSV exports.
    Markdown-controlled cells are escaped before being placed in tables, and
    the download has its own user-scoped rate-limit budget.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_summary_markdown",
        limit=60,
        window_seconds=3600,
        message="Too many summary Markdown exports. Please wait.",
    )

    payload = _analytics_summary_payload(
        window_days=window_days,
        topic_limit=topic_limit,
        user=user,
        db=db,
    )

    engagement_rate = payload["engagement_rate"]
    drift_rate = payload["drift_rate"]
    lines = [
        "# Arena — analytics summary",
        "",
        f"**Window:** {payload['window_start']} → {payload['window_end']} "
        f"({payload['window_days']} days, UTC)",
        "",
        "## Summary",
        "",
        f"- **Total prompts:** {payload['total_prompts']}",
        f"- **Total debates:** {payload['total_debates']}",
        f"- **Total discusses:** {payload['total_discusses']}",
        f"- **Total saved:** {payload['total_saved']}",
        f"- **Top persona by wins:** {_markdown_cell(payload['top_persona_by_wins'] or 'none')}",
        f"- **Most used event:** {_markdown_cell(payload['most_used_event'] or 'none')}",
        f"- **Engagement rate:** {round(engagement_rate * 100, 1)}% ({engagement_rate})",
        f"- **Current streak:** {payload['current_streak']} days",
        f"- **Longest streak:** {payload['longest_streak']} days",
        f"- **Average prompts per session:** {payload['avg_session_prompts']}",
        f"- **Average winning score:** {payload['avg_winning_score']}",
        f"- **Drift rate:** {round(drift_rate * 100, 1)}% ({drift_rate})",
        "",
        "## Persona wins",
        "",
        "| Persona | Wins |",
        "| --- | ---: |",
    ]
    if payload["persona_wins"]:
        for persona_id, wins in sorted(payload["persona_wins"].items()):
            lines.append(
                f"| {_markdown_cell(persona_id)} | {_markdown_cell(wins)} |"
            )
    else:
        lines.append("| _None recorded_ | 0 |")

    lines.extend(
        [
            "",
            "## Topic distribution",
            "",
            "| Topic | Count |",
            "| --- | ---: |",
        ]
    )
    if payload["topic_distribution"]:
        for topic in payload["topic_distribution"]:
            lines.append(
                f"| {_markdown_cell(topic['topic'])} | {_markdown_cell(topic['count'])} |"
            )
    else:
        lines.append("| _None recorded_ | 0 |")

    lines.extend(
        [
            "",
            "## Persona engagement",
            "",
            "| Persona | Deeper opened | Liked | Saved | Debated |",
            "| --- | ---: | ---: | ---: | ---: |",
        ]
    )
    if payload["persona_engagement"]:
        for persona_id, counts in sorted(payload["persona_engagement"].items()):
            lines.append(
                "| "
                + " | ".join(
                    [
                        _markdown_cell(persona_id),
                        _markdown_cell(counts["deeper_opened"]),
                        _markdown_cell(counts["liked"]),
                        _markdown_cell(counts["saved"]),
                        _markdown_cell(counts["debated"]),
                    ]
                )
                + " |"
            )
    else:
        lines.append("| _None recorded_ | 0 | 0 | 0 | 0 |")

    lines.extend(["", "---", "_Exported from Arena_", ""])
    filename = (
        f"arena-summary-"
        f"{payload['window_start']}-to-{payload['window_end']}.md"
    )
    return Response(
        content="\n".join(lines).strip() + "\n",
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


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


def _activity_timeline(db: Session, user_id: int, days: int) -> dict:
    """Compute the GitHub-style activity timeline for one user.

    Returns one bucket per UTC calendar day for the trailing ``days`` window
    (inclusive of today), plus aggregate counters split by arena mode and the
    user's current/longest consecutive-day streak.

    This is deliberately a plain helper rather than a callable route: the
    JSON and CSV endpoints share one aggregation so they cannot drift, while
    each route keeps its own user-scoped rate limit. The CSV export must not
    consume the JSON endpoint's hourly budget (and vice versa).

    Bounded the same way as :func:`analytics_summary` so this can't be used as
    a DB-amplification surface: window length is capped, the row scan is
    restricted to two indexed columns, and call volume is capped by the
    calling route's rate limit.
    """
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
            UsageRecord.user_id == user_id,
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
    restricted to two indexed columns, and call volume is capped by this
    route's user-scoped rate limit.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_activity",
        limit=60,
        window_seconds=3600,
        message="Too many analytics activity requests. Limit is 60 per hour.",
    )

    return _activity_timeline(db, user.id, days)


@router.get("/analytics/activity/export.csv")
async def analytics_activity_csv(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    days: int = Query(
        30,
        ge=1,
        le=366,
        description="Window length in days, ending today (UTC). Must match the JSON endpoint.",
    ),
) -> Response:
    """CSV export of the GitHub-style activity timeline.

    Shares the JSON endpoint's aggregation helper so the spreadsheet and
    the dashboard cannot drift. One row per UTC calendar day with the same
    per-mode counters as the JSON endpoint, plus a footer rollup with the
    totals, streaks, and busiest-day summary so the file is self-describing
    when opened in isolation.

    Follows the same defenses as the other analytics exports: user-scoped
    rate limit, RFC 4180 quoting, no-store caching, nosniff, and
    formula-injection defense via _csv_safe.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_activity_csv",
        limit=60,
        window_seconds=3600,
        message="Too many activity CSV exports. Limit is 60 per hour.",
    )

    payload = _activity_timeline(db, user.id, days)

    import csv
    import io

    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow(["date", "prompts", "debates", "discusses", "agent_runs"])
    for row in payload["activity"]:
        # All values are server-computed, but route them through _csv_safe
        # anyway for defense-in-depth.
        writer.writerow(
            [
                _csv_safe(row["date"]),
                row["prompts"],
                row["debates"],
                row["discusses"],
                row["agent_runs"],
            ]
        )
    # Footer rollup so the file is self-describing when opened in
    # isolation. '#' prefix matches the de-facto CSV comment convention
    # (Excel, Sheets, and most BI tools skip these rows).
    writer.writerow(
        [
            f"# total_prompts={payload['totals']['prompts']}",
            f"total_debates={payload['totals']['debates']}",
            f"total_discusses={payload['totals']['discusses']}",
            f"total_agent_runs={payload['totals']['agent_runs']}",
            f"active_days={payload['active_days']}",
            f"current_streak={payload['current_streak']}",
            f"longest_streak={payload['longest_streak']}",
            f"busiest_day={payload['busiest_day'] or ''}",
            f"busiest_day_count={payload['busiest_day_count']}",
        ]
    )

    filename = (
        f"arena-activity-"
        f"{payload['start_date']}-to-{payload['end_date']}.csv"
    )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/analytics/activity/export.json")
async def analytics_activity_json(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    days: int = Query(
        30,
        ge=1,
        le=366,
        description="Window length in days, ending today (UTC).",
    ),
) -> Response:
    """JSON export of the GitHub-style activity timeline.

    Downloads the exact payload served by ``/analytics/activity`` so a BI
    pipeline or archival script gets the same per-day counters, totals,
    streaks, and busiest-day summary without reimplementing the aggregation.
    Keeps its own user-scoped rate limit so exporting JSON does not consume
    the dashboard or CSV export budgets.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_activity_json",
        limit=60,
        window_seconds=3600,
        message="Too many activity JSON exports. Limit is 60 per hour.",
    )

    payload = _activity_timeline(db, user.id, days)

    import json

    filename = (
        f"arena-activity-"
        f"{payload['start_date']}-to-{payload['end_date']}.json"
    )
    return Response(
        content=json.dumps(payload, indent=2, default=str),
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


def _markdown_cell(value) -> str:
    """Return ``value`` as a string safe to embed in a Markdown table cell.

    Defense-in-depth for the human-readable activity report. The current
    cells are server-generated ISO dates and integers, but a future user-
    or model-controlled field must not be able to break the table layout or
    smuggle Markdown into a downloaded report.
    """
    s = str(value)
    return s.replace("|", "\\|").replace("\r", " ").replace("\n", " ")


@router.get("/analytics/activity/export.md")
async def analytics_activity_markdown(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    days: int = Query(
        30,
        ge=1,
        le=366,
        description="Window length in days, ending today (UTC).",
    ),
) -> Response:
    """Markdown export of the GitHub-style activity timeline.

    Renders the same JSON aggregation as a human-readable report: summary
    metrics, streak/busiest-day facts, and a per-day table, so users can
    drop the timeline into notes, docs, or a changelog without opening a
    spreadsheet. Shares the aggregation helper with the CSV/JSON exports
    and keeps its own user-scoped rate limit so Markdown exports do not
    consume the dashboard or other export budgets.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_activity_markdown",
        limit=60,
        window_seconds=3600,
        message="Too many activity Markdown exports. Limit is 60 per hour.",
    )

    payload = _activity_timeline(db, user.id, days)
    totals = payload["totals"]

    lines = [
        "# Arena — activity timeline",
        "",
        f"**Window:** {payload['start_date']} → {payload['end_date']} "
        f"({payload['window_days']} days, UTC)",
        "",
        "## Summary",
        "",
        f"- **Prompts:** {totals['prompts']}",
        f"- **Debates:** {totals['debates']}",
        f"- **Discusses:** {totals['discusses']}",
        f"- **Agent runs:** {totals['agent_runs']}",
        f"- **Active days:** {payload['active_days']}",
        f"- **Current streak:** {payload['current_streak']}",
        f"- **Longest streak:** {payload['longest_streak']}",
        (
            f"- **Busiest day:** {payload['busiest_day'] or 'none'}"
            f" ({payload['busiest_day_count']} actions)"
        ),
        "",
        "## Daily activity",
        "",
        "| Date | Prompts | Debates | Discusses | Agent runs |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for row in payload["activity"]:
        lines.append(
            "| "
            + " | ".join(
                [
                    _markdown_cell(row["date"]),
                    _markdown_cell(row["prompts"]),
                    _markdown_cell(row["debates"]),
                    _markdown_cell(row["discusses"]),
                    _markdown_cell(row["agent_runs"]),
                ]
            )
            + " |"
        )
    lines.extend(["", "---", "_Exported from Arena_", ""])

    filename = (
        f"arena-activity-"
        f"{payload['start_date']}-to-{payload['end_date']}.md"
    )
    return Response(
        content="\n".join(lines).strip() + "\n",
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


def _persona_win_rate_report(
    db: Session,
    user_id: int,
    *,
    window_days: int,
    min_appearances: int,
    include_fallback: bool,
) -> dict:
    """Aggregate the per-persona win-rate payload for one user.

    This is the single computation shared by the JSON dashboard route and
    the CSV/Markdown exports. Keeping it outside the route decorator means
    an export only consumes its own rate-limit scope — a Markdown export
    does not silently eat into the dashboard's hourly budget as a side
    effect of calling the JSON route.
    """
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
            ScoringAudit.created_at,
        )
        .filter(
            ScoringAudit.user_id == user_id,
            ScoringAudit.created_at >= window_start,
            # The report window ends at the current UTC instant. A future-
            # dated row (from clock skew or corrupted data) must not land in
            # the latest trend bucket and inflate the current win rates.
            ScoringAudit.created_at <= now_utc,
        )
        .all()
    )

    # Weekly buckets share one time axis and sum exactly to the row-level
    # totals. Windows up to 26 weeks are fully plotted; longer windows keep
    # the most recent 26 weeks and carry the older exchanges as omitted
    # counters so the last bucket never silently absorbs months of history.
    # Empty buckets carry ``win_rate: null`` — an absent week is "no data",
    # not a 0% week.
    MAX_TREND_BUCKETS = 26
    bucket_count = min(MAX_TREND_BUCKETS, (window_days + 6) // 7)
    trend_start_day = max(
        window_start_day,
        now_utc.date() - timedelta(days=7 * bucket_count - 1),
    )
    bucket_starts = [
        trend_start_day + timedelta(days=7 * i) for i in range(bucket_count)
    ]
    bucket_ends = [
        min(start + timedelta(days=6), now_utc.date()) for start in bucket_starts
    ]

    appearances: Counter = Counter()
    wins: Counter = Counter()
    bucket_appearances: list[Counter] = [Counter() for _ in range(bucket_count)]
    bucket_wins: list[Counter] = [Counter() for _ in range(bucket_count)]
    omitted_appearances: Counter = Counter()
    omitted_wins: Counter = Counter()
    scored_exchanges = 0
    unattributed_exchanges = 0
    fallback_exchanges = 0

    for winner_persona_id, persona_ids_used, fallback_used, created_at in rows:
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
        panel_ids = set(panel)
        if created_at.date() < trend_start_day:
            for persona_id in panel_ids:
                appearances[persona_id] += 1
                omitted_appearances[persona_id] += 1
            if winner_persona_id and winner_persona_id in panel_ids:
                wins[winner_persona_id] += 1
                omitted_wins[winner_persona_id] += 1
        else:
            days_since_trend_start = max(
                (created_at.date() - trend_start_day).days, 0
            )
            bucket_index = min(days_since_trend_start // 7, bucket_count - 1)
            for persona_id in panel_ids:
                appearances[persona_id] += 1
                bucket_appearances[bucket_index][persona_id] += 1
            if winner_persona_id and winner_persona_id in panel_ids:
                wins[winner_persona_id] += 1
                bucket_wins[bucket_index][winner_persona_id] += 1

    personas = []
    for persona_id, appearance_count in appearances.items():
        if appearance_count < min_appearances:
            continue
        win_count = wins.get(persona_id, 0)
        metadata = PERSONA_METADATA.get(persona_id) or {}
        trend = []
        for i in range(bucket_count):
            bucket_appearance_count = bucket_appearances[i].get(persona_id, 0)
            bucket_win_count = bucket_wins[i].get(persona_id, 0)
            trend.append(
                {
                    "bucket_start": bucket_starts[i].isoformat(),
                    "bucket_end": bucket_ends[i].isoformat(),
                    "appearances": bucket_appearance_count,
                    "wins": bucket_win_count,
                    "win_rate": (
                        round(bucket_win_count / bucket_appearance_count, 3)
                        if bucket_appearance_count
                        else None
                    ),
                }
            )
        personas.append(
            {
                "persona_id": persona_id,
                "name": str(metadata.get("name") or persona_id),
                "color": str(metadata.get("color") or ""),
                "appearances": appearance_count,
                "wins": win_count,
                "win_rate": round(win_count / appearance_count, 3),
                "low_confidence": appearance_count < LOW_CONFIDENCE_APPEARANCES,
                "trend": trend,
                "trend_omitted_appearances": omitted_appearances[persona_id],
                "trend_omitted_wins": omitted_wins[persona_id],
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
        le=200,
        description=(
            "Drop personas that appeared on fewer than N panels. "
            "Capped at 200 — the max useful floor is well below that, "
            "and a higher cap would only let clients silence results "
            "by accident."
        ),
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

    - **Trends are bucketed by week, not smoothed.** Each row carries a
      ``trend`` array of weekly buckets covering the window (capped at 26
      weeks) so a dashboard can show whether a persona is improving or
      fading. Empty weeks report ``win_rate: null`` — absence is not a 0%
      week. Bucket totals plus the omitted counters sum exactly to the row
      totals.

    - **Rows older than the plotted window are counted, not folded in.** For
      windows beyond 26 weeks the sparkline plots the most recent 26 weeks
      and reports the remainder in ``trend_omitted_appearances`` /
      ``trend_omitted_wins``. Folding those older exchanges into the final
      bucket would make the newest point look like a spike it is not.

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

    return _persona_win_rate_report(
        db,
        user.id,
        window_days=window_days,
        min_appearances=min_appearances,
        include_fallback=include_fallback,
    )


# Characters that, when they appear as the first character of a CSV cell,
# cause Excel / Google Sheets / LibreOffice to evaluate the cell as a
# formula. OWASP CSV Injection guidance: prefix any cell that begins with
# one of these with a single quote to neutralize the formula.
_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _csv_safe(value) -> str:
    """Return ``value`` as a string safe to embed in a CSV cell.

    Defense-in-depth against CSV injection (CWE-1236). Even though the
    current persona names come from a trusted, code-defined metadata
    dictionary, a future feature (custom persona renames, admin overrides,
    prompt-injection-driven tool calls) could let user-controlled bytes
    land here. Excel would then execute ``=cmd|'/c calc'!A1``-style payloads
    on the next analyst who opened the file.

    The mitigation is the OWASP-recommended one: prepend a single quote
    to any cell that starts with a formula trigger. The quote is invisible
    in Excel's display and prevents the cell from being parsed as a
    formula. Numbers and booleans stringify through naturally because
    their first character is never a trigger.
    """
    s = str(value) if value is not None else ""
    if s and s[0] in _CSV_FORMULA_PREFIXES:
        return "'" + s
    return s


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
    include_fallback: bool = Query(
        False,
        description=(
            "Include exchanges where the scorer LLM failed and a fallback "
            "winner was assigned."
        ),
    ),
) -> Response:
    """CSV export of the persona win-rate table.

    Same computation as /analytics/persona-win-rate — shares
    ``_persona_win_rate_report`` with the JSON route and the Markdown export,
    so the formats can never drift. CSV is the format dashboards +
    spreadsheets consume directly; the JSON endpoint remains the canonical
    shape for the web UI. Each export is rate-limited under its own scope, so
    downloading files never consumes the dashboard's hourly budget.

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

    payload = _persona_win_rate_report(
        db,
        user.id,
        window_days=window_days,
        min_appearances=min_appearances,
        include_fallback=include_fallback,
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
                _csv_safe(row["persona_id"]),
                _csv_safe(row["name"]),
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
            # RFC 6266: filename* with charset is the safe way to embed
            # non-ASCII in Content-Disposition, but our filename is pure
            # ASCII ISO dates so the legacy form is sufficient and
            # trivially correct.
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            # Defense-in-depth: refuse to be framed as an HTML doc even
            # though CSV is downloaded, not rendered. A response with
            # text/csv *can* be navigated to and rendered as a
            # poorly-quoted table by some browsers; X-Content-Type-Options
            # blocks that.
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/analytics/persona-win-rate/export.json")
async def analytics_persona_win_rate_json(
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
    include_fallback: bool = Query(
        False,
        description=(
            "Include exchanges where the scorer LLM failed and a fallback "
            "winner was assigned."
        ),
    ),
) -> Response:
    """JSON download of the canonical persona win-rate report.

    This intentionally returns the same envelope as the dashboard endpoint,
    including honesty counters and weekly trend data. Keeping the export on
    the shared aggregation helper means scripts and the UI cannot drift apart
    as the report evolves. Its own rate-limit scope keeps a file download from
    consuming the interactive dashboard budget.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_persona_win_rate_json",
        limit=60,
        window_seconds=3600,
        message="Too many persona win-rate JSON exports. Please slow down.",
    )

    payload = _persona_win_rate_report(
        db,
        user.id,
        window_days=window_days,
        min_appearances=min_appearances,
        include_fallback=include_fallback,
    )

    import json

    filename = (
        f"arena-persona-win-rate-"
        f"{payload['window_start']}-to-{payload['window_end']}.json"
    )
    return Response(
        content=json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/analytics/persona-win-rate/export-trend.csv")
async def analytics_persona_win_rate_trend_csv(
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
    include_fallback: bool = Query(
        False,
        description=(
            "Include exchanges where the scorer LLM failed and a fallback "
            "winner was assigned."
        ),
    ),
) -> Response:
    """CSV export of the weekly persona win-rate trend.

    The aggregate CSV is intentionally compact, while the dashboard's
    sparkline data lives in each JSON row's ``trend`` array. This export
    flattens that array into one row per persona/week so spreadsheets and
    charting tools can consume the time series without parsing nested JSON.
    Empty weeks keep their row with a blank ``win_rate`` — no activity is
    different from a measured 0% week. Omitted older buckets are repeated on
    each row as report metadata so a filtered spreadsheet row remains
    self-describing.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_persona_win_rate_trend_csv",
        limit=60,
        window_seconds=3600,
        message="Too many persona win-rate trend exports. Please slow down.",
    )

    payload = _persona_win_rate_report(
        db,
        user.id,
        window_days=window_days,
        min_appearances=min_appearances,
        include_fallback=include_fallback,
    )

    import csv
    import io

    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow(
        [
            "persona_id",
            "name",
            "color",
            "bucket_start",
            "bucket_end",
            "appearances",
            "wins",
            "win_rate",
            "low_confidence",
            "trend_omitted_appearances",
            "trend_omitted_wins",
        ]
    )
    for row in payload["personas"]:
        for point in row["trend"]:
            writer.writerow(
                [
                    _csv_safe(row["persona_id"]),
                    _csv_safe(row["name"]),
                    _csv_safe(row["color"]),
                    _csv_safe(point["bucket_start"]),
                    _csv_safe(point["bucket_end"]),
                    point["appearances"],
                    point["wins"],
                    point["win_rate"],
                    "true" if row["low_confidence"] else "false",
                    row["trend_omitted_appearances"],
                    row["trend_omitted_wins"],
                ]
            )

    filename = (
        f"arena-persona-win-rate-trend-"
        f"{payload['window_start']}-to-{payload['window_end']}.csv"
    )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/analytics/persona-win-rate/export-trend.md")
async def analytics_persona_win_rate_trend_markdown(
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
    include_fallback: bool = Query(
        False,
        description=(
            "Include exchanges where the scorer LLM failed and a fallback "
            "winner was assigned."
        ),
    ),
) -> Response:
    """Markdown export of the flattened weekly persona win-rate trend.

    The report is deliberately one row per persona/week so it can be pasted
    into notes or docs without asking the reader to interpret nested JSON.
    It shares the canonical aggregation with the JSON and CSV routes; empty
    weeks remain ``no data`` rather than being rewritten as 0%, and older
    buckets outside the sparkline cap are called out explicitly.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_persona_win_rate_trend_markdown",
        limit=60,
        window_seconds=3600,
        message="Too many persona win-rate trend Markdown exports. Please slow down.",
    )

    payload = _persona_win_rate_report(
        db,
        user.id,
        window_days=window_days,
        min_appearances=min_appearances,
        include_fallback=include_fallback,
    )

    lines = [
        "# Arena — persona win-rate weekly trend",
        "",
        f"**Window:** {payload['window_start']} → {payload['window_end']} "
        f"({payload['window_days']} days, UTC)",
        f"**Minimum appearances:** {payload['min_appearances']}",
        f"**Fallback scorings included:** {'yes' if payload['include_fallback'] else 'no'}",
        "",
        "## Summary",
        "",
        f"- **Scored exchanges:** {payload['scored_exchanges']}",
        f"- **Unattributed exchanges:** {payload['unattributed_exchanges']}",
        f"- **Fallback exchanges:** {payload['fallback_exchanges']}",
    ]

    if payload["personas"]:
        lines.extend(
            [
                "",
                "## Weekly trend",
                "",
                "| Persona | Week (UTC) | Appearances | Wins | Win rate | Sample |",
                "| --- | --- | ---: | ---: | ---: | --- |",
            ]
        )
        omitted_notes = []
        for row in payload["personas"]:
            sample = "low sample" if row["low_confidence"] else ""
            for point in row["trend"]:
                rate = (
                    "no data"
                    if point["win_rate"] is None
                    else f"{round(point['win_rate'] * 100)}%"
                )
                lines.append(
                    "| "
                    + " | ".join(
                        [
                            _markdown_cell(row["name"]),
                            _markdown_cell(
                                f"{point['bucket_start']} → {point['bucket_end']}"
                            ),
                            _markdown_cell(point["appearances"]),
                            _markdown_cell(point["wins"]),
                            _markdown_cell(rate),
                            sample,
                        ]
                    )
                    + " |"
                )
            if row["trend_omitted_appearances"] or row["trend_omitted_wins"]:
                omitted_notes.append(
                    f"- **{_markdown_cell(row['name'])}:** "
                    f"{row['trend_omitted_appearances']} older appearances and "
                    f"{row['trend_omitted_wins']} older wins were not plotted."
                )
        if omitted_notes:
            lines.extend(["", "### Trend notes", "", *omitted_notes])
    else:
        lines.extend(
            [
                "",
                "_No scored panels meet the minimum appearance threshold in this window._",
            ]
        )

    lines.extend(["", "---", "_Exported from Arena_", ""])
    filename = (
        f"arena-persona-win-rate-trend-"
        f"{payload['window_start']}-to-{payload['window_end']}.md"
    )
    return Response(
        content="\n".join(lines).strip() + "\n",
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/analytics/persona-win-rate/export.md")
async def analytics_persona_win_rate_markdown(
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
    include_fallback: bool = Query(
        False,
        description=(
            "Include exchanges where the scorer LLM failed and a fallback "
            "winner was assigned."
        ),
    ),
) -> Response:
    """Markdown export of the persona win-rate report.

    Renders the same computation as ``/analytics/persona-win-rate`` as a
    human-readable report: window facts, scored-exchange honesty counters,
    the best (confident) persona, and a per-persona table with trend
    sparkline data spelled out as weekly win rates. Shares the JSON route's
    aggregation helper so the export and the dashboard can never drift, and
    keeps its own user-scoped rate limit so Markdown exports do not consume
    the dashboard or CSV export budgets.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_persona_win_rate_markdown",
        limit=60,
        window_seconds=3600,
        message="Too many persona win-rate export requests. Limit is 60 per hour.",
    )

    payload = _persona_win_rate_report(
        db,
        user.id,
        window_days=window_days,
        min_appearances=min_appearances,
        include_fallback=include_fallback,
    )

    best_row = None
    if payload.get("best_persona_id"):
        best_row = next(
            (
                row
                for row in payload["personas"]
                if row["persona_id"] == payload["best_persona_id"]
            ),
            None,
        )

    lines = [
        "# Arena — persona win rates",
        "",
        f"**Window:** {payload['window_start']} → {payload['window_end']} "
        f"({payload['window_days']} days, UTC)",
        "",
        "## Summary",
        "",
        f"- **Scored exchanges:** {payload['scored_exchanges']}",
        f"- **Unattributed exchanges:** {payload['unattributed_exchanges']}",
        f"- **Fallback exchanges:** {payload['fallback_exchanges']}",
        f"- **Minimum appearances:** {payload['min_appearances']}",
    ]
    if best_row:
        lines.extend(
            [
                "",
                f"**Best (confident):** {_markdown_cell(best_row['name'])} — "
                f"{round(best_row['win_rate'] * 100)}% across "
                f"{best_row['appearances']} panels",
            ]
        )

    lines.append("")
    if payload["personas"]:
        lines.extend(
            [
                "## Personas",
                "",
                "| Persona | Appearances | Wins | Win rate | Sample | Weekly trend |",
                "| --- | ---: | ---: | ---: | --- | --- |",
            ]
        )
        for row in payload["personas"]:
            trend = ", ".join(
                (
                    "no data"
                    if bucket["win_rate"] is None
                    else f"{round(bucket['win_rate'] * 100)}%"
                )
                for bucket in row["trend"]
            )
            omitted = ""
            if row.get("trend_omitted_appearances"):
                omitted = (
                    f" ({row['trend_omitted_appearances']} older "
                    "appearance"
                    + ("s" if row["trend_omitted_appearances"] != 1 else "")
                    + " not plotted)"
                )
            lines.append(
                "| "
                + " | ".join(
                    [
                        _markdown_cell(row["name"]),
                        _markdown_cell(row["appearances"]),
                        _markdown_cell(row["wins"]),
                        _markdown_cell(f"{round(row['win_rate'] * 100)}%"),
                        "low sample" if row["low_confidence"] else "",
                        _markdown_cell(trend + omitted),
                    ]
                )
                + " |"
            )
    else:
        lines.append(
            "_No scored panels meet the minimum appearance threshold in this "
            "window._"
        )

    lines.extend(["", "---", "_Exported from Arena_", ""])

    filename = (
        f"arena-persona-win-rate-"
        f"{payload['window_start']}-to-{payload['window_end']}.md"
    )
    return Response(
        content="\n".join(lines).strip() + "\n",
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


def _category_stats_payload(*, user_id: int, db: Session, window_days: int) -> dict:
    """All-categories aggregate: how the caller's exchanges distribute
    across prompt categories.

    Companion to the by-category endpoint, which is per-persona. This
    one is across-all-personas — "which categories do I engage with
    most, and how do they perform?"

    Same shape contract as the by-category rows, plus per-category
    best_persona (the persona that wins most in that category) so
    the dashboard can render "questions are best answered by Analyst"
    without a second pass.

    Sort order matches the by-category endpoint's: recognized
    PromptCategory values in enum order, unknown categories
    alphabetically, uncategorized bucket last.

    Scoped to the caller, bounded like the sibling endpoints. The route
    handlers apply their own user-scoped rate limits before calling this
    helper so dashboard reads and downloads do not share a bucket.
    """
    from arena.models.schemas import PromptCategory

    now_utc = utcnow_naive()
    window_start = now_utc - timedelta(days=window_days - 1)

    rows = (
        db.query(
            ScoringAudit.winner_persona_id,
            ScoringAudit.winner_score,
            ScoringAudit.prompt_category,
            ScoringAudit.created_at,
            ScoringAudit.fallback_used,
        )
        .filter(
            ScoringAudit.user_id == user_id,
            ScoringAudit.created_at >= window_start,
        )
        .all()
    )

    # Per-category counters. Keyed by category string (server-set
    # so we don't need to coerce the dict).
    appearances: dict[str, int] = {}
    wins: dict[str, int] = {}
    winning_scores: dict[str, list[int]] = {}
    last_exchange_at: dict[str, object] = {}
    wins_by_persona: dict[str, dict[str, int]] = {}
    appearances_by_persona: dict[str, dict[str, int]] = {}

    for winner, winner_score, category, created_at, fallback_used in rows:
        bucket = category if category not in (None, "") else "(uncategorized)"
        appearances[bucket] = appearances.get(bucket, 0) + 1
        if created_at and (
            last_exchange_at.get(bucket) is None
            or created_at > last_exchange_at[bucket]
        ):
            last_exchange_at[bucket] = created_at

        # Fallback wins are arbitrary — exclude from wins but still
        # count the appearance. Same rule as the persona-stats family.
        if not fallback_used and winner:
            wins.setdefault(bucket, 0)
            winning_scores.setdefault(bucket, [])
            wins[bucket] += 1
            if isinstance(winner_score, (int, float)):
                winning_scores[bucket].append(int(winner_score))
            wins_by_persona.setdefault(bucket, {})
            appearances_by_persona.setdefault(bucket, {})
            wins_by_persona[bucket][winner] = (
                wins_by_persona[bucket].get(winner, 0) + 1
            )
        # Count appearances-by-persona for both real and fallback
        # so the best_persona signal isn't biased by fallback noise.
        appearances_by_persona.setdefault(bucket, {})
        appearances_by_persona[bucket][winner] = (
            appearances_by_persona[bucket].get(winner, 0) + 1
        )

    # Sort: recognized PromptCategory values in enum order, unknown
    # categories alphabetically, uncategorized last.
    recognized = {c.value for c in PromptCategory}
    recognized_order = {c.value: i for i, c in enumerate(PromptCategory)}

    def _sort_key(label: str) -> tuple[int, str]:
        if label in recognized_order:
            return (0, chr(ord("a") + recognized_order[label]))
        if label == "(uncategorized)":
            return (2, label)
        return (1, label)

    category_rows = []
    for label, app_count in appearances.items():
        win_count = wins.get(label, 0)
        ws = winning_scores.get(label, [])
        rate = round(win_count / app_count, 4) if app_count else 0.0

        # Best persona in this category: highest win count, ties
        # broken by appearances, then persona_id for stability. Only
        # consider personas with at least one win (0/N isn't a
        # "best" — a category where nobody wins isn't a strength).
        persona_apps = appearances_by_persona.get(label, {})
        persona_wins = wins_by_persona.get(label, {})
        best_p = None
        best_p_wins = 0
        best_p_apps = 0
        for p, p_wins in persona_wins.items():
            if p_wins <= 0:
                continue
            p_apps = persona_apps.get(p, 0)
            if (
                p_wins > best_p_wins
                or (p_wins == best_p_wins and p_apps > best_p_apps)
                or (p_wins == best_p_wins and p_apps == best_p_apps and p < (best_p or ""))
            ):
                best_p = p
                best_p_wins = p_wins
                best_p_apps = p_apps

        category_rows.append(
            {
                "category": label,
                "is_known_category": label in recognized,
                "is_uncategorized": label == "(uncategorized)",
                "appearances": app_count,
                "wins": win_count,
                "win_rate": rate,
                "avg_winning_score": (
                    round(sum(ws) / len(ws), 1) if ws else None
                ),
                "last_exchange_at": (
                    last_exchange_at[label].isoformat()
                    if last_exchange_at.get(label)
                    else None
                ),
                "best_persona_id": best_p,
            }
        )
    category_rows.sort(key=lambda r: _sort_key(r["category"]))

    total_appearances = sum(appearances.values())
    total_wins = sum(wins.values())
    # Most-active category = highest appearances. Ties broken by
    # wins, then category name alphabetically.
    most_active = None
    most_active_apps = 0
    for row in category_rows:
        if (
            most_active is None
            or row["appearances"] > most_active_apps
            or (
                row["appearances"] == most_active_apps
                and (
                    row["wins"] > most_active["wins"]
                    or (
                        row["wins"] == most_active["wins"]
                        and row["category"] < most_active["category"]
                    )
                )
            )
        ):
            most_active = row
            most_active_apps = row["appearances"]

    return {
        "window_days": window_days,
        "window_start": window_start.date().isoformat(),
        "window_end": now_utc.date().isoformat(),
        "total_appearances": total_appearances,
        "total_wins": total_wins,
        "most_active_category": most_active["category"] if most_active else None,
        "categories": category_rows,
    }


@router.get("/analytics/category-stats")
async def analytics_category_stats(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        90,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC). Caps the row scan.",
    ),
) -> dict:
    """All-categories aggregate for the authenticated dashboard caller."""
    enforce_user_rate_limit(
        user.id,
        scope="analytics_category_stats",
        limit=60,
        window_seconds=3600,
        message="Too many category-stats requests. Limit is 60 per hour.",
    )
    return _category_stats_payload(
        user_id=user.id,
        db=db,
        window_days=window_days,
    )


@router.get("/analytics/category-stats/export.csv")
async def analytics_category_stats_csv(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        90,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC). Caps the row scan.",
    ),
) -> Response:
    """CSV export of the all-categories aggregate.

    Same computation as /api/analytics/category-stats — reuses the
    private aggregation helper so the CSV and the API response can never
    drift without consuming the dashboard rate-limit bucket.

    Columns mirror the JSON categories[] rows in the same order:
      category, is_known_category, is_uncategorized, appearances,
      wins, win_rate, avg_winning_score, last_exchange_at, best_persona_id

    A footer rollup row (# total_appearances, total_wins) makes the
    file self-describing when opened in isolation, matching the
    footer pattern from the timeline and by-category CSV exports.

    Bounded like the sibling endpoints: 1-365 day window,
    60 requests/hour/user rate limit.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_category_stats_csv",
        limit=60,
        window_seconds=3600,
        message="Too many category-stats CSV exports. Limit is 60 per hour.",
    )

    payload = _category_stats_payload(
        user_id=user.id,
        db=db,
        window_days=window_days,
    )

    import csv
    import io

    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow(
        [
            "category",
            "is_known_category",
            "is_uncategorized",
            "appearances",
            "wins",
            "win_rate",
            "avg_winning_score",
            "last_exchange_at",
            "best_persona_id",
        ]
    )
    for row in payload["categories"]:
        writer.writerow(
            [
                _csv_safe(row["category"]),
                "true" if row["is_known_category"] else "false",
                "true" if row["is_uncategorized"] else "false",
                row["appearances"],
                row["wins"],
                row["win_rate"],
                row["avg_winning_score"] if row["avg_winning_score"] is not None else "",
                row["last_exchange_at"] or "",
                row["best_persona_id"] or "",
            ]
        )
    # Footer rollup so the file is self-describing.
    writer.writerow(
        [
            f"# total_appearances={payload['total_appearances']}",
            f"total_wins={payload['total_wins']}",
            f"most_active_category={payload['most_active_category'] or ''}",
        ]
    )

    filename = (
        f"arena-category-stats-"
        f"{payload['window_start']}-to-{payload['window_end']}.csv"
    )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/analytics/category-stats/export.json")
async def analytics_category_stats_json(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        90,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC).",
    ),
) -> Response:
    """Download the exact category-stats payload as JSON.

    The dashboard response is already a compact, stable analytics contract;
    exposing that same envelope lets users archive or analyze category
    performance without scraping the UI. Keep this on its own rate-limit
    scope so a download cannot consume the interactive dashboard budget.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_category_stats_json",
        limit=60,
        window_seconds=3600,
        message="Too many category-stats JSON exports. Please wait.",
    )

    payload = _category_stats_payload(
        user_id=user.id,
        db=db,
        window_days=window_days,
    )

    import json

    filename = (
        f"arena-category-stats-"
        f"{payload['window_start']}-to-{payload['window_end']}.json"
    )
    return Response(
        content=json.dumps(payload, indent=2, default=str),
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/analytics/category-stats/export.md")
async def analytics_category_stats_markdown(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        90,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC).",
    ),
) -> Response:
    """Download category performance as a human-readable Markdown report.

    The report intentionally reuses the dashboard aggregation so its
    summary and category table remain aligned with the JSON and CSV
    siblings. It has an independent budget because downloading a report
    should not make the interactive category dashboard feel rate-limited.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_category_stats_markdown",
        limit=60,
        window_seconds=3600,
        message="Too many category-stats Markdown exports. Please wait.",
    )

    payload = _category_stats_payload(
        user_id=user.id,
        db=db,
        window_days=window_days,
    )

    lines = [
        "# Arena — category stats",
        "",
        f"**Window:** {payload['window_start']} → {payload['window_end']} "
        f"({payload['window_days']} days, UTC)",
        "",
        "## Summary",
        "",
        f"- **Total appearances:** {payload['total_appearances']}",
        f"- **Total wins:** {payload['total_wins']}",
        (
            f"- **Most active category:** "
            f"{_markdown_cell(payload['most_active_category']) if payload['most_active_category'] else 'none'}"
        ),
        "",
    ]

    if payload["categories"]:
        lines.extend(
            [
                "## Categories",
                "",
                "| Category | Appearances | Wins | Win rate | Avg winning score | Last exchange | Best persona |",
                "| --- | ---: | ---: | ---: | ---: | --- | --- |",
            ]
        )
        for row in payload["categories"]:
            avg_score = (
                row["avg_winning_score"]
                if row["avg_winning_score"] is not None
                else "—"
            )
            last_exchange = row["last_exchange_at"] or "—"
            best_persona = row["best_persona_id"] or "—"
            lines.append(
                "| "
                + " | ".join(
                    [
                        _markdown_cell(row["category"]),
                        _markdown_cell(row["appearances"]),
                        _markdown_cell(row["wins"]),
                        _markdown_cell(f"{row['win_rate'] * 100:.1f}%"),
                        _markdown_cell(avg_score),
                        _markdown_cell(last_exchange),
                        _markdown_cell(best_persona),
                    ]
                )
                + " |"
            )
    else:
        lines.append("_No categories recorded in this window._")

    lines.extend(["", "---", "_Exported from Arena_", ""])

    filename = (
        f"arena-category-stats-"
        f"{payload['window_start']}-to-{payload['window_end']}.md"
    )
    return Response(
        content="\n".join(lines).strip() + "\n",
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/analytics/persona-stats")
async def analytics_persona_stats_all(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        90,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC). Caps the row scan.",
    ),
    min_appearances: int = Query(
        1,
        ge=1,
        le=200,
        description="Hide personas that appeared on fewer than N panels (noise floor).",
    ),
) -> dict:
    """All-personas summary: the deep-dive data for every catalog persona.

    Lets a dashboard render a 16-persona grid in one call instead of
    16 separate /persona-stats/{id} requests. Same per-persona shape
    the single endpoint returns, sorted strongest-first.

    The full catalog (16 personas) is always emitted — personas the
    caller never saw in the window are included with zeros so the UI
    can render the full grid without a second pass. min_appearances
    filters the rows but never the metadata; the dashboard can still
    show "Analyst: 0/0 in window" with a confidence flag if it wants.

    Sorted by win_rate descending, then by appearances descending for
    ties, then by persona_id alphabetically for stable ordering.
    """
    from arena.core.agents import PERSONA_METADATA

    enforce_user_rate_limit(
        user.id,
        scope="analytics_persona_stats_all",
        limit=60,
        window_seconds=3600,
        message="Too many all-personas stats requests. Limit is 60 per hour.",
    )

    now_utc = utcnow_naive()
    window_start = now_utc - timedelta(days=window_days - 1)

    # Project only the columns needed for the math. Pulling whole ORM
    # rows would load prompt snippets and score blobs for every
    # exchange purely to throw them away.
    rows = (
        db.query(
            ScoringAudit.winner_persona_id,
            ScoringAudit.winner_score,
            ScoringAudit.persona_ids_used,
            ScoringAudit.created_at,
            ScoringAudit.fallback_used,
        )
        .filter(
            ScoringAudit.user_id == user.id,
            ScoringAudit.created_at >= window_start,
        )
        .all()
    )

    # Same counters as the single-persona endpoint, aggregated across
    # all 16 personas in one pass.
    appearances: dict[str, int] = {pid: 0 for pid in PERSONA_METADATA}
    wins: dict[str, int] = {pid: 0 for pid in PERSONA_METADATA}
    winning_scores: dict[str, list[int]] = {pid: [] for pid in PERSONA_METADATA}
    last_appearance_at: dict[str, object] = {pid: None for pid in PERSONA_METADATA}
    last_win_at: dict[str, object] = {pid: None for pid in PERSONA_METADATA}

    for winner, winner_score, raw_panel, created_at, fallback_used in rows:
        panel = _coerce_persona_panel(raw_panel)
        if not panel:
            continue
        # Fallback wins are arbitrary — exclude from wins but count
        # the appearance. Same rule as the single-persona endpoint.
        seen_in_panel = set()
        for pid in panel:
            if pid not in appearances or pid in seen_in_panel:
                continue
            seen_in_panel.add(pid)
            appearances[pid] += 1
            if created_at and (
                last_appearance_at[pid] is None or created_at > last_appearance_at[pid]
            ):
                last_appearance_at[pid] = created_at
        if not fallback_used and winner in wins:
            wins[winner] += 1
            if isinstance(winner_score, (int, float)):
                winning_scores[winner].append(int(winner_score))
            if created_at and (
                last_win_at[winner] is None or created_at > last_win_at[winner]
            ):
                last_win_at[winner] = created_at

    personas: list[dict] = []
    for pid in PERSONA_METADATA:
        seated = appearances[pid]
        # Always emit the persona (the grid must show the full catalog)
        # but tag the row as below the noise floor if it doesn't meet
        # the min_appearances threshold. The dashboard can choose to
        # dim or hide such rows without a second pass.
        metadata = PERSONA_METADATA[pid]
        ws = winning_scores[pid]
        win_count = wins[pid]
        personas.append(
            {
                "persona_id": pid,
                "name": str(metadata.get("name") or pid),
                "color": str(metadata.get("color") or ""),
                "appearances": seated,
                "wins": win_count,
                "win_rate": round(win_count / seated, 4) if seated else 0.0,
                "avg_winning_score": (
                    round(sum(ws) / len(ws), 1) if ws else None
                ),
                "last_appearance_at": (
                    last_appearance_at[pid].isoformat()
                    if last_appearance_at[pid]
                    else None
                ),
                "last_win_at": (
                    last_win_at[pid].isoformat() if last_win_at[pid] else None
                ),
                "below_min_appearances": seated < min_appearances,
            }
        )

    # Strongest first; ties broken by appearances then persona_id.
    personas.sort(key=lambda r: (-r["win_rate"], -r["appearances"], r["persona_id"]))

    # Top-level rollup so the dashboard can render a summary without
    # iterating the personas[] array. Pin these as the canonical
    # totals — a future "let's pre-aggregate" optimization can't
    # drift them.
    total_appearances = sum(appearances.values())
    total_wins = sum(wins.values())
    best = personas[0] if personas else None

    return {
        "window_days": window_days,
        "window_start": window_start.date().isoformat(),
        "window_end": now_utc.date().isoformat(),
        "min_appearances": min_appearances,
        "total_personas": len(PERSONA_METADATA),
        "returned_personas": len(personas),
        "total_appearances": total_appearances,
        "total_wins": total_wins,
        "best_persona_id": best["persona_id"] if best else None,
        "personas": personas,
    }


@router.get("/analytics/persona-stats/export.csv")
async def analytics_persona_stats_all_csv(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        90,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC). Caps the row scan.",
    ),
    min_appearances: int = Query(
        1,
        ge=1,
        le=200,
        description="Hide personas that appeared on fewer than N panels (noise floor).",
    ),
) -> Response:
    """CSV export of the all-personas summary catalog.

    Reuses the JSON route ``analytics_persona_stats_all`` so the math and
    sorting order (win_rate desc, appearances desc, persona_id asc) stay
    identical and cannot drift between CSV and API.

    Columns: persona_id, name, appearances, wins, win_rate, avg_winning_score,
             last_appearance_at, last_win_at, below_min_appearances.

    Includes a footer rollup row (# total_appearances, total_wins, best_persona_id)
    to make the file self-describing when opened in Excel or python-pandas.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_persona_stats_all_csv",
        limit=60,
        window_seconds=3600,
        message="Too many persona-stats CSV exports. Limit is 60 per hour.",
    )

    payload = await analytics_persona_stats_all(
        window_days=window_days,
        min_appearances=min_appearances,
        user=user,
        db=db,
    )

    import csv
    import io

    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow(
        [
            "persona_id",
            "name",
            "appearances",
            "wins",
            "win_rate",
            "avg_winning_score",
            "last_appearance_at",
            "last_win_at",
            "below_min_appearances",
        ]
    )
    for row in payload["personas"]:
        writer.writerow(
            [
                _csv_safe(row["persona_id"]),
                _csv_safe(row["name"]),
                row["appearances"],
                row["wins"],
                row["win_rate"],
                row["avg_winning_score"] if row["avg_winning_score"] is not None else "",
                row["last_appearance_at"] or "",
                row["last_win_at"] or "",
                "true" if row["below_min_appearances"] else "false",
            ]
        )

    # Footer rollup row
    writer.writerow(
        [
            f"# total_appearances={payload['total_appearances']}",
            f"total_wins={payload['total_wins']}",
            f"best_persona_id={payload['best_persona_id'] or ''}",
        ]
    )

    filename = f"arena-persona-stats-overview-{payload['window_start']}-to-{payload['window_end']}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/analytics/persona-stats/{persona_id}")
async def analytics_persona_stats(
    persona_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        90,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC). Caps the row scan.",
    ),
) -> dict:
    """Per-persona stats for the caller: deep-dive on one persona.

    Companion to /analytics/persona-win-rate (which returns the full
    panel) — this endpoint scopes to one persona and adds three extra
    signals the aggregate view doesn't surface:

    - avg_winning_score: the average ``winner_score`` across this
      persona's winning exchanges. A persona with 5/10 wins at an avg
      score of 90 is a different story than 5/10 at 51. The aggregate
      view hides this.
    - last_win_at / last_appearance_at: ISO dates so the UI can render
      "last won 3 days ago" without recomputing client-side.
    - best_prompt_category: the category (``question``, ``command``,
      etc.) where this persona wins the most, so the dashboard can
      suggest "Analyst is strongest on X".

    Returns 404 for unknown persona_ids so a typo or retired persona
    surfaces a clear error rather than zero stats that look like a bug.

    Scoped to the caller, bounded like the sibling endpoints.
    """
    from arena.core.agents import PERSONA_METADATA

    pid = persona_id.strip().lower()
    if pid not in PERSONA_METADATA:
        raise HTTPException(
            status_code=404,
            detail={"error": "unknown_persona", "message": f"Unknown persona: {persona_id}"},
        )

    enforce_user_rate_limit(
        user.id,
        scope="analytics_persona_stats",
        limit=120,
        window_seconds=3600,
        message="Too many persona-stats requests. Limit is 120 per hour.",
    )

    now_utc = utcnow_naive()
    window_start = now_utc - timedelta(days=window_days - 1)

    rows = (
        db.query(
            ScoringAudit.winner_persona_id,
            ScoringAudit.winner_score,
            ScoringAudit.persona_ids_used,
            ScoringAudit.prompt_category,
            ScoringAudit.created_at,
            ScoringAudit.fallback_used,
        )
        .filter(
            ScoringAudit.user_id == user.id,
            ScoringAudit.created_at >= window_start,
        )
        .all()
    )

    appearances = 0
    wins = 0
    winning_scores: list[int] = []
    last_win_at = None
    last_appearance_at = None
    wins_by_category: Counter = Counter()
    appearances_by_category: Counter = Counter()

    for winner, winner_score, raw_panel, category, created_at, fallback_used in rows:
        panel = _coerce_persona_panel(raw_panel)
        if not panel or pid not in panel:
            continue
        # Fallback wins are not judged — exclude from the win count.
        if fallback_used:
            continue
        appearances += 1
        if category:
            appearances_by_category[category] += 1
        if created_at and (last_appearance_at is None or created_at > last_appearance_at):
            last_appearance_at = created_at
        if winner == pid:
            wins += 1
            if isinstance(winner_score, (int, float)):
                winning_scores.append(int(winner_score))
            if category:
                wins_by_category[category] += 1
            if created_at and (last_win_at is None or created_at > last_win_at):
                last_win_at = created_at

    win_rate = round(wins / appearances, 4) if appearances else 0.0
    avg_winning_score = (
        round(sum(winning_scores) / len(winning_scores), 1) if winning_scores else None
    )
    # Best category = highest win rate within the window, only counting
    # categories where the persona actually appeared. A category with
    # 1 appearance and 1 win is 100% but may be noise — the caller can
    # decide how to render it.
    best_category = None
    best_category_rate = 0.0
    for category, cat_apps in appearances_by_category.items():
        cat_wins = wins_by_category.get(category, 0)
        if cat_wins > 0:  # skip zero-win categories
            rate = cat_wins / cat_apps if cat_apps else 0
            if rate > best_category_rate:
                best_category_rate = rate
                best_category = category

    metadata = PERSONA_METADATA[pid]
    return {
        "persona_id": pid,
        "name": str(metadata.get("name") or pid),
        "color": str(metadata.get("color") or ""),
        "window_days": window_days,
        "window_start": window_start.date().isoformat(),
        "window_end": now_utc.date().isoformat(),
        "appearances": appearances,
        "wins": wins,
        "win_rate": win_rate,
        "avg_winning_score": avg_winning_score,
        "last_win_at": last_win_at.isoformat() if last_win_at else None,
        "last_appearance_at": last_appearance_at.isoformat() if last_appearance_at else None,
        "best_prompt_category": best_category,
    }


@router.get("/analytics/persona-stats/{persona_id}/by-category")
async def analytics_persona_stats_by_category(
    persona_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        90,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC). Caps the row scan.",
    ),
) -> dict:
    """Per-category breakdown for one persona.

    Companion to /analytics/persona-stats/{persona_id} — that endpoint
    collapses the category dimension into a single "best" field. This
    one returns the full distribution: one row per category the persona
    has appeared in within the window, with appearances, wins, and
    win_rate. Lets the dashboard render "Analyst is 80% on questions,
    50% on tasks, 100% on debate" instead of just the top line.

    Categories:
    - Recognized PromptCategory values (question, task, statement,
      debate) get a stable sort order so the UI can render them in
      a known sequence.
    - Unknown / older categories land at the end, sorted alphabetically.
    - Rows with no recorded category land at the end with
      category="(uncategorized)" so they're not silently dropped.
    - Rows with a null/empty category string are treated as the
      uncategorized bucket so the breakdown still reconciles to the
      parent endpoint's total appearances.

    Returns 404 for unknown persona_id (same contract as the parent
    stats endpoint).
    """
    from arena.core.agents import PERSONA_METADATA
    from arena.models.schemas import PromptCategory

    pid = persona_id.strip().lower()
    if pid not in PERSONA_METADATA:
        raise HTTPException(
            status_code=404,
            detail={"error": "unknown_persona", "message": f"Unknown persona: {persona_id}"},
        )

    enforce_user_rate_limit(
        user.id,
        scope="analytics_persona_stats_by_category",
        limit=120,
        window_seconds=3600,
        message="Too many persona-stats-by-category requests. Limit is 120 per hour.",
    )

    now_utc = utcnow_naive()
    window_start = now_utc - timedelta(days=window_days - 1)

    rows = (
        db.query(
            ScoringAudit.winner_persona_id,
            ScoringAudit.persona_ids_used,
            ScoringAudit.prompt_category,
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
    uncategorized_appearances = 0
    uncategorized_wins = 0

    for winner, raw_panel, category, fallback_used in rows:
        panel = _coerce_persona_panel(raw_panel)
        if not panel or pid not in panel:
            continue
        # Fallback wins are not judged — exclude from wins, but DO
        # count the appearance. The parent endpoint's "fallback
        # excluded" rule applies the same way here.
        appearances[category or "(uncategorized)"] += 1
        if not fallback_used and winner == pid:
            wins[category or "(uncategorized)"] += 1
        # Track the uncategorized bucket explicitly so the totals
        # section can surface it without a dict lookup.
        if category is None or category == "":
            uncategorized_appearances += 1
            if not fallback_used and winner == pid:
                uncategorized_wins += 1

    # Stable sort: recognized PromptCategory values first in enum order,
    # then unknown categories alphabetically, with the uncategorized
    # bucket pinned last so the UI can render it as "Other".
    recognized = {c.value for c in PromptCategory}
    recognized_order = {c.value: i for i, c in enumerate(PromptCategory)}

    def _sort_key(label: str) -> tuple[int, str]:
        if label in recognized_order:
            return (0, chr(ord("a") + recognized_order[label]))
        if label == "(uncategorized)":
            return (2, label)
        return (1, label)

    category_rows = []
    for label, app_count in appearances.items():
        win_count = wins.get(label, 0)
        rate = round(win_count / app_count, 4) if app_count else 0.0
        is_recognized = label in recognized
        category_rows.append(
            {
                "category": label,
                "is_uncategorized": label == "(uncategorized)",
                "is_known_category": is_recognized,
                "appearances": app_count,
                "wins": win_count,
                "win_rate": rate,
            }
        )
    category_rows.sort(key=lambda r: _sort_key(r["category"]))

    total_appearances = sum(appearances.values())
    total_wins = sum(wins.values())

    return {
        "persona_id": pid,
        "name": str(PERSONA_METADATA[pid].get("name") or pid),
        "window_days": window_days,
        "window_start": window_start.date().isoformat(),
        "window_end": now_utc.date().isoformat(),
        "total_appearances": total_appearances,
        "total_wins": total_wins,
        "uncategorized_appearances": uncategorized_appearances,
        "uncategorized_wins": uncategorized_wins,
        "categories": category_rows,
    }


@router.get("/analytics/persona-stats/{persona_id}/timeline")
async def analytics_persona_stats_timeline(
    persona_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    days: int = Query(
        30,
        ge=1,
        le=90,
        description="Window length in days, ending today (UTC). Capped at 90 to keep the timeline compact.",
    ),
) -> dict:
    """Per-persona daily timeline of wins and appearances.

    Third axis in the persona-stats family (deep-dive + per-category +
    per-day). Returns one row per UTC day in the window with wins and
    appearances for the specified persona, plus a rolling best_day /
    best_win_rate summary so the dashboard can render a sparkline
    with a peak badge.

    Day buckets are inclusive of today and anchored in UTC, matching
    the /analytics/activity endpoint. Days where the persona had no
    exchanges are emitted as zeros so the timeline is contiguous — a
    dashboard doesn't have to fill gaps client-side.

    Capped at 90 days because timelines longer than that don't render
    well in a sparkline anyway, and capping the row scan protects the
    user_id index from a multi-month query.
    """
    from arena.core.agents import PERSONA_METADATA

    pid = persona_id.strip().lower()
    if pid not in PERSONA_METADATA:
        raise HTTPException(
            status_code=404,
            detail={"error": "unknown_persona", "message": f"Unknown persona: {persona_id}"},
        )

    enforce_user_rate_limit(
        user.id,
        scope="analytics_persona_stats_timeline",
        limit=120,
        window_seconds=3600,
        message="Too many persona-stats-timeline requests. Limit is 120 per hour.",
    )

    now_utc = utcnow_naive()
    end_day = now_utc.date()
    start_day = end_day - timedelta(days=days - 1)
    start_dt = datetime.combine(start_day, time.min)
    # Exclusive upper bound: anything timestamped after this belongs to
    # tomorrow's bucket and is correctly excluded from this window.
    end_dt = datetime.combine(end_day + timedelta(days=1), time.min)

    rows = (
        db.query(
            ScoringAudit.winner_persona_id,
            ScoringAudit.persona_ids_used,
            ScoringAudit.created_at,
            ScoringAudit.fallback_used,
        )
        .filter(
            ScoringAudit.user_id == user.id,
            ScoringAudit.created_at >= start_dt,
            ScoringAudit.created_at < end_dt,
        )
        .all()
    )

    # Zero-fill the buckets first so the timeline is contiguous even on
    # quiet days. days=1, 30, 90 → 1, 30, 90 buckets respectively.
    daily: dict[str, dict[str, int]] = {
        (start_day + timedelta(days=offset)).isoformat(): {
            "wins": 0,
            "appearances": 0,
        }
        for offset in range(days)
    }

    for winner, raw_panel, created_at, fallback_used in rows:
        panel = _coerce_persona_panel(raw_panel)
        if not panel or pid not in panel:
            continue
        bucket_key = created_at.date().isoformat() if created_at else None
        if not bucket_key or bucket_key not in daily:
            continue
        daily[bucket_key]["appearances"] += 1
        # Fallback wins are arbitrary — exclude from wins but still
        # count the appearance. Same rule as the parent endpoint.
        if not fallback_used and winner == pid:
            daily[bucket_key]["wins"] += 1

    # Stable order: oldest first. The dashboard's sparkline library
    # expects chronological data; reversing client-side is an easy
    # mistake. The endpoint returns a list (not a dict) so order is
    # part of the contract.
    timeline = []
    for offset in range(days):
        day = start_day + timedelta(days=offset)
        bucket = daily[day.isoformat()]
        wins = bucket["wins"]
        apps = bucket["appearances"]
        timeline.append(
            {
                "date": day.isoformat(),
                "appearances": apps,
                "wins": wins,
                "win_rate": round(wins / apps, 4) if apps else 0.0,
            }
        )

    # Roll-up: best day by wins (with a minimum of 1 — a 0/0 day isn't
    # a "best" anything). Ties broken by earliest date so the rollup
    # is stable. We also capture the best day's win_rate + appearances
    # so the UI can render "peak day: 3/3 = 100%" alongside the date
    # without a second pass over the timeline.
    best_day = None
    best_wins = 0
    best_day_apps = 0
    for row in timeline:
        if row["wins"] > best_wins:
            best_wins = row["wins"]
            best_day = row["date"]
            best_day_apps = row["appearances"]

    return {
        "persona_id": pid,
        "name": str(PERSONA_METADATA[pid].get("name") or pid),
        "days": days,
        "window_start": start_day.isoformat(),
        "window_end": end_day.isoformat(),
        "total_appearances": sum(row["appearances"] for row in timeline),
        "total_wins": sum(row["wins"] for row in timeline),
        "best_day": best_day,
        "best_day_wins": best_wins,
        "best_day_appearances": best_day_apps,
        "best_day_win_rate": (
            round(best_wins / best_day_apps, 4) if best_day_apps else 0.0
        ),
        "timeline": timeline,
    }


@router.get("/analytics/persona-stats/{persona_id}/timeline/export.csv")
async def analytics_persona_stats_timeline_csv(
    persona_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    days: int = Query(
        30,
        ge=1,
        le=90,
        description="Window length in days, ending today (UTC). Capped at 90 to keep the timeline compact.",
    ),
) -> Response:
    """CSV export of the persona timeline.

    Same computation as the JSON timeline endpoint — reuses the
    underlying aggregation rather than reimplementing it, so the CSV
    cannot drift from the dashboard's view.

    CSV is the format BI tools (Excel, Sheets, Tableau) consume
    directly. A sparkline is nice for in-app, but an analyst who
    wants to run their own numbers needs the raw rows. This is the
    export that lets them.

    Columns: date, appearances, wins, win_rate. Plus a footer
    comment row (# total_appearances, # total_wins, # best_day) so
    the CSV is self-describing when opened in isolation.

    Same bounds as the JSON endpoint: days 1-90, persona_id must
    be a known persona, 120/hr/user rate limit. The persona_id
    filename suffix lets multiple downloads sit in the same
    directory without overwriting each other.
    """
    from arena.core.agents import PERSONA_METADATA

    pid = persona_id.strip().lower()
    if pid not in PERSONA_METADATA:
        raise HTTPException(
            status_code=404,
            detail={"error": "unknown_persona", "message": f"Unknown persona: {persona_id}"},
        )

    enforce_user_rate_limit(
        user.id,
        scope="analytics_persona_stats_timeline_csv",
        limit=60,
        window_seconds=3600,
        message="Too many timeline CSV exports. Limit is 60 per hour.",
    )

    # Reuse the JSON route so the math cannot drift.
    payload = await analytics_persona_stats_timeline(
        persona_id=pid,
        user=user,
        db=db,
        days=days,
    )

    import csv
    import io

    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow(["date", "appearances", "wins", "win_rate"])
    for row in payload["timeline"]:
        # date and win_rate are server-computed, no CSV-injection risk,
        # but route them through _csv_safe anyway for defense-in-depth.
        writer.writerow(
            [
                _csv_safe(row["date"]),
                row["appearances"],
                row["wins"],
                row["win_rate"],
            ]
        )
    # Footer rollup so the file is self-describing when opened in
    # isolation. '#' prefix matches the de-facto CSV comment convention
    # (Excel, Sheets, and most BI tools skip these rows). Includes all
    # three best_day fields the JSON endpoint exposes, so the CSV
    # footer is a complete parallel of the JSON rollup.
    writer.writerow(
        [
            f"# total_appearances={payload['total_appearances']}",
            f"total_wins={payload['total_wins']}",
            f"best_day={payload['best_day'] or ''}",
            f"best_day_wins={payload['best_day_wins']}",
            f"best_day_appearances={payload['best_day_appearances']}",
            f"best_day_win_rate={payload['best_day_win_rate']}",
        ]
    )

    filename = f"arena-timeline-{pid}-{payload['window_start']}-to-{payload['window_end']}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/analytics/persona-stats/{persona_id}/by-category/export.csv")
async def analytics_persona_stats_by_category_csv(
    persona_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    window_days: int = Query(
        90,
        ge=1,
        le=365,
        description="Window length in days, ending today (UTC).",
    ),
) -> Response:
    """CSV export of the per-persona per-category breakdown.

    Parallel to the timeline CSV export — same pattern, same defenses.
    Reuses the JSON by-category route's computation so the CSV cannot
    drift from the dashboard's view.

    Columns: category, is_known_category, is_uncategorized, appearances,
    wins, win_rate. Plus a footer rollup row with the totals so the
    file is self-describing when opened in isolation.

    Filename includes persona_id + window dates so multiple downloads
    (different personas, different windows) sit in the same directory
    without overwriting each other.
    """
    from arena.core.agents import PERSONA_METADATA

    pid = persona_id.strip().lower()
    if pid not in PERSONA_METADATA:
        raise HTTPException(
            status_code=404,
            detail={"error": "unknown_persona", "message": f"Unknown persona: {persona_id}"},
        )

    enforce_user_rate_limit(
        user.id,
        scope="analytics_persona_stats_by_category_csv",
        limit=60,
        window_seconds=3600,
        message="Too many by-category CSV exports. Limit is 60 per hour.",
    )

    # Reuse the JSON route so the math cannot drift.
    payload = await analytics_persona_stats_by_category(
        persona_id=pid,
        user=user,
        db=db,
        window_days=window_days,
    )

    import csv
    import io

    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow(
        ["category", "is_known_category", "is_uncategorized", "appearances", "wins", "win_rate"]
    )
    for row in payload["categories"]:
        # category is server-computed, but route through _csv_safe
        # anyway for defense-in-depth.
        writer.writerow(
            [
                _csv_safe(row["category"]),
                "true" if row["is_known_category"] else "false",
                "true" if row["is_uncategorized"] else "false",
                row["appearances"],
                row["wins"],
                row["win_rate"],
            ]
        )
    # Footer rollup so the file is self-describing.
    writer.writerow(
        [
            f"# total_appearances={payload['total_appearances']}",
            f"total_wins={payload['total_wins']}",
            f"uncategorized_appearances={payload['uncategorized_appearances']}",
            f"uncategorized_wins={payload['uncategorized_wins']}",
        ]
    )

    filename = f"arena-by-category-{pid}-{payload['window_start']}-to-{payload['window_end']}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/analytics/scoring-audit/{session_id}")
async def analytics_scoring_audit_detail(
    session_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    limit: int = Query(
        50,
        ge=1,
        le=200,
        description="Max number of round audits returned, newest kept last.",
    ),
) -> dict:
    """Per-round scoring audit detail for the caller (Pro feature).

    The Scorer persists a ScoringAudit row for every Arena exchange: each
    mind's score, the winner, self-reported confidence, the criteria
    breakdown when the judge model supplies one, scoring duration, and a
    fallback flag for rounds where the LLM judge failed and default scores
    were used. The analytics endpoints aggregate those rows, but nothing
    exposed the raw per-round record to the user — this endpoint fills the
    "Scoring audit" Pro entitlement: open a past session and see exactly
    how the judge scored each mind and whether the judge had to fall back.

    Ownership-scoped and existence-safe: a missing row or another user's
    session both return 404 so the endpoint can't be used to probe which
    session ids exist. Rows are returned oldest-first so a chat's rounds
    read in order. ``limit`` caps the payload at the *most recent* rounds
    (a long session shows its newest exchanges, not the earliest ones);
    ``total_count`` reports the full session length so clients can tell
    when truncation happened.
    """
    if not _scoring_audit_allowed(user):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_allowed",
                "message": "Scoring audit requires a Pro subscription.",
                "upgrade_required": "pro",
            },
        )

    enforce_user_rate_limit(
        user.id,
        scope="analytics_scoring_audit",
        limit=120,
        window_seconds=3600,
        message="Too many scoring audit reads. Limit is 120 per hour.",
    )

    sid = session_id.strip()
    base_filters = (
        ScoringAudit.session_id == sid,
        ScoringAudit.user_id == user.id,
    )
    total_count = (
        db.query(func.count(ScoringAudit.id))
        .filter(*base_filters)
        .scalar()
        or 0
    )

    # Pick the newest ``limit`` rows first, then re-fetch them ascending so
    # the payload stays chronologically ordered. Ties on created_at (bulk
    # imports, seeded rows) break on id for a deterministic window.
    newest_ids = (
        db.query(ScoringAudit.id)
        .filter(*base_filters)
        .order_by(ScoringAudit.created_at.desc(), ScoringAudit.id.desc())
        .limit(limit)
        .subquery()
    )
    rows = (
        db.query(ScoringAudit)
        .filter(ScoringAudit.id.in_(newest_ids))
        .order_by(ScoringAudit.created_at.asc(), ScoringAudit.id.asc())
        .all()
    )

    audits = [
        {
            "id": row.id,
            "prompt_snippet": row.prompt_snippet,
            "prompt_category": row.prompt_category,
            "winner_agent_id": row.winner_agent_id,
            "winner_persona_id": row.winner_persona_id,
            "winner_score": row.winner_score,
            "scores": _coerce_json_dict(row.scores),
            "criteria_breakdown": _coerce_json_dict(row.criteria_breakdown) or None,
            "confidence_values": _coerce_json_list(row.confidence_values),
            "persona_ids_used": _coerce_persona_panel(row.persona_ids_used),
            "scoring_duration_ms": row.scoring_duration_ms,
            "fallback_used": bool(row.fallback_used),
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]

    if not audits:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "audit_not_found",
                "message": "No scoring audit found for this session.",
            },
        )

    return {
        "session_id": sid,
        "audits": audits,
        "audit_count": len(audits),
        "total_count": total_count,
    }


@router.get("/analytics/scoring-audit/{session_id}/export.csv")
async def analytics_scoring_audit_csv(
    session_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    limit: int = Query(
        50,
        ge=1,
        le=200,
        description="Max number of round audits exported, newest kept last.",
    ),
) -> Response:
    """CSV export of the per-round scoring audit for one session (Pro).

    Reuses the JSON detail route so the export and the API response cannot
    drift: same ownership scoping (other users' sessions and unknown
    sessions both 404), same Pro gate, same newest-kept-last windowing, and
    the same legacy-row coercion. The CSV adds one row per audit round,
    oldest-first, with nested JSON payloads flattened into compact JSON
    cells so spreadsheets can still join on round numbers.

    Follows the same defenses as the other CSV exports: its own per-user
    rate limit, RFC 4180 quoting with ``\\r\\n`` line endings, formula-
    injection defense via ``_csv_safe``, no-store caching, and
    ``X-Content-Type-Options: nosniff``. The session id is sanitized before
    it is embedded in the attachment filename so a crafted id cannot inject
    header bytes.
    """
    enforce_user_rate_limit(
        user.id,
        scope="analytics_scoring_audit_csv",
        limit=60,
        window_seconds=3600,
        message="Too many scoring audit exports. Limit is 60 per hour.",
    )

    payload = await analytics_scoring_audit_detail(
        session_id=session_id,
        user=user,
        db=db,
        limit=limit,
    )

    import csv
    import io
    import json
    import re

    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    header = [
        "round",
        "created_at",
        "prompt_snippet",
        "prompt_category",
        "winner_agent_id",
        "winner_persona_id",
        "winner_score",
        "scores_json",
        "criteria_breakdown_json",
        "confidence_values_json",
        "persona_ids_used",
        "scoring_duration_ms",
        "fallback_used",
    ]
    writer.writerow(header)
    for round_no, audit in enumerate(payload["audits"], start=1):
        writer.writerow(
            [
                round_no,
                _csv_safe(audit["created_at"] or ""),
                _csv_safe(audit["prompt_snippet"]),
                _csv_safe(audit["prompt_category"]),
                _csv_safe(audit["winner_agent_id"]),
                _csv_safe(audit["winner_persona_id"]),
                audit["winner_score"],
                _csv_safe(
                    json.dumps(
                        audit["scores"],
                        sort_keys=True,
                        separators=(",", ":"),
                    )
                ),
                _csv_safe(
                    json.dumps(
                        audit["criteria_breakdown"] or {},
                        sort_keys=True,
                        separators=(",", ":"),
                    )
                ),
                _csv_safe(
                    json.dumps(
                        audit["confidence_values"],
                        separators=(",", ":"),
                    )
                ),
                _csv_safe(json.dumps(audit["persona_ids_used"])),
                audit["scoring_duration_ms"]
                if audit["scoring_duration_ms"] is not None
                else "",
                "true" if audit["fallback_used"] else "false",
            ]
        )
    # Footer rollup so the file is self-describing about truncation. It is
    # padded to the header width so every record in the file has the same
    # number of fields (RFC 4180) — strict consumers reject ragged rows.
    writer.writerow(
        [
            f"# session_id={payload['session_id']}",
            f"audit_count={payload['audit_count']}",
            f"total_count={payload['total_count']}",
            *([""] * (len(header) - 3)),
        ]
    )

    safe_sid = re.sub(r"[^A-Za-z0-9._-]", "_", payload["session_id"])
    filename = f"arena-scoring-audit-{safe_sid}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
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
