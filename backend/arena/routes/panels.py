"""User panel persistence routes."""

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from arena.core.auth import get_current_user_required
from arena.core.tier_config import normalize_tier, validate_persona_access
from arena.database import get_db
from arena.db_models import PersonaLibrary, UserPanel
from arena.models.schemas import UserResponse

router = APIRouter(tags=["panel"])

DEFAULT_PANEL = {
    "slot_1": "analyst",
    "slot_2": "philosopher",
    "slot_3": "pragmatist",
    "slot_4": "contrarian",
}


class PanelSaveRequest(BaseModel):
    slot_1: str
    slot_2: str
    slot_3: str
    slot_4: str


def _get_or_create_panel(user_id: int, db: Session) -> UserPanel:
    panel = db.query(UserPanel).filter(UserPanel.user_id == user_id).first()
    if panel:
        return panel

    panel = UserPanel(user_id=user_id, **DEFAULT_PANEL)
    db.add(panel)
    db.commit()
    db.refresh(panel)
    return panel


@router.get("/panel")
async def get_panel(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    panel = _get_or_create_panel(user.id, db)
    return {
        "slot_1": panel.slot_1,
        "slot_2": panel.slot_2,
        "slot_3": panel.slot_3,
        "slot_4": panel.slot_4,
    }


@router.post("/panel/save")
async def save_panel(
    body: PanelSaveRequest,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    values = [body.slot_1, body.slot_2, body.slot_3, body.slot_4]
    if len(set(values)) != 4:
        raise HTTPException(status_code=422, detail={"error": "validation_error", "message": "Panel cannot contain duplicate persona_ids"})

    valid_persona_ids = {
        row.persona_id
        for row in db.query(PersonaLibrary.persona_id).all()
    }
    invalid = [value for value in values if value not in valid_persona_ids]
    if invalid:
        raise HTTPException(status_code=422, detail={"error": "validation_error", "message": f"Invalid persona_id(s): {', '.join(invalid)}"})

    is_allowed, blocked = validate_persona_access(normalize_tier(user.tier), values)
    if not is_allowed:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "persona_not_allowed",
                "message": "Some personas in your panel require a Plus or Pro subscription.",
                "blocked_personas": blocked,
                "upgrade_required": "plus",
            },
        )

    panel = _get_or_create_panel(user.id, db)
    panel.slot_1 = body.slot_1
    panel.slot_2 = body.slot_2
    panel.slot_3 = body.slot_3
    panel.slot_4 = body.slot_4
    db.add(panel)
    db.commit()
    db.refresh(panel)

    return {
        "status": "saved",
        "panel": {
            "slot_1": panel.slot_1,
            "slot_2": panel.slot_2,
            "slot_3": panel.slot_3,
            "slot_4": panel.slot_4,
        },
    }
