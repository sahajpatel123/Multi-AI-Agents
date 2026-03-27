"""Confidence calibration: user ratings vs intelligence score."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from arena.core.auth import get_current_user_required
from arena.database import get_db
from arena.db_models import AgentTask, ConfidenceRating
from arena.models.schemas import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["calibration"])


def _verdict_for_delta(delta: int) -> str:
    if abs(delta) <= 10:
        return "Well calibrated"
    if delta > 10:
        return "You underestimated this answer"
    return "You overestimated this answer"


def _system_score_from_task(row: AgentTask) -> int:
    raw = row.intelligence_score
    if isinstance(raw, dict):
        try:
            return int(raw.get("total_score") or 0)
        except (TypeError, ValueError):
            pass
    if isinstance(raw, str) and raw.strip():
        try:
            d = json.loads(raw)
            return int(d.get("total_score") or 0)
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    try:
        return int(row.final_score or 0)
    except (TypeError, ValueError):
        return 0


def build_calibration_stats(db: Session, user_id: int) -> dict[str, Any]:
    rows = (
        db.query(ConfidenceRating)
        .filter(ConfidenceRating.user_id == user_id)
        .order_by(ConfidenceRating.created_at.asc())
        .all()
    )
    deltas = [int(r.delta) for r in rows]
    n = len(deltas)
    if n == 0:
        return {
            "total_ratings": 0,
            "avg_delta": 0.0,
            "trend": "stable",
            "calibration_score": 100,
            "recent_ratings": [],
        }

    avg_delta = sum(deltas) / n
    avg_abs = sum(abs(d) for d in deltas) / n
    calibration_score = max(0, int(100 - avg_abs))

    trend = "stable"
    if n >= 10:
        last5 = deltas[-5:]
        prev5 = deltas[-10:-5]
        avg_l = sum(last5) / 5
        avg_p = sum(prev5) / 5
        if abs(avg_l) < abs(avg_p) - 2:
            trend = "improving"
        elif abs(avg_l) > abs(avg_p) + 2:
            trend = "diverging"
    elif n >= 6:
        last3 = deltas[-3:]
        mid3 = deltas[-6:-3]
        if abs(sum(last3) / 3) < abs(sum(mid3) / 3) - 2:
            trend = "improving"
        elif abs(sum(last3) / 3) > abs(sum(mid3) / 3) + 2:
            trend = "diverging"

    recent = rows[-5:]
    recent_ratings = [
        {"delta": int(r.delta), "created_at": r.created_at.isoformat() if r.created_at else ""}
        for r in recent
    ]

    return {
        "total_ratings": n,
        "avg_delta": round(avg_delta, 2),
        "trend": trend,
        "calibration_score": calibration_score,
        "recent_ratings": recent_ratings,
    }


class RateBody(BaseModel):
    task_id: str = Field(..., min_length=8, max_length=64)
    rating: int = Field(..., ge=1, le=5)


@router.post("/rate")
async def post_calibration_rate(
    body: RateBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    task = (
        db.query(AgentTask)
        .filter(AgentTask.task_id == body.task_id.strip(), AgentTask.user_id == user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    existing = (
        db.query(ConfidenceRating)
        .filter(
            ConfidenceRating.user_id == user.id,
            ConfidenceRating.task_id == body.task_id.strip(),
        )
        .first()
    )
    if existing:
        stats = build_calibration_stats(db, user.id)
        return JSONResponse(
            status_code=200,
            content={
                "already_rated": True,
                "delta": existing.delta,
                "verdict": _verdict_for_delta(existing.delta),
                "user_rating": existing.user_rating,
                "system_score": existing.system_score,
                "calibration_stats": stats,
            },
        )

    system_score = _system_score_from_task(task)
    user_scaled = int(body.rating) * 20
    delta = int(system_score - user_scaled)

    row = ConfidenceRating(
        user_id=user.id,
        task_id=body.task_id.strip(),
        user_rating=int(body.rating),
        system_score=system_score,
        delta=delta,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(ConfidenceRating)
            .filter(
                ConfidenceRating.user_id == user.id,
                ConfidenceRating.task_id == body.task_id.strip(),
            )
            .first()
        )
        if not existing:
            raise HTTPException(status_code=500, detail="Could not save rating") from None
        stats = build_calibration_stats(db, user.id)
        return JSONResponse(
            content={
                "already_rated": True,
                "delta": existing.delta,
                "verdict": _verdict_for_delta(existing.delta),
                "user_rating": existing.user_rating,
                "system_score": existing.system_score,
                "calibration_stats": stats,
            }
        )

    db.refresh(row)
    stats = build_calibration_stats(db, user.id)
    return JSONResponse(
        content={
            "already_rated": False,
            "delta": delta,
            "verdict": _verdict_for_delta(delta),
            "user_rating": int(body.rating),
            "system_score": system_score,
            "calibration_stats": stats,
        }
    )


@router.get("/stats")
async def get_calibration_stats(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    return JSONResponse(content=build_calibration_stats(db, user.id))


@router.get("/rating/{task_id}")
async def get_calibration_rating_for_task(
    task_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ConfidenceRating)
        .filter(
            ConfidenceRating.user_id == user.id,
            ConfidenceRating.task_id == task_id.strip(),
        )
        .first()
    )
    if not row:
        return JSONResponse(content={"rated": False, "data": None})
    return JSONResponse(
        content={
            "rated": True,
            "data": {
                "user_rating": row.user_rating,
                "system_score": row.system_score,
                "delta": row.delta,
                "verdict": _verdict_for_delta(row.delta),
                "created_at": row.created_at.isoformat() if row.created_at else "",
            },
        }
    )
