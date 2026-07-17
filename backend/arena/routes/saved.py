"""Saved responses routes.

Security:
- Feature-gated to Plus/Pro.
- Field lengths aligned with DB columns so inserts cannot 500 on oversize.
- Per-user cap + rate limit so authenticated spam cannot fill saved_responses.
- Delete uses scoped lookup (404 for missing *and* foreign rows) so IDs
  cannot be enumerated via 403 vs 404.

Functionality:
- GET /saved supports search (prompt + one_liner substring), persona_id
  filter, score filter (min_score), pagination, and sort modes (newest /
  oldest / score).
- DELETE /saved/bulk accepts a JSON list of ids for one-shot cleanup.
"""

from typing import Optional

from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required
from arena.core.input_validation import sanitize_model_optional_text, sanitize_model_text
from arena.core.rate_limits import enforce_user_rate_limit
from arena.core.tier_config import get_tier_str, has_feature, normalize_tier
from arena.database import get_db
from arena.db_models import SavedResponse
from arena.models.schemas import UserResponse

router = APIRouter(tags=["saved"])

# Hard cap on stored takes per user (UI already treats this as a personal list).
SAVED_MAX_PER_USER = 200

# Bulk delete cap — even a power user shouldn't be able to wipe their whole
# library in a single click; 50 is enough for the "select all visible" UI
# pattern without becoming a footgun.
SAVED_BULK_DELETE_MAX = 50


def _escape_like(value: str) -> str:
    """Escape SQL LIKE wildcards. % and _ are wildcards; without escaping,
    a user typing '100%' would match every row."""
    return (
        value.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


class SavedRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=36)
    agent_id: str = Field(..., min_length=1, max_length=20)
    persona_id: str = Field(..., min_length=1, max_length=50)
    persona_name: str = Field(..., min_length=1, max_length=255)
    persona_color: str = Field(..., min_length=1, max_length=20)
    prompt: str = Field(..., min_length=1, max_length=1000)
    one_liner: str = Field(..., min_length=1, max_length=1000)
    # Text column — still bound so a single body cannot dump multi-MB prose
    # if the global request-size middleware is ever raised for this path.
    verdict: str = Field(..., min_length=1, max_length=20000)
    score: int | None = Field(None, ge=0, le=100)
    confidence: int | None = Field(None, ge=0, le=100)

    @field_validator(
        "session_id",
        "agent_id",
        "persona_id",
        "persona_name",
        "persona_color",
        "prompt",
        "one_liner",
        "verdict",
    )
    @classmethod
    def strip_required(cls, v: str, info) -> str:
        # persona_name / color may include spaces; use text sanitizer not html strip.
        max_len = {
            "session_id": 36,
            "agent_id": 20,
            "persona_id": 50,
            "persona_name": 255,
            "persona_color": 20,
            "prompt": 1000,
            "one_liner": 1000,
            "verdict": 20000,
        }[info.field_name]
        return sanitize_model_text(v, max_length=max_len, field_name=info.field_name)


class BulkDeleteRequest(BaseModel):
    """Body schema for DELETE /saved/bulk. IDs not owned by the caller
    are silently ignored (no existence oracle)."""
    ids: list[int] = Field(..., min_length=1, max_length=SAVED_BULK_DELETE_MAX)


@router.get("/saved")
async def get_saved(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=SAVED_MAX_PER_USER),
    search: Optional[str] = Query(None, max_length=100, description="Case-insensitive substring match on prompt + one_liner."),
    persona_id: Optional[str] = Query(None, max_length=50, description="Restrict to one persona."),
    min_score: Optional[int] = Query(None, ge=0, le=100, description="Minimum score (inclusive)."),
    sort: str = Query("newest", description="Sort mode: 'newest' (default), 'oldest', or 'score'."),
) -> dict:
    """List saved responses with optional search, filter, sort, pagination.

    Returns an envelope {items, total, page, per_page, total_pages, filters}
    so the UI can render pagination controls and a filter summary without
    inferring state. Free-tier users still see an empty list (not 403) —
    don't break the silent-gate contract that the existing /saved endpoint
    established.
    """
    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        return {
            "items": [],
            "total": 0,
            "page": 1,
            "per_page": per_page,
            "total_pages": 0,
            "filters": {"search": None, "persona_id": None, "min_score": None, "sort": "newest"},
        }

    q = db.query(SavedResponse).filter(SavedResponse.user_id == user.id)

    if search:
        # Bound via Query(max_length=100) AND sanitize again — defense in
        # depth so a malformed query string can't sneak a 10KB payload
        # through to the LIKE scan.
        safe = sanitize_model_optional_text(search, max_length=100, field_name="search")
        if safe:
            pattern = f"%{_escape_like(safe)}%"
            q = q.filter(
                or_(
                    SavedResponse.prompt.ilike(pattern, escape="\\"),
                    SavedResponse.one_liner.ilike(pattern, escape="\\"),
                )
            )

    if persona_id:
        # Exact match — persona_id is a closed enum string, not free text.
        q = q.filter(SavedResponse.persona_id == persona_id)

    if min_score is not None:
        q = q.filter(SavedResponse.score >= min_score)

    # Sort. Unknown values fall back to newest so a stale frontend can't
    # break the endpoint; 'score' puts nulls last so untested takes don't
    # sink the top of "show me my best answers".
    if sort == "oldest":
        order_clauses = (SavedResponse.saved_at.asc(),)
    elif sort == "score":
        order_clauses = (
            SavedResponse.score.desc().nullslast(),
            SavedResponse.saved_at.desc(),
        )
    else:
        order_clauses = (SavedResponse.saved_at.desc(),)

    total = q.count()
    rows = (
        q.order_by(*order_clauses)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    items = [
        {
            "id": row.id,
            "session_id": row.session_id,
            "agent_id": row.agent_id,
            "persona_id": row.persona_id,
            "persona_name": row.persona_name,
            "persona_color": row.persona_color,
            "prompt": row.prompt,
            "one_liner": row.one_liner,
            "verdict": row.verdict,
            "score": row.score,
            "confidence": row.confidence,
            "saved_at": row.saved_at.isoformat() if row.saved_at else None,
        }
        for row in rows
    ]

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page if per_page else 0,
        "filters": {
            "search": search,
            "persona_id": persona_id,
            "min_score": min_score,
            "sort": sort,
        },
    }


@router.post("/saved")
async def save_response(
    body: SavedRequest,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_allowed",
                "message": "Saved responses require a Plus or Pro subscription.",
                "upgrade_required": "plus",
            },
        )

    enforce_user_rate_limit(
        user.id,
        scope="saved_create",
        limit=60,
        window_seconds=3600,
        message="Too many saved takes. Limit is 60 per hour.",
    )

    existing = (
        db.query(SavedResponse)
        .filter(
            SavedResponse.user_id == user.id,
            SavedResponse.session_id == body.session_id,
            SavedResponse.agent_id == body.agent_id,
        )
        .first()
    )
    if existing:
        return {"status": "saved", "id": existing.id}

    count = (
        db.query(SavedResponse)
        .filter(SavedResponse.user_id == user.id)
        .count()
    )
    if int(count) >= SAVED_MAX_PER_USER:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "saved_limit_reached",
                "message": (
                    f"Saved takes limit reached ({SAVED_MAX_PER_USER}). "
                    "Delete some before saving more."
                ),
                "active_cap": SAVED_MAX_PER_USER,
            },
        )

    row = SavedResponse(
        user_id=user.id,
        session_id=body.session_id,
        agent_id=body.agent_id,
        persona_id=body.persona_id,
        persona_name=body.persona_name,
        persona_color=body.persona_color,
        prompt=body.prompt,
        one_liner=body.one_liner,
        verdict=body.verdict,
        score=body.score,
        confidence=body.confidence,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "saved", "id": row.id}


@router.delete("/saved/bulk")
async def delete_saved_bulk(
    body: BulkDeleteRequest,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Bulk delete — for the 'select all visible' cleanup pattern.

    Foreign ids (not owned by the caller) are silently dropped from the
    delete set. The response reports requested / deleted counts so the UI
    can show a partial-success message if a stale page referenced ids
    another user has since claimed.
    """
    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_allowed",
                "message": "Saved responses require a Plus or Pro subscription.",
                "upgrade_required": "plus",
            },
        )

    # Deduplicate within the request — a UI bug that double-fires the same
    # id shouldn't double-count in the response.
    unique_ids = list(dict.fromkeys(body.ids))
    requested = len(unique_ids)

    # Scope by owner so we never delete another user's rows even if a UI
    # bug hands us foreign ids.
    deleted = (
        db.query(SavedResponse)
        .filter(
            SavedResponse.id.in_(unique_ids),
            SavedResponse.user_id == user.id,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return {
        "status": "deleted",
        "requested": requested,
        "deleted": int(deleted or 0),
    }


@router.delete("/saved/{saved_id}")
async def delete_saved(
    saved_id: int,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_allowed",
                "message": "Saved responses require a Plus or Pro subscription.",
                "upgrade_required": "plus",
            },
        )

    # Scope by owner so foreign IDs are indistinguishable from missing ones
    # (no 403 existence oracle).
    row = (
        db.query(SavedResponse)
        .filter(SavedResponse.id == saved_id, SavedResponse.user_id == user.id)
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Saved response not found"},
        )
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": saved_id}
