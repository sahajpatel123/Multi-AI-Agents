"""User answer feedback stats and confidence-display calibration."""

from __future__ import annotations

from typing import Any, Dict, List

from sqlalchemy import func
from sqlalchemy.orm import Session

from arena.db_models import AgentTask, AnswerFeedback

try:  # Python 3.9+: keep imports minimal in module-level
    from datetime import timezone  # type: ignore
except ImportError:  # pragma: no cover - Python 3.11+
    from datetime import timezone  # type: ignore[no-redef]


def _feedback_counts_by_verdict(user_id: int, db: Session) -> dict[str, int]:
    return dict(
        db.query(AnswerFeedback.verdict, func.count(AnswerFeedback.id))
        .filter(AnswerFeedback.user_id == user_id)
        .group_by(AnswerFeedback.verdict)
        .all()
    )


def get_answer_feedback_distribution(user_id: int, db: Session) -> dict[str, int]:
    """Percent breakdown of verdicts for Profile / POST response."""
    counts = _feedback_counts_by_verdict(user_id, db)
    n = sum(counts.values())
    if n == 0:
        return {"total": 0, "correct_pct": 0, "partial_pct": 0, "wrong_pct": 0}
    c = counts.get("correct", 0)
    p = counts.get("partial", 0)
    w = counts.get("wrong", 0)
    return {
        "total": n,
        "correct_pct": round(100 * c / n),
        "partial_pct": round(100 * p / n),
        "wrong_pct": round(100 * w / n),
    }


def get_feedback_calibration(user_id: int, db: Session) -> Dict[str, Any]:
    """
    User-level stats used to adjust displayed confidence (not stored scores).
    """
    counts = _feedback_counts_by_verdict(user_id, db)
    n = sum(counts.values())
    if n < 5:
        return {
            "adjustment": 0,
            "reliable": False,
            "total_feedback": n,
            "wrong_rate": 0,
        }

    wrong_rate = counts.get("wrong", 0) / n
    partial_rate = counts.get("partial", 0) / n
    adjustment = int(round(-(wrong_rate * 15) - (partial_rate * 7)))

    return {
        "adjustment": adjustment,
        "total_feedback": n,
        "wrong_rate": round(wrong_rate * 100),
        "reliable": n >= 10,
    }


def get_recent_feedback(
    user_id: int,
    db: Session,
    limit: int = 20,
    verdict: str | None = None,
) -> List[Dict[str, Any]]:
    """Recent feedback events with task title and snippet for display.

    Joins AnswerFeedback to AgentTask so the consumer can show the
    question text next to each verdict. Tasks that have been deleted
    cascade with the feedback so the join will simply omit them — we
    still return the verdict row with title=None in that case so the
    consumer can decide how to render.

    ``verdict`` filters to one of the canonical values (``correct``,
    ``partial``, ``wrong``); unknown values return an empty list rather
    than matching nothing silently.
    """
    cap = max(1, min(int(limit), 200))

    q = (
        db.query(AnswerFeedback, AgentTask)
        .outerjoin(AgentTask, AnswerFeedback.task_id == AgentTask.task_id)
        .filter(AnswerFeedback.user_id == user_id)
    )
    if verdict is not None:
        if verdict in {"correct", "partial", "wrong"}:
            q = q.filter(AnswerFeedback.verdict == verdict)
        else:
            return []

    rows = (
        q.order_by(AnswerFeedback.created_at.desc())
        .limit(cap)
        .all()
    )
    def _coerce_created(value):
        iso = value.isoformat() if value else None
        # Tests rely on a timezone-bearing ISO string for naive-aware
        # datetimes; convert naive to UTC so the shape stays stable.
        if iso and value is not None and getattr(value, "tzinfo", None) is None:
            return value.replace(tzinfo=timezone.utc).isoformat()
        return iso

    return [
        {
            "task_id": fb.task_id,
            "verdict": fb.verdict,
            "note": fb.note,
            "created_at": _coerce_created(fb.created_at),
            "title": (task.title or "").strip() if task and task.title else None,
            "task_text": (task.task_text or "")[:160] if task and task.task_text else None,
        }
        for fb, task in rows
    ]
