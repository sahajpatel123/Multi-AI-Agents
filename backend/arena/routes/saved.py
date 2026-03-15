"""Saved responses routes."""

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from arena.core.auth import get_current_user_required
from arena.database import get_db
from arena.db_models import SavedResponse
from arena.models.schemas import UserResponse

router = APIRouter(tags=["saved"])


class SavedRequest(BaseModel):
    session_id: str
    agent_id: str
    persona_id: str
    persona_name: str
    persona_color: str
    prompt: str
    one_liner: str
    verdict: str
    score: int | None = None
    confidence: int | None = None


@router.get("/saved")
async def get_saved(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.query(SavedResponse)
        .filter(SavedResponse.user_id == user.id)
        .order_by(SavedResponse.saved_at.desc())
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
    row = db.query(SavedResponse).filter(SavedResponse.id == saved_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": "Saved response not found"})
    if row.user_id != user.id:
        raise HTTPException(status_code=403, detail={"error": "forbidden", "message": "Saved response does not belong to this user"})
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": saved_id}
