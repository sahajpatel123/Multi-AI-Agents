"""Saved responses routes.

Security:
- Feature-gated to Plus/Pro.
- Field lengths aligned with DB columns so inserts cannot 500 on oversize.
- Per-user cap + rate limit so authenticated spam cannot fill saved_responses.
- Delete uses scoped lookup (404 for missing *and* foreign rows) so IDs
  cannot be enumerated via 403 vs 404.
"""

from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required
from arena.core.input_validation import sanitize_model_text
from arena.core.rate_limits import enforce_user_rate_limit
from arena.core.tier_config import get_tier_str, has_feature, normalize_tier
from arena.database import get_db
from arena.db_models import SavedResponse
from arena.models.schemas import UserResponse

router = APIRouter(tags=["saved"])

# Hard cap on stored takes per user (UI already treats this as a personal list).
SAVED_MAX_PER_USER = 200


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


@router.get("/saved")
async def get_saved(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> list[dict]:
    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        return []

    rows = (
        db.query(SavedResponse)
        .filter(SavedResponse.user_id == user.id)
        .order_by(SavedResponse.saved_at.desc())
        .limit(SAVED_MAX_PER_USER)
        .all()
    )
    return [
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
