"""Export presets routes.

Allows users to save and reuse export configurations for saved responses.

Security:
- Feature-gated to Plus/Pro (same as saved responses).
- Per-user scoping - users can only access their own presets.
- Name length validation to prevent abuse.
- Rate limiting on creation/deletion.

Functionality:
- GET /export-presets/{id}/preview is a read-only dry run: it counts and
  samples the exact rows a real export would return (shared query builder
  in routes/saved.py) without touching last_used_at.
"""

import logging
from typing import Optional

from pydantic import BaseModel, Field, model_validator
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required
from arena.core.input_validation import sanitize_model_text
from arena.core.rate_limits import enforce_user_rate_limit
from arena.core.tier_config import get_tier_str, has_feature, normalize_tier
from arena.database import get_db
from arena.db_models import ExportPreset
from arena.models.schemas import UserResponse
from arena.routes.saved import build_saved_export_query, normalize_export_search

logger = logging.getLogger(__name__)

router = APIRouter(tags=["export_presets"])

# Max presets per user to prevent abuse
EXPORT_PRESETS_MAX_PER_USER = 50

# Sample rows returned by the preset preview (dry run) endpoint.
EXPORT_PRESET_PREVIEW_LIMIT = 5

# Export format version
EXPORT_PRESETS_FORMAT_VERSION = "1.0"

# Preset templates for quick creation
EXPORT_PRESET_TEMPLATES = [
    {
        "id": "high_score",
        "name": "High Score Responses",
        "description": "Export responses with score >= 80",
        "preset_type": "saved",
        "format": "csv",
        "search": None,
        "persona_id": None,
        "min_score": 80,
        "max_score": None,
        "sort": "score",
    },
    {
        "id": "recent",
        "name": "Recent Responses",
        "description": "Export responses from the last 7 days",
        "preset_type": "saved",
        "format": "json",
        "search": None,
        "persona_id": None,
        "min_score": None,
        "max_score": None,
        "sort": "newest",
    },
    {
        "id": "bitcoin_all",
        "name": "All Bitcoin Responses",
        "description": "Export all responses containing Bitcoin",
        "preset_type": "saved",
        "format": "csv",
        "search": "Bitcoin",
        "persona_id": None,
        "min_score": None,
        "max_score": None,
        "sort": "newest",
    },
    {
        "id": "high_score_json",
        "name": "High Score JSON",
        "description": "Export high-scoring responses in JSON format",
        "preset_type": "saved",
        "format": "json",
        "search": None,
        "persona_id": None,
        "min_score": 90,
        "max_score": None,
        "sort": "score",
    },
    {
        "id": "all_responses",
        "name": "All Responses",
        "description": "Export all saved responses",
        "preset_type": "saved",
        "format": "xlsx",
        "search": None,
        "persona_id": None,
        "min_score": None,
        "max_score": None,
        "sort": "newest",
    },
    {
        "id": "ethereum_all",
        "name": "All Ethereum Responses",
        "description": "Export all responses containing Ethereum",
        "preset_type": "saved",
        "format": "csv",
        "search": "Ethereum",
        "persona_id": None,
        "min_score": None,
        "max_score": None,
        "sort": "newest",
    },
    {
        "id": "top_scoring",
        "name": "Top Scoring (95+)",
        "description": "Export only the highest quality responses",
        "preset_type": "saved",
        "format": "json",
        "search": None,
        "persona_id": None,
        "min_score": 95,
        "max_score": None,
        "sort": "score",
    },
    {
        "id": "low_score",
        "name": "Low Score Responses",
        "description": "Export responses with score < 50 for review",
        "preset_type": "saved",
        "format": "csv",
        "search": None,
        "persona_id": None,
        "min_score": None,
        "max_score": 49,
        "sort": "score",
    },
    {
        "id": "medium_score",
        "name": "Medium Score Responses (50-80)",
        "description": "Export responses with score between 50 and 80",
        "preset_type": "saved",
        "format": "json",
        "search": None,
        "persona_id": None,
        "min_score": 50,
        "max_score": 80,
        "sort": "score",
    },
]


class ExportPresetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    preset_type: str = Field(default="saved", min_length=1, max_length=20)
    format: str = Field(default="csv", min_length=1, max_length=10)
    search: Optional[str] = Field(None, max_length=100)
    persona_id: Optional[str] = Field(None, max_length=50)
    min_score: Optional[int] = Field(None, ge=0, le=100)
    max_score: Optional[int] = Field(None, ge=0, le=100)
    sort: str = Field(default="newest", min_length=1, max_length=20)
    position: Optional[int] = Field(None, ge=0, le=999)
    is_default: bool = Field(default=False)

    @model_validator(mode='after')
    def validate_score_range(self) -> 'ExportPresetCreate':
        """Ensure min_score <= max_score when both are provided."""
        if self.min_score is not None and self.max_score is not None and self.min_score > self.max_score:
            raise ValueError('max_score must be greater than or equal to min_score')
        return self


class ExportPresetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    format: Optional[str] = Field(None, min_length=1, max_length=10)
    search: Optional[str] = Field(None, max_length=100)
    persona_id: Optional[str] = Field(None, max_length=50)
    min_score: Optional[int] = Field(None, ge=0, le=100)
    max_score: Optional[int] = Field(None, ge=0, le=100)
    sort: Optional[str] = Field(None, min_length=1, max_length=20)
    position: Optional[int] = Field(None, ge=0, le=999)
    is_default: Optional[bool] = Field(None)

    @model_validator(mode='after')
    def validate_score_range(self) -> 'ExportPresetUpdate':
        """Ensure min_score <= max_score when both are provided."""
        if self.min_score is not None and self.max_score is not None and self.min_score > self.max_score:
            raise ValueError('max_score must be greater than or equal to min_score')
        return self


class ExportPresetBulkDelete(BaseModel):
    ids: list[int] = Field(..., min_items=1, max_items=50, description="List of preset IDs to delete")
    force: bool = Field(default=False, description="Set to true to allow deletion of default preset")


class ExportPresetReorderItem(BaseModel):
    id: int = Field(..., ge=1, description="ID of the preset to reposition")


class ExportPresetReorderBody(BaseModel):
    items: list[ExportPresetReorderItem] = Field(
        ...,
        min_items=1,
        max_items=EXPORT_PRESETS_MAX_PER_USER,
        description="Ordered list of preset IDs; list index becomes the new position",
    )


@router.get("/export-presets")
async def list_export_presets(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None, max_length=100, description="Search term to filter presets by name or description"),
    preset_type: Optional[str] = Query(None, max_length=20, description="Filter by preset type (e.g., 'saved')"),
    format: Optional[str] = Query(None, max_length=10, description="Filter by export format (e.g., 'csv', 'json', 'xlsx')"),
    min_score: Optional[int] = Query(None, ge=0, le=100, description="Filter by minimum score"),
    max_score: Optional[int] = Query(None, ge=0, le=100, description="Filter by maximum score"),
):
    """List all export presets for the current user.

    Supports optional query parameters:
    - search: Filter by name or description (case-insensitive, partial match)
    - preset_type: Filter by preset type
    - format: Filter by export format
    - min_score: Filter by minimum score
    - max_score: Filter by maximum score
    """
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_list",
        limit=60,
        window_seconds=60,
        message="Too many export preset list requests. Please slow down.",
    )

    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        return {"presets": [], "total": 0}

    query = db.query(ExportPreset).filter(ExportPreset.user_id == user.id)

    # Apply search filter if provided
    if search:
        from sqlalchemy import or_
        # Sanitize search input
        sanitized_search = sanitize_model_text(search, max_length=100, field_name="search")
        if sanitized_search:
            search_pattern = f"%{sanitized_search}%"
            query = query.filter(
                or_(
                    ExportPreset.name.ilike(search_pattern),
                    ExportPreset.description.ilike(search_pattern),
                )
            )

    # Apply preset_type filter if provided
    if preset_type:
        query = query.filter(ExportPreset.preset_type == preset_type)

    # Apply format filter if provided
    if format:
        query = query.filter(ExportPreset.format == format)

    # Apply min_score filter if provided
    if min_score is not None:
        query = query.filter(ExportPreset.min_score == min_score)

    # Apply max_score filter if provided
    if max_score is not None:
        query = query.filter(ExportPreset.max_score == max_score)

    presets = query.order_by(ExportPreset.position.asc(), ExportPreset.updated_at.desc()).all()

    return {
        "presets": [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "preset_type": p.preset_type,
                "format": p.format,
                "search": p.search,
                "persona_id": p.persona_id,
                "min_score": p.min_score,
                "max_score": p.max_score,
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
    description = sanitize_model_text(body.description, max_length=500, field_name="description") if body.description else None
    search = (
        sanitize_model_text(body.search, max_length=100, field_name="search")
        if body.search
        else None
    )

    # If this is set as default, un-set any existing default preset for this user
    if body.is_default:
        db.query(ExportPreset).filter(
            ExportPreset.user_id == user.id,
            ExportPreset.is_default.is_(True),
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
        description=description,
        preset_type=body.preset_type,
        format=body.format,
        search=search,
        persona_id=body.persona_id,
        min_score=body.min_score,
        max_score=body.max_score,
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
        "description": preset.description,
        "preset_type": preset.preset_type,
        "format": preset.format,
        "search": preset.search,
        "persona_id": preset.persona_id,
        "min_score": preset.min_score,
        "max_score": preset.max_score,
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
            ExportPreset.is_default.is_(True),
        )
        .first()
    )

    if preset is None:
        return None

    return {
        "id": preset.id,
        "name": preset.name,
        "description": preset.description,
        "preset_type": preset.preset_type,
        "format": preset.format,
        "search": preset.search,
        "persona_id": preset.persona_id,
        "min_score": preset.min_score,
        "max_score": preset.max_score,
        "sort": preset.sort,
        "position": preset.position,
        "is_default": preset.is_default,
        "last_used_at": preset.last_used_at.isoformat() if preset.last_used_at else None,
        "created_at": preset.created_at.isoformat(),
        "updated_at": preset.updated_at.isoformat(),
    }


@router.get("/export-presets/export")
async def export_export_presets(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Export all of the user's presets as a JSON backup."""
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_export",
        limit=30,
        window_seconds=60,
        message="Too many export requests. Please slow down.",
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

    presets = (
        db.query(ExportPreset)
        .filter(ExportPreset.user_id == user.id)
        .order_by(ExportPreset.position.asc())
        .all()
    )

    from arena.core.datetime_utils import utcnow_naive
    return {
        "status": "exported",
        "version": EXPORT_PRESETS_FORMAT_VERSION,
        "user_id": user.id,
        "exported_at": utcnow_naive().isoformat(),
        "total_presets": len(presets),
        "presets": [
            {
                "name": p.name,
                "description": p.description,
                "preset_type": p.preset_type,
                "format": p.format,
                "search": p.search,
                "persona_id": p.persona_id,
                "min_score": p.min_score,
                "max_score": p.max_score,
                "sort": p.sort,
            }
            for p in presets
        ],
    }


@router.get("/export-presets/templates")
async def list_export_preset_templates(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """List all available export preset templates."""
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_templates",
        limit=60,
        window_seconds=60,
        message="Too many template list requests. Please slow down.",
    )

    if not has_feature(normalize_tier(get_tier_str(user)), "saved_responses"):
        return {"templates": [], "total": 0}

    return {
        "templates": EXPORT_PRESET_TEMPLATES,
        "total": len(EXPORT_PRESET_TEMPLATES),
    }


class CreateFromTemplateQuery(BaseModel):
    template_id: str = Field(..., min_length=1, max_length=50, description="ID of the template to use")
    name: Optional[str] = Field(None, max_length=100, description="Optional custom name for the preset")


@router.post("/export-presets/from-template")
async def create_preset_from_template(
    query: CreateFromTemplateQuery = Depends(),
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Create an export preset from a template.

    Supports optional name override via query parameter.
    """
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_from_template",
        limit=30,
        window_seconds=60,
        message="Too many template creation requests. Please slow down.",
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

    template_id = query.template_id
    custom_name = query.name

    # Find the template
    template = None
    for t in EXPORT_PRESET_TEMPLATES:
        if t["id"] == template_id:
            template = t
            break

    if template is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "template_not_found", "message": f"Template '{template_id}' not found."},
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

    # Find the next available position
    max_position = (
        db.query(ExportPreset)
        .filter(ExportPreset.user_id == user.id)
        .order_by(ExportPreset.position.desc())
        .first()
    )
    position = (max_position.position + 1) if max_position else 0

    # Create the preset from the template
    from arena.core.datetime_utils import utcnow_naive

    # Use custom name if provided, otherwise generate timestamp-suffixed name
    if custom_name:
        name = sanitize_model_text(custom_name, max_length=100, field_name="name")
    else:
        timestamp = utcnow_naive().strftime('%Y%m%d-%H%M%S')
        name = f"{template['name']} ({timestamp})"

    description = sanitize_model_text(template["description"], max_length=500, field_name="description") if template["description"] else None

    preset = ExportPreset(
        user_id=user.id,
        name=name,
        description=description,
        preset_type=template["preset_type"],
        format=template["format"],
        search=(
            sanitize_model_text(template["search"], max_length=100, field_name="search")
            if template["search"]
            else None
        ),
        persona_id=template["persona_id"],
        min_score=template["min_score"],
        max_score=template["max_score"],
        sort=template["sort"],
        position=position,
        is_default=False,
    )

    db.add(preset)
    db.commit()
    db.refresh(preset)

    return {
        "status": "created_from_template",
        "id": preset.id,
        "template_id": template_id,
        "name": preset.name,
        "description": preset.description,
        "preset_type": preset.preset_type,
        "format": preset.format,
        "search": preset.search,
        "persona_id": preset.persona_id,
        "min_score": preset.min_score,
        "max_score": preset.max_score,
        "sort": preset.sort,
        "position": preset.position,
        "is_default": preset.is_default,
        "last_used_at": None,
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
        "description": preset.description,
        "preset_type": preset.preset_type,
        "format": preset.format,
        "search": preset.search,
        "persona_id": preset.persona_id,
        "min_score": preset.min_score,
        "max_score": preset.max_score,
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

    # Update fields. Optional filter fields (search, score bounds) are
    # clearable: an explicitly provided blank search clears the term, and
    # an explicitly provided null score bound removes it — without this,
    # a preset could never shed a filter once saved.
    provided_fields = body.model_fields_set
    if body.name is not None:
        preset.name = sanitize_model_text(body.name, max_length=100, field_name="name")
    if body.description is not None:
        preset.description = sanitize_model_text(body.description, max_length=500, field_name="description") if body.description else None
    if body.format is not None:
        preset.format = body.format
    if body.search is not None:
        preset.search = (
            sanitize_model_text(body.search, max_length=100, field_name="search")
            if body.search.strip()
            else None
        )
    if body.persona_id is not None:
        preset.persona_id = body.persona_id
    if "min_score" in provided_fields:
        preset.min_score = body.min_score
    if "max_score" in provided_fields:
        preset.max_score = body.max_score
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
            ExportPreset.is_default.is_(True),
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
        "description": preset.description,
        "preset_type": preset.preset_type,
        "format": preset.format,
        "search": preset.search,
        "persona_id": preset.persona_id,
        "min_score": preset.min_score,
        "max_score": preset.max_score,
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
    if preset.max_score is not None:
        params["max_score"] = preset.max_score
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


@router.get("/export-presets/{preset_id}/preview")
async def preview_export_preset(
    preset_id: int,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Dry-run preview for an export preset.

    Returns how many saved responses the preset would export plus a small
    sample, using the exact same query as /api/saved/export so the count
    always matches a real export. Read-only: last_used_at is not touched
    (a preview is not a use).
    """
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_preview",
        limit=30,
        window_seconds=60,
        message="Too many export preset previews. Please slow down.",
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

    # Uniform 404 for missing *and* foreign presets so ids cannot be
    # enumerated via 403 vs 404 (same contract as get/use/delete).
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

    # Normalize the stored search the same way the export endpoint does so the
    # disclosed filters always match the query actually run (parity contract).
    # Tolerant on purpose: presets saved before write-time sanitization may
    # hold whitespace-only values that must degrade to "no filter", not 500.
    safe_search = normalize_export_search(preset.search)

    q = build_saved_export_query(
        db,
        user.id,
        search=safe_search,
        persona_id=preset.persona_id,
        min_score=preset.min_score,
        max_score=preset.max_score,
        sort=preset.sort or "newest",
    )
    match_count = q.count()
    sample = q.limit(EXPORT_PRESET_PREVIEW_LIMIT).all()

    return {
        "preset_id": preset.id,
        "preset_name": preset.name,
        "preset_type": preset.preset_type,
        "format": preset.format,
        "filters": {
            "search": safe_search,
            "persona_id": preset.persona_id,
            "min_score": preset.min_score,
            "max_score": preset.max_score,
            "sort": preset.sort or "newest",
        },
        "match_count": match_count,
        "preview": [
            {
                "id": row.id,
                "persona_id": row.persona_id,
                "persona_name": row.persona_name,
                "score": row.score,
                "confidence": row.confidence,
                "one_liner": row.one_liner,
                "saved_at": row.saved_at.isoformat() if row.saved_at else None,
            }
            for row in sample
        ],
        "preview_limit": EXPORT_PRESET_PREVIEW_LIMIT,
        "truncated": match_count > len(sample),
    }


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

    # Make room for the copy: every preset at or after the slot shifts down
    # one, in the same transaction as the insert. The old bare position+1
    # collided with the neighbor's slot, letting the list's updated_at
    # tiebreak drift the copy away from its original after any later edit.
    (
        db.query(ExportPreset)
        .filter(
            ExportPreset.user_id == user.id,
            ExportPreset.position >= original.position + 1,
        )
        .update(
            {ExportPreset.position: ExportPreset.position + 1},
            synchronize_session=False,
        )
    )

    duplicated = ExportPreset(
        user_id=user.id,
        name=f"{original.name} (Copy {timestamp})",
        description=original.description,
        preset_type=original.preset_type,
        format=original.format,
        search=normalize_export_search(original.search),
        persona_id=original.persona_id,
        min_score=original.min_score,
        max_score=original.max_score,
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
    body: ExportPresetReorderBody,
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

    # Validate that each preset belongs to the user and update positions.
    # Items that don't belong to the caller are skipped (no existence oracle).
    updated_count = 0
    for i, item in enumerate(body.items):
        preset_id = item.id
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
            updated_count += 1

    db.commit()

    return {
        "status": "reordered",
        "updated_count": updated_count,
    }


@router.post("/export-presets/bulk-delete")
async def bulk_delete_export_presets(
    body: ExportPresetBulkDelete,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Delete multiple export presets in a single request."""
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_bulk_delete",
        limit=30,
        window_seconds=60,
        message="Too many bulk delete requests. Please slow down.",
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

    # Get the list of preset IDs to delete (Pydantic validates min_items=1, max_items=50)
    preset_ids = body.ids
    force = body.force

    # Find all presets that belong to the user and are in the provided list
    presets_to_delete = (
        db.query(ExportPreset)
        .filter(
            ExportPreset.id.in_(preset_ids),
            ExportPreset.user_id == user.id,
        )
        .all()
    )

    # Check if any of the presets being deleted is the user's default preset
    default_preset_ids = [p.id for p in presets_to_delete if p.is_default]
    if default_preset_ids and not force:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "default_preset_protected",
                "message": "Cannot delete default preset(s) without force=true. Set force=true to confirm.",
                "protected_ids": default_preset_ids,
            },
        )

    deleted_ids = []
    not_found_ids = []
    foreign_ids = []
    blocked_ids = []  # IDs that were blocked (default presets without force)

    for preset_id in preset_ids:
        preset_exists = any(p.id == preset_id for p in presets_to_delete)
        if preset_exists:
            deleted_ids.append(preset_id)
        else:
            # Check if preset exists but belongs to another user
            preset = db.query(ExportPreset).filter(ExportPreset.id == preset_id).first()
            if preset:
                foreign_ids.append(preset_id)
            else:
                not_found_ids.append(preset_id)

    # Delete the valid presets
    for preset in presets_to_delete:
        db.delete(preset)

    db.commit()

    return {
        "status": "bulk_deleted",
        "deleted_count": len(deleted_ids),
        "deleted_ids": deleted_ids,
        "not_found_count": len(not_found_ids),
        "not_found_ids": not_found_ids,
        "foreign_count": len(foreign_ids),
        "foreign_ids": foreign_ids,
        "blocked_count": len(blocked_ids),
        "blocked_ids": blocked_ids,
    }




class ExportPresetImport(BaseModel):
    presets: list[dict] = Field(..., min_items=1, max_items=50, description="List of preset configurations to import")


@router.post("/export-presets/import")
async def import_export_presets(
    body: ExportPresetImport,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Import presets from a JSON backup."""
    enforce_user_rate_limit(
        user.id,
        scope="export_presets_import",
        limit=30,
        window_seconds=60,
        message="Too many import requests. Please slow down.",
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

    # Check existing count + new presets won't exceed limit
    existing_count = (
        db.query(ExportPreset)
        .filter(ExportPreset.user_id == user.id)
        .count()
    )

    if existing_count + len(body.presets) > EXPORT_PRESETS_MAX_PER_USER:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "preset_limit_reached",
                "message": f"Import would exceed preset limit ({EXPORT_PRESETS_MAX_PER_USER}). Delete some before importing.",
                "active_cap": EXPORT_PRESETS_MAX_PER_USER,
            },
        )

    from arena.core.datetime_utils import utcnow_naive

    imported_count = 0
    skipped_count = 0
    errors = []
    imported_ids = []

    # Find the next available position
    max_position = (
        db.query(ExportPreset)
        .filter(ExportPreset.user_id == user.id)
        .order_by(ExportPreset.position.desc())
        .first()
    )
    next_position = (max_position.position + 1) if max_position else 0

    # Build a set of existing preset names for duplicate detection
    existing_names = {
        p.name for p in (
            db.query(ExportPreset)
            .filter(ExportPreset.user_id == user.id)
            .all()
        )
    }

    duplicated_names = []

    for preset_data in body.presets:
        try:
            # Validate and sanitize inputs
            name = sanitize_model_text(preset_data.get("name", "Unnamed Preset"), max_length=100, field_name="name")

            # Handle duplicate names by appending a suffix
            original_name = name
            if name in existing_names or name in duplicated_names:
                from arena.core.datetime_utils import utcnow_naive
                timestamp = utcnow_naive().strftime('%Y%m%d')
                name = f"{name} (Imported {timestamp})"
                duplicated_names.append(original_name)

            description = sanitize_model_text(preset_data.get("description"), max_length=500, field_name="description") if preset_data.get("description") else None

            preset = ExportPreset(
                user_id=user.id,
                name=name,
                description=description,
                preset_type=preset_data.get("preset_type", "saved"),
                format=preset_data.get("format", "csv"),
                search=preset_data.get("search"),
                persona_id=preset_data.get("persona_id"),
                min_score=preset_data.get("min_score"),
                max_score=preset_data.get("max_score"),
                sort=preset_data.get("sort", "newest"),
                position=next_position,
                is_default=False,  # Imported presets are never default
            )

            db.add(preset)
            db.flush()  # Get the ID
            imported_ids.append(preset.id)
            imported_count += 1
            next_position += 1

        except Exception as e:
            logger.debug("Preset row import failed", exc_info=True)
            errors.append({
                "index": len(imported_ids) + skipped_count,
                "error": str(e),
            })
            skipped_count += 1

    db.commit()

    return {
        "status": "imported",
        "imported_count": imported_count,
        "imported_ids": imported_ids,
        "skipped_count": skipped_count,
        "errors": errors,
        "duplicated_names": duplicated_names,
    }
