"""Export presets routes.

Allows users to save and reuse export configurations for saved responses.

Security:
- Feature-gated to Plus/Pro (same as saved responses).
- Per-user scoping - users can only access their own presets.
- Name length validation to prevent abuse.
- Rate limiting on creation/deletion.
"""

from typing import Optional
from datetime import datetime

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required
from arena.core.input_validation import sanitize_model_text
from arena.core.rate_limits import enforce_user_rate_limit
from arena.core.tier_config import get_tier_str, has_feature, normalize_tier
from arena.database import get_db
from arena.db_models import ExportPreset, User
from arena.models.schemas import UserResponse

router = APIRouter(tags=["export_presets"])

# Max presets per user to prevent abuse
EXPORT_PRESETS_MAX_PER_USER = 50


class ExportPresetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    preset_type: str = Field(default="saved", min_length=1, max_length=20)
    format: str = Field(default="csv", min_length=1, max_length=10)
    search: Optional[str] = Field(None, max_length=100)
    persona_id: Optional[str] = Field(None, max_length=50)
    min_score: Optional[int] = Field(None, ge=0, le=100)
    sort: str = Field(default="newest", min_length=1, max_length=20)
    position: Optional[int] = Field(None, ge=0, le=999)
    is_default: bool = Field(default=False)


class ExportPresetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    format: Optional[str] = Field(None, min_length=1, max_length=10)
    search: Optional[str] = Field(None, max_length=100)
    persona_id: Optional[str] = Field(None, max_length=50)
    min_score: Optional[int] = Field(None, ge=0, le=100)
    sort: Optional[str] = Field(None, min_length=1, max_length=20)
    position: Optional[int] = Field(None, ge=0, le=999)
    is_default: Optional[bool] = Field(None)


@router.get("/export-presets")
async def list_export_presets(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """List all export presets for the current user."""
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_list",
        limit=60,
        window_seconds=60,
        message="Too many export preset list requests. Please slow down.",
    )
    
    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        return {"presets": [], "total": 0}
    
    presets = (
        db.query(ExportPreset)
        .filter(ExportPreset.user_id == user.id)
        .order_by(ExportPreset.position.asc(), ExportPreset.updated_at.desc())
        .all()
    )
    
    return {
        "presets": [
            {
                "id": p.id,
                "name": p.name,
                "preset_type": p.preset_type,
                "format": p.format,
                "search": p.search,
                "persona_id": p.persona_id,
                "min_score": p.min_score,
                "sort": p.sort,
                "position": p.position,
                "is_default": p.is_default,
                "last_used_at": p.last_used_at.isoformat() if p.last_used_at else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in presets
        ],
        "total": len(presets),
    }


@router.post("/export-presets")
async def create_export_preset(
    body: ExportPresetCreate,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Create a new export preset."""
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_create",
        limit=30,
        window_seconds=60,
        message="Too many export preset creations. Please slow down.",
    )
    
    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_allowed",
                "message": "Export presets require Plus or Pro subscription.",
                "upgrade_required": "plus",
            },
        )
    
    # Check existing count
    existing_count = (
        db.query(ExportPreset)
        .filter(ExportPreset.user_id == user.id)
        .count()
    )
    
    if existing_count >= EXPORT_PRESETS_MAX_PER_USER:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "preset_limit_reached",
                "message": f"Export preset limit reached ({EXPORT_PRESETS_MAX_PER_USER}). Delete some before creating more.",
                "active_cap": EXPORT_PRESETS_MAX_PER_USER,
            },
        )
    
    # Sanitize inputs
    name = sanitize_model_text(body.name, max_length=100, field_name="name")
    
    # If this is set as default, un-set any existing default preset for this user
    if body.is_default:
        db.query(ExportPreset).filter(
            ExportPreset.user_id == user.id,
            ExportPreset.is_default == True,
        ).update({"is_default": False})
    
    # If no position specified, set it to the next available position
    position = body.position
    if position is None:
        max_position = (
            db.query(ExportPreset)
            .filter(ExportPreset.user_id == user.id)
            .order_by(ExportPreset.position.desc())
            .first()
        )
        position = (max_position.position + 1) if max_position else 0
    
    preset = ExportPreset(
        user_id=user.id,
        name=name,
        preset_type=body.preset_type,
        format=body.format,
        search=body.search,
        persona_id=body.persona_id,
        min_score=body.min_score,
        sort=body.sort,
        position=position,
        is_default=body.is_default,
    )
    
    db.add(preset)
    db.commit()
    db.refresh(preset)
    
    return {
        "status": "created",
        "id": preset.id,
        "name": preset.name,
        "preset_type": preset.preset_type,
        "format": preset.format,
        "search": preset.search,
        "persona_id": preset.persona_id,
        "min_score": preset.min_score,
        "sort": preset.sort,
        "position": preset.position,
        "is_default": preset.is_default,
        "last_used_at": preset.last_used_at.isoformat() if preset.last_used_at else None,
        "created_at": preset.created_at.isoformat(),
        "updated_at": preset.updated_at.isoformat(),
    }


@router.get("/export-presets/default")
async def get_default_export_preset(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Get the default export preset for the current user."""
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_default",
        limit=60,
        window_seconds=60,
        message="Too many default preset requests. Please slow down.",
    )
    
    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        return None
    
    preset = (
        db.query(ExportPreset)
        .filter(
            ExportPreset.user_id == user.id,
            ExportPreset.is_default == True,
        )
        .first()
    )
    
    if preset is None:
        return None
    
    return {
        "id": preset.id,
        "name": preset.name,
        "preset_type": preset.preset_type,
        "format": preset.format,
        "search": preset.search,
        "persona_id": preset.persona_id,
        "min_score": preset.min_score,
        "sort": preset.sort,
        "position": preset.position,
        "is_default": preset.is_default,
        "last_used_at": preset.last_used_at.isoformat() if preset.last_used_at else None,
        "created_at": preset.created_at.isoformat(),
        "updated_at": preset.updated_at.isoformat(),
    }


@router.get("/export-presets/{preset_id}")
async def get_export_preset(
    preset_id: int,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Get a specific export preset by ID."""
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_get",
        limit=60,
        window_seconds=60,
        message="Too many export preset get requests. Please slow down.",
    )
    
    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_allowed",
                "message": "Export presets require Plus or Pro subscription.",
                "upgrade_required": "plus",
            },
        )
    
    preset = (
        db.query(ExportPreset)
        .filter(
            ExportPreset.id == preset_id,
            ExportPreset.user_id == user.id,
        )
        .first()
    )
    
    if preset is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Export preset not found"},
        )
    
    return {
        "id": preset.id,
        "name": preset.name,
        "preset_type": preset.preset_type,
        "format": preset.format,
        "search": preset.search,
        "persona_id": preset.persona_id,
        "min_score": preset.min_score,
        "sort": preset.sort,
        "position": preset.position,
        "is_default": preset.is_default,
        "last_used_at": preset.last_used_at.isoformat() if preset.last_used_at else None,
        "created_at": preset.created_at.isoformat(),
        "updated_at": preset.updated_at.isoformat(),
    }


@router.put("/export-presets/{preset_id}")
async def update_export_preset(
    preset_id: int,
    body: ExportPresetUpdate,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Update an existing export preset."""
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_update",
        limit=30,
        window_seconds=60,
        message="Too many export preset updates. Please slow down.",
    )
    
    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_allowed",
                "message": "Export presets require Plus or Pro subscription.",
                "upgrade_required": "plus",
            },
        )
    
    preset = (
        db.query(ExportPreset)
        .filter(
            ExportPreset.id == preset_id,
            ExportPreset.user_id == user.id,
        )
        .first()
    )
    
    if preset is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Export preset not found"},
        )
    
    # Update fields
    if body.name is not None:
        preset.name = sanitize_model_text(body.name, max_length=100, field_name="name")
    if body.format is not None:
        preset.format = body.format
    if body.search is not None:
        preset.search = body.search
    if body.persona_id is not None:
        preset.persona_id = body.persona_id
    if body.min_score is not None:
        preset.min_score = body.min_score
    if body.sort is not None:
        preset.sort = body.sort
    if body.position is not None:
        preset.position = body.position
    
    # Handle default preset - only one can be default per user
    if body.is_default is not None and body.is_default:
        # Un-set any existing default preset for this user
        db.query(ExportPreset).filter(
            ExportPreset.user_id == user.id,
            ExportPreset.id != preset.id,
            ExportPreset.is_default == True,
        ).update({"is_default": False})
        preset.is_default = True
    elif body.is_default is not None and not body.is_default:
        preset.is_default = False
    
    db.commit()
    db.refresh(preset)
    
    return {
        "status": "updated",
        "id": preset.id,
        "name": preset.name,
        "preset_type": preset.preset_type,
        "format": preset.format,
        "search": preset.search,
        "persona_id": preset.persona_id,
        "min_score": preset.min_score,
        "sort": preset.sort,
        "position": preset.position,
        "is_default": preset.is_default,
        "last_used_at": preset.last_used_at.isoformat() if preset.last_used_at else None,
        "created_at": preset.created_at.isoformat(),
        "updated_at": preset.updated_at.isoformat(),
    }


@router.delete("/export-presets/{preset_id}")
async def delete_export_preset(
    preset_id: int,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Delete an export preset."""
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_delete",
        limit=30,
        window_seconds=60,
        message="Too many export preset deletions. Please slow down.",
    )
    
    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_allowed",
                "message": "Export presets require Plus or Pro subscription.",
                "upgrade_required": "plus",
            },
        )
    
    preset = (
        db.query(ExportPreset)
        .filter(
            ExportPreset.id == preset_id,
            ExportPreset.user_id == user.id,
        )
        .first()
    )
    
    if preset is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Export preset not found"},
        )
    
    db.delete(preset)
    db.commit()
    
    return {"status": "deleted", "id": preset_id}


@router.post("/export-presets/{preset_id}/use")
async def use_export_preset(
    preset_id: int,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Use an export preset to export saved responses."""
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_use",
        limit=30,
        window_seconds=60,
        message="Too many export preset uses. Please slow down.",
    )
    
    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_allowed",
                "message": "Export presets require Plus or Pro subscription.",
                "upgrade_required": "plus",
            },
        )
    
    preset = (
        db.query(ExportPreset)
        .filter(
            ExportPreset.id == preset_id,
            ExportPreset.user_id == user.id,
        )
        .first()
    )
    
    if preset is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Export preset not found"},
        )
    
    # Update last_used_at timestamp
    from arena.core.datetime_utils import utcnow_naive
    preset.last_used_at = utcnow_naive()
    db.commit()
    db.refresh(preset)
    
    # Construct the URL for the export with preset parameters
    from urllib.parse import urlencode
    
    params = {
        "format": preset.format,
    }
    
    if preset.search:
        params["search"] = preset.search
    if preset.persona_id:
        params["persona_id"] = preset.persona_id
    if preset.min_score is not None:
        params["min_score"] = preset.min_score
    if preset.sort:
        params["sort"] = preset.sort
    
    # For now, redirect to the export endpoint with preset parameters
    # This allows the existing export logic to handle the request
    query_string = urlencode(params)
    
    from fastapi.responses import RedirectResponse
    return RedirectResponse(
        url=f"/api/saved/export?{query_string}",
        status_code=307,
    )


@router.post("/export-presets/{preset_id}/duplicate")
async def duplicate_export_preset(
    preset_id: int,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Duplicate an export preset."""
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_duplicate",
        limit=30,
        window_seconds=60,
        message="Too many export preset duplications. Please slow down.",
    )
    
    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_allowed",
                "message": "Export presets require Plus or Pro subscription.",
                "upgrade_required": "plus",
            },
        )
    
    # Get the original preset
    original = (
        db.query(ExportPreset)
        .filter(
            ExportPreset.id == preset_id,
            ExportPreset.user_id == user.id,
        )
        .first()
    )
    
    if original is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Export preset not found"},
        )
    
    # Check existing count
    existing_count = (
        db.query(ExportPreset)
        .filter(ExportPreset.user_id == user.id)
        .count()
    )
    
    if existing_count >= EXPORT_PRESETS_MAX_PER_USER:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "preset_limit_reached",
                "message": f"Export preset limit reached ({EXPORT_PRESETS_MAX_PER_USER}). Delete some before duplicating.",
                "active_cap": EXPORT_PRESETS_MAX_PER_USER,
            },
        )
    
    # Create a copy with a modified name
    from arena.core.datetime_utils import utcnow_naive
    timestamp = utcnow_naive().strftime('%Y%m%d-%H%M%S')
    
    duplicated = ExportPreset(
        user_id=user.id,
        name=f"{original.name} (Copy {timestamp})",
        preset_type=original.preset_type,
        format=original.format,
        search=original.search,
        persona_id=original.persona_id,
        min_score=original.min_score,
        sort=original.sort,
        position=original.position + 1,  # Place after original
        is_default=False,  # Duplicates are never default
    )
    
    db.add(duplicated)
    db.commit()
    db.refresh(duplicated)
    
    return {
        "status": "duplicated",
        "original_id": preset_id,
        "new_id": duplicated.id,
        "name": duplicated.name,
        "position": duplicated.position,
        "is_default": duplicated.is_default,
        "created_at": duplicated.created_at.isoformat(),
    }


@router.post("/export-presets/reorder")
async def reorder_export_presets(
    body: list[dict],
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Reorder export presets by updating their positions."""
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_reorder",
        limit=30,
        window_seconds=60,
        message="Too many export preset reorders. Please slow down.",
    )
    
    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_allowed",
                "message": "Export presets require Plus or Pro subscription.",
                "upgrade_required": "plus",
            },
        )
    
    # Validate that each preset belongs to the user and update positions
    for i, item in enumerate(body):
        preset_id = item.get("id")
        if not preset_id:
            continue
        
        preset = (
            db.query(ExportPreset)
            .filter(
                ExportPreset.id == preset_id,
                ExportPreset.user_id == user.id,
            )
            .first()
        )
        
        if preset:
            preset.position = i
    
    db.commit()
    
    return {
        "status": "reordered",
        "updated_count": len([item for item in body if item.get("id")]),
    }
