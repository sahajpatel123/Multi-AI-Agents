"""User answer feedback stats and confidence-display calibration."""

from __future__ import annotations

from typing import Any, Dict

from sqlalchemy.orm import Session

from arena.db_models import AnswerFeedback


def get_answer_feedback_distribution(user_id: int, db: Session) -> dict[str, int]:
    """Percent breakdown of verdicts for Profile / POST response."""
    rows = db.query(AnswerFeedback).filter(AnswerFeedback.user_id == user_id).all()
    n = len(rows)
    if n == 0:
        return {"total": 0, "correct_pct": 0, "partial_pct": 0, "wrong_pct": 0}
    c = sum(1 for r in rows if r.verdict == "correct")
    p = sum(1 for r in rows if r.verdict == "partial")
    w = sum(1 for r in rows if r.verdict == "wrong")
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
    records = db.query(AnswerFeedback).filter(AnswerFeedback.user_id == user_id).all()
    n = len(records)
    if n < 5:
        return {
            "adjustment": 0,
            "reliable": False,
            "total_feedback": n,
            "wrong_rate": 0,
        }

    wrong_rate = len([r for r in records if r.verdict == "wrong"]) / n
    partial_rate = len([r for r in records if r.verdict == "partial"]) / n
    adjustment = int(round(-(wrong_rate * 15) - (partial_rate * 7)))

    return {
        "adjustment": adjustment,
        "total_feedback": n,
        "wrong_rate": round(wrong_rate * 100),
        "reliable": n >= 10,
    }
