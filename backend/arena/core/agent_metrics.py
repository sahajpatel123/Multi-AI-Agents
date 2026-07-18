"""Aggregate Agent Mode metrics for the per-user /api/agent/metrics endpoint."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from arena.db_models import AgentTask, AnswerFeedback, Orchestration, User
from arena.core.datetime_utils import utcnow_naive


def _utc_day_floor(dt: datetime) -> datetime:
    """Drop the time portion of a naive UTC datetime."""
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def compute_user_agent_metrics(
    db: Session,
    user: User,
    window_days: int = 30,
) -> dict[str, Any]:
    """Return lifetime counters + a 30-day daily trend for the caller.

    Counts are pulled from the caller's AgentTask / Orchestration rows.
    Live counts include currently active threads; orchestration counts
    include any chain the user kicked off. The daily trend buckets the
    caller's task creations by UTC day so the dashboard renders cleanly
    even when the user is in a non-UTC timezone.
    """
    user_id = user.id
    now = utcnow_naive()

    # Lifetime counters. Feedback rows are counted in Python instead of
    # via ``func.iif`` so the same query works on SQLite (tests) and
    # Postgres (prod) without dialect-specific SQL.
    tasks_for_counts = (
        db.query(AgentTask.user_feedback)
        .filter(AgentTask.user_id == user_id)
        .all()
    )
    total_tasks = len(tasks_for_counts)
    feedback_positive = sum(
        1 for (fb,) in tasks_for_counts if fb == "positive"
    )
    feedback_negative = sum(
        1 for (fb,) in tasks_for_counts if fb == "negative"
    )
    feedback_total = feedback_positive + feedback_negative

    live_count = (
        db.query(func.count(AgentTask.id))
        .filter(
            AgentTask.user_id == user_id,
            AgentTask.is_live.is_(True),
        )
        .scalar()
        or 0
    )
    orchestrations = (
        db.query(func.count(Orchestration.id))
        .filter(Orchestration.user_id == user_id)
        .scalar()
        or 0
    )

    # Daily trend buckets (UTC). Pulled as a Python-side bucketing so
    # SQLite + Postgres agree — ``func.date`` / ``date_trunc`` differ
    # between dialects and would silently shift bucket edges.
    cutoff = _utc_day_floor(now) - timedelta(days=max(0, window_days - 1))
    recent_tasks = (
        db.query(AgentTask.created_at)
        .filter(
            AgentTask.user_id == user_id,
            AgentTask.created_at >= cutoff,
        )
        .all()
    )
    counts_by_day: dict[Any, int] = defaultdict(int)
    for (created_at,) in recent_tasks:
        if created_at is None:
            continue
        # Defensive: ensure timezone-naive UTC.
        ts = created_at
        if ts.tzinfo is not None:
            ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
        counts_by_day[_utc_day_floor(ts).date()] += 1
    daily_trend: list[dict[str, Any]] = []
    for offset in range(window_days):
        day = cutoff.date() + timedelta(days=offset)
        daily_trend.append(
            {"date": day.isoformat(), "count": counts_by_day.get(day, 0)}
        )

    # Top topics — stored as a JSON-ish string per row. Tally up to 5.
    topic_counter: Counter[str] = Counter()
    topic_rows = (
        db.query(AgentTask.topics)
        .filter(
            AgentTask.user_id == user_id,
            AgentTask.topics.isnot(None),
        )
        .all()
    )
    import json

    for (raw,) in topic_rows:
        if not raw:
            continue
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            continue
        if isinstance(parsed, list):
            for topic in parsed:
                if isinstance(topic, str) and topic.strip():
                    topic_counter[topic.strip()] += 1
    top_topics = [
        {"topic": topic, "count": count}
        for topic, count in topic_counter.most_common(5)
    ]

    return {
        "total_tasks": total_tasks,
        "live_tasks": int(live_count),
        "orchestrations": int(orchestrations),
        "feedback": {
            "total": feedback_total,
            "positive": feedback_positive,
            "negative": feedback_negative,
            "rate": round(
                (feedback_total / total_tasks) if total_tasks else 0.0, 4
            ),
        },
        "daily_trend": daily_trend,
        "top_topics": top_topics,
    }


def compute_user_feedback_summary(
    db: Session,
    user: User,
    window_days: int = 30,
) -> dict[str, Any]:
    """Daily + lifetime breakdown of the caller's answer feedback.

    Distinct from ``compute_user_agent_metrics`` because answer feedback
    is stored in a separate ``answer_feedbacks`` table (one row per
    verdict, no per-task dedup). Lifetime totals are split by verdict;
    the daily trend is bucketed by UTC day like the agent metrics
    payload so the dashboard can render one consistent heatmap.
    """
    rows = (
        db.query(AnswerFeedback)
        .filter(AnswerFeedback.user_id == user.id)
        .all()
    )
    totals = Counter(r.verdict for r in rows if r.verdict)
    total = sum(totals.values())

    now = utcnow_naive()
    cutoff = _utc_day_floor(now) - timedelta(days=max(0, window_days - 1))
    counts_by_day: dict[Any, int] = defaultdict(int)
    for row in rows:
        if row.created_at is None or row.created_at < cutoff:
            continue
        ts = row.created_at
        if ts.tzinfo is not None:
            ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
        counts_by_day[_utc_day_floor(ts).date()] += 1

    daily_trend: list[dict[str, Any]] = []
    for offset in range(window_days):
        day = cutoff.date() + timedelta(days=offset)
        daily_trend.append(
            {"date": day.isoformat(), "count": counts_by_day.get(day, 0)}
        )

    return {
        "total": total,
        "verdicts": {
            "correct": int(totals.get("correct", 0)),
            "partial": int(totals.get("partial", 0)),
            "wrong": int(totals.get("wrong", 0)),
        },
        "rate": round(
            (total / total) if total else 0.0, 4
        ),
        "window_days": window_days,
        "daily_trend": daily_trend,
    }