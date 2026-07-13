"""Persona library routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from arena.database import get_db
from arena.db_models import PersonaLibrary

router = APIRouter(tags=["personas"])


@router.get("/personas")
async def list_personas(db: Session = Depends(get_db)) -> list[dict]:
    personas = db.query(PersonaLibrary).order_by(PersonaLibrary.display_order.asc()).all()
    return [
        {
            "persona_id": persona.persona_id,
            "name": persona.name,
            "color": persona.color,
            "bg_tint": persona.bg_tint,
            "quote": persona.quote,
            "description": persona.description,
            "temperature": persona.temperature,
            "provider": persona.provider,
            "is_locked": persona.is_locked,
            "display_order": persona.display_order,
        }
        for persona in personas
    ]
