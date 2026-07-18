"""User panel persistence routes."""


from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required
from arena.core.rate_limits import enforce_user_rate_limit
from arena.core.tier_config import get_tier_str, normalize_tier, validate_persona_access
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

# Curated starter panels. The UI surfaces these as one-click options so a
# new user can pick "Stress-test" or "Build it" instead of dragging 4
# personas onto the canvas. Slots are intentionally not duplicated within
# a preset — a panel of 4 with no repeats is the universal invariant.
#
# Each preset is named for the cognitive mode it embodies, not the
# personas it contains — so a future persona swap in any slot doesn't
# silently rename the preset.
PANEL_PRESETS: dict[str, dict] = {
    "default": {
        "slot_1": "analyst",
        "slot_2": "philosopher",
        "slot_3": "pragmatist",
        "slot_4": "contrarian",
    },
    "stress_test": {
        "slot_1": "analyst",
        "slot_2": "contrarian",
        "slot_3": "devilsadvocate",
        "slot_4": "scientist",
    },
    "build_it": {
        "slot_1": "engineer",
        "slot_2": "pragmatist",
        "slot_3": "firstprinciples",
        "slot_4": "optimist",
    },
    "long_view": {
        "slot_1": "historian",
        "slot_2": "futurist",
        "slot_3": "strategist",
        "slot_4": "stoic",
    },
    "human_centered": {
        "slot_1": "empath",
        "slot_2": "ethicist",
        "slot_3": "philosopher",
        "slot_4": "optimist",
    },
}


class PanelSaveRequest(BaseModel):
    slot_1: str
    slot_2: str
    slot_3: str
    slot_4: str

    @field_validator("slot_1", "slot_2", "slot_3", "slot_4")
    @classmethod
    def validate_slot(cls, v: str) -> str:
        # Persona ids are short identifier strings — strip whitespace and
        # bound the length so a UI bug can't insert a 100KB blob.
        v = (v or "").strip()
        if not v:
            raise ValueError("slot cannot be empty")
        if len(v) > 50:
            raise ValueError("slot exceeds 50 chars")
        return v


class PanelPatchRequest(BaseModel):
    """Body for PATCH /panel — change exactly one slot without resending
    the other three. Reduces round-trips and race conditions when the UI
    updates a single persona in place (e.g., drag-replace)."""
    slot: str = Field(..., pattern=r"^slot_[1-4]$")
    persona_id: str

    @field_validator("persona_id")
    @classmethod
    def validate_persona(cls, v: str) -> str:
        v = (v or "").strip()
        if not v or len(v) > 50:
            raise ValueError("persona_id invalid")
        return v


def _panel_to_dict(panel: UserPanel) -> dict:
    return {
        "slot_1": panel.slot_1,
        "slot_2": panel.slot_2,
        "slot_3": panel.slot_3,
        "slot_4": panel.slot_4,
    }


def _validate_panel(values: list[str], user: UserResponse, db: Session) -> None:
    """Shared invariant checks for every write path: no duplicates, all
    ids valid, all ids allowed for the user's tier. Raises HTTPException
    on the first violation so error responses stay shape-consistent."""
    if len(set(values)) != len(values):
        raise HTTPException(
            status_code=422,
            detail={"error": "validation_error", "message": "Panel cannot contain duplicate persona_ids"},
        )

    valid_persona_ids = {
        row.persona_id
        for row in db.query(PersonaLibrary.persona_id).all()
    }
    invalid = [v for v in values if v not in valid_persona_ids]
    if invalid:
        raise HTTPException(
            status_code=422,
            detail={"error": "validation_error", "message": f"Invalid persona_id(s): {', '.join(invalid)}"},
        )

    is_allowed, blocked = validate_persona_access(
        normalize_tier(get_tier_str(user)), values
    )
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
    return _panel_to_dict(panel)


@router.get("/panel/presets")
async def list_panel_presets(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """List curated panel presets, filtered by the user's tier.

    A preset that contains a persona the user can't unlock yet is still
    returned (so they can preview it and see the upgrade path), but its
    ``available_for_tier`` flag is false and ``blocked_personas`` lists
    the paywalled slots. The UI can render locked presets with an upgrade
    badge rather than hiding them entirely.
    """
    tier = normalize_tier(get_tier_str(user))
    presets = []
    for name, slots in PANEL_PRESETS.items():
        values = list(slots.values())
        is_allowed, blocked = validate_persona_access(tier, values)
        presets.append({
            "name": name,
            "panel": slots,
            "available_for_tier": is_allowed,
            "blocked_personas": blocked,
        })
    return {"presets": presets, "total": len(presets)}


@router.post("/panel/preset/{name}")
async def apply_panel_preset(
    name: str,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """One-shot apply a curated preset. Same validation as a manual save:
    404 if the preset name is unknown, 403 if any persona is paywalled."""
    if name not in PANEL_PRESETS:
        raise HTTPException(
            status_code=404,
            detail={"error": "preset_not_found", "preset": name},
        )
    enforce_user_rate_limit(
        user.id,
        scope="panel_save",
        limit=60,
        window_seconds=3600,
        message="Too many panel saves. Limit is 60 per hour.",
    )
    slots = PANEL_PRESETS[name]
    _validate_panel(list(slots.values()), user, db)

    panel = _get_or_create_panel(user.id, db)
    panel.slot_1 = slots["slot_1"]
    panel.slot_2 = slots["slot_2"]
    panel.slot_3 = slots["slot_3"]
    panel.slot_4 = slots["slot_4"]
    db.add(panel)
    db.commit()
    db.refresh(panel)
    return {"status": "saved", "preset": name, "panel": _panel_to_dict(panel)}


@router.post("/panel/save")
async def save_panel(
    body: PanelSaveRequest,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    # Bound write chatter (save spam / DB churn).
    enforce_user_rate_limit(
        user.id,
        scope="panel_save",
        limit=60,
        window_seconds=3600,
        message="Too many panel saves. Limit is 60 per hour.",
    )
    values = [body.slot_1, body.slot_2, body.slot_3, body.slot_4]
    _validate_panel(values, user, db)

    panel = _get_or_create_panel(user.id, db)
    panel.slot_1 = body.slot_1
    panel.slot_2 = body.slot_2
    panel.slot_3 = body.slot_3
    panel.slot_4 = body.slot_4
    db.add(panel)
    db.commit()
    db.refresh(panel)

    return {"status": "saved", "panel": _panel_to_dict(panel)}


@router.patch("/panel")
async def patch_panel(
    body: PanelPatchRequest,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Change exactly one slot. Resends the other three implicitly so the
    duplicate check still holds — a drag-replace shouldn't silently let a
    user end up with two of the same persona."""
    enforce_user_rate_limit(
        user.id,
        scope="panel_save",
        limit=60,
        window_seconds=3600,
        message="Too many panel saves. Limit is 60 per hour.",
    )
    panel = _get_or_create_panel(user.id, db)
    proposed = [
        body.persona_id if body.slot == f"slot_{i}" else getattr(panel, f"slot_{i}")
        for i in range(1, 5)
    ]
    _validate_panel(proposed, user, db)
    setattr(panel, body.slot, body.persona_id)
    db.add(panel)
    db.commit()
    db.refresh(panel)
    return {"status": "saved", "panel": _panel_to_dict(panel), "changed_slot": body.slot}


@router.delete("/panel")
async def reset_panel(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Reset to DEFAULT_PANEL. Same effect as applying the 'default' preset,
    but a UI "Reset" button should map to a destructive HTTP verb for
    clarity — a GET that mutates would surprise the user."""
    enforce_user_rate_limit(
        user.id,
        scope="panel_save",
        limit=60,
        window_seconds=3600,
        message="Too many panel saves. Limit is 60 per hour.",
    )
    panel = _get_or_create_panel(user.id, db)
    panel.slot_1 = DEFAULT_PANEL["slot_1"]
    panel.slot_2 = DEFAULT_PANEL["slot_2"]
    panel.slot_3 = DEFAULT_PANEL["slot_3"]
    panel.slot_4 = DEFAULT_PANEL["slot_4"]
    db.add(panel)
    db.commit()
    db.refresh(panel)
    return {"status": "reset", "panel": _panel_to_dict(panel)}
