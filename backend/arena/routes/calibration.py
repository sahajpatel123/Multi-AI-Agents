"""Confidence calibration: user ratings vs intelligence score."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required
from arena.core.rate_limits import enforce_user_rate_limit
from arena.database import get_db
from arena.db_models import AgentTask, ConfidenceRating
from arena.models.schemas import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["calibration"])

# Pagination upper bound for /history. Calibration ratings accumulate
# one per rated agent task; even an aggressive user won't realistically
# exceed this in a single page, but the cap protects against scripted
# scrapes.
CALIBRATION_HISTORY_MAX_PER_PAGE = 100


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
    enforce_user_rate_limit(
        user.id,
        scope="calibration_rate",
        limit=60,
        window_seconds=3600,
        message="Too many calibration ratings. Limit is 60 per hour.",
    )
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
    # 60/min/user — UI status badge hits this often; per-user cap.
    enforce_user_rate_limit(
        user.id,
        scope="calibration_stats",
        limit=60,
        window_seconds=60,
        message="Too many calibration stats reads. Please slow down.",
    )
    return JSONResponse(content=build_calibration_stats(db, user.id))


@router.get("/rating/{task_id}")
async def get_calibration_rating_for_task(
    task_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    # 60/min/user — UI loads this on hover/select.
    enforce_user_rate_limit(
        user.id,
        scope="calibration_rating_detail",
        limit=60,
        window_seconds=60,
        message="Too many calibration rating reads. Please slow down.",
    )
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


# ─── History, re-rate, and delete ────────────────────────────────────────────


def _serialize_rating(row: ConfidenceRating) -> dict:
    return {
        "id": row.id,
        "task_id": row.task_id,
        "user_rating": row.user_rating,
        "system_score": row.system_score,
        "delta": row.delta,
        "verdict": _verdict_for_delta(row.delta),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("/history")
async def list_calibration_history(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=CALIBRATION_HISTORY_MAX_PER_PAGE),
    min_delta: Optional[int] = Query(None, ge=-100, le=100, description="Filter: delta must be >= this (e.g., 0 shows overestimates only)."),
    max_delta: Optional[int] = Query(None, ge=-100, le=100, description="Filter: delta must be <= this (e.g., 0 shows underestimates only)."),
    sort: str = Query("newest", description="Sort mode: 'newest' (default), 'oldest', 'delta_asc', 'delta_desc'."),
) -> dict:
    """Paginated history of the caller's calibration ratings.

    Filters target the signed delta field: positive delta means the user
    UNDER-estimated the answer (system scored higher), negative means
    they overestimated. min/max bounds let the UI render 'show me only
    my underestimates' which is the actionable slice for the calibration
    game.
    """
    # 60/min/user — paginated history; same shape as /saved.
    enforce_user_rate_limit(
        user.id,
        scope="calibration_history",
        limit=60,
        window_seconds=60,
        message="Too many calibration history reads. Please slow down.",
    )
    q = db.query(ConfidenceRating).filter(ConfidenceRating.user_id == user.id)

    if min_delta is not None:
        q = q.filter(ConfidenceRating.delta >= min_delta)
    if max_delta is not None:
        q = q.filter(ConfidenceRating.delta <= max_delta)

    # Sort. Unknown values fall back to newest so a stale frontend can't
    # break the endpoint. 'delta_asc' = most-negative first (worst
    # overestimates at the top).
    if sort == "oldest":
        order_clauses = (ConfidenceRating.created_at.asc(),)
    elif sort == "delta_asc":
        order_clauses = (ConfidenceRating.delta.asc(), ConfidenceRating.created_at.desc())
    elif sort == "delta_desc":
        order_clauses = (ConfidenceRating.delta.desc(), ConfidenceRating.created_at.desc())
    else:
        order_clauses = (ConfidenceRating.created_at.desc(),)

    total = q.count()
    rows = (
        q.order_by(*order_clauses)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "ratings": [_serialize_rating(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page if per_page else 0,
        "filters": {"min_delta": min_delta, "max_delta": max_delta, "sort": sort},
    }


class RetractBody(BaseModel):
    """Body for POST /rate/{task_id}/retract — user changes their mind and
    re-rates. The old rating is replaced atomically so a user's history
    reflects exactly one rating per task."""
    rating: int = Field(..., ge=1, le=5)


@router.post("/rate/{task_id}/retract")
async def retract_and_rerate(
    task_id: str,
    body: RetractBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Replace an existing rating. Same rate limit as /rate so users can't
    script infinite overwrites."""
    enforce_user_rate_limit(
        user.id,
        scope="calibration_rate",
        limit=60,
        window_seconds=3600,
        message="Too many calibration ratings. Limit is 60 per hour.",
    )

    clean_id = task_id.strip()
    task = (
        db.query(AgentTask)
        .filter(AgentTask.task_id == clean_id, AgentTask.user_id == user.id)
        .first()
    )
    if not task:
        # Foreign-or-missing: same shape as the existing rate endpoint.
        raise HTTPException(status_code=404, detail="Task not found")

    existing = (
        db.query(ConfidenceRating)
        .filter(
            ConfidenceRating.user_id == user.id,
            ConfidenceRating.task_id == clean_id,
        )
        .first()
    )
    if existing is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_rated", "message": "No existing rating to retract"},
        )

    system_score = _system_score_from_task(task)
    user_scaled = int(body.rating) * 20
    delta = int(system_score - user_scaled)

    existing.user_rating = int(body.rating)
    existing.system_score = system_score
    existing.delta = delta
    db.add(existing)
    db.commit()
    db.refresh(existing)

    stats = build_calibration_stats(db, user.id)
    return {
        "status": "replaced",
        "id": existing.id,
        "delta": delta,
        "verdict": _verdict_for_delta(delta),
        "user_rating": existing.user_rating,
        "system_score": system_score,
        "calibration_stats": stats,
    }


@router.delete("/rating/{task_id}")
async def delete_calibration_rating(
    task_id: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Delete a single calibration rating. Foreign-or-missing ids return
    404 with the same shape so callers can't enumerate by status code."""
    enforce_user_rate_limit(
        user.id,
        scope="calibration_delete",
        limit=60,
        window_seconds=3600,
        message="Too many calibration deletes. Limit is 60 per hour.",
    )

    clean_id = task_id.strip()
    row = (
        db.query(ConfidenceRating)
        .filter(
            ConfidenceRating.user_id == user.id,
            ConfidenceRating.task_id == clean_id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Rating not found"},
        )
    db.delete(row)
    db.commit()
    return {"status": "deleted", "task_id": clean_id}
