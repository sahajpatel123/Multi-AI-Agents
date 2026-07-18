"""Persona library routes."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from arena.core.rate_limits import enforce_ip_rate_limit
from arena.core.tier_config import get_tier_personas, normalize_tier
from arena.database import get_db
from arena.db_models import PersonaLibrary

router = APIRouter(tags=["personas"])


def _serialize(persona: PersonaLibrary, allowed: set[str] | None) -> dict:
    """Project a PersonaLibrary row to its public dict.

    ``allowed`` is the set of persona_ids the requesting tier can use; when
    provided, each persona carries an ``available_for_tier`` flag so the UI
    can grey out locked ones without a second round-trip to /user/tier.
    Passing ``None`` (anonymous callers) leaves the flag off — public
    listings should never leak tier-locking logic to logged-out visitors.
    """
    base = {
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
    if allowed is not None:
        base["available_for_tier"] = persona.persona_id in allowed
    return base


@router.get("/personas")
async def list_personas(
    request: Request,
    db: Session = Depends(get_db),
    provider: str | None = Query(
        None,
        max_length=50,
        description="Restrict to one provider: 'claude', 'openai', 'grok', 'deepseek'.",
    ),
    tier: str | None = Query(
        None,
        max_length=20,
        description="If provided, each persona is annotated with available_for_tier for this tier.",
    ),
) -> dict:
    """List the canonical persona library.

    Returns a dict (not a bare list) so we can attach metadata like
    ``total`` and ``providers`` without breaking existing clients that
    destructure ``.map(p => ...)`` — the array lives under ``personas``.

    The endpoint is intentionally unauthenticated: it's a public catalog.
    Tier-aware flags only attach when ``tier`` is supplied, so anonymous
    callers can't fingerprint whether a persona is paywalled.
    """
    # Public catalog. 60/min/IP caps scraping; the response is small but
    # the DB query runs on every call so a hostile client should not
    # be able to spam it.
    enforce_ip_rate_limit(
        request,
        scope="personas_list",
        limit=60,
        window_seconds=60,
        message="Too many persona list reads. Please slow down.",
    )
    q = db.query(PersonaLibrary).order_by(PersonaLibrary.display_order.asc())
    if provider:
        # Case-insensitive match on the provider column. Lowercasing both
        # sides means a UI sending 'Claude' and a DB seeded with 'claude'
        # don't disagree — case mismatches have burned this codebase
        # before (see persona_integrity.py for the historical context).
        q = q.filter(PersonaLibrary.provider.ilike(provider))

    rows = q.all()

    # Allowed-set is computed once, not per-row. Unknown tier strings
    # collapse to FREE rather than 400'ing — a stale frontend shouldn't
    # break the endpoint just because we shipped a new tier.
    allowed: set[str] | None = None
    if tier:
        allowed = get_tier_personas(normalize_tier(tier))

    personas = [_serialize(p, allowed) for p in rows]

    # Build the unique-provider list once for UIs that want to render a
    # provider filter dropdown without a second request. Stable order via
    # sorted() so the dropdown doesn't shuffle on every refetch.
    all_rows = db.query(PersonaLibrary.provider).distinct().all()
    providers = sorted({r[0] for r in all_rows if r[0]})

    return {
        "personas": personas,
        "total": len(personas),
        "providers": providers,
    }


@router.get("/personas/{persona_id}")
async def get_persona(
    request: Request,
    persona_id: str,
    db: Session = Depends(get_db),
    tier: str | None = Query(
        None,
        max_length=20,
        description="If provided, the response includes available_for_tier for this tier.",
    ),
) -> dict:
    """Fetch a single persona by id. 404 if it doesn't exist — clients
    shouldn't have to scan the list to confirm an id is valid.
    """
    # Public detail read. 120/min/IP — higher ceiling for hover/select.
    enforce_ip_rate_limit(
        request,
        scope="personas_detail",
        limit=120,
        window_seconds=60,
        message="Too many persona detail reads. Please slow down.",
    )
    persona = (
        db.query(PersonaLibrary)
        .filter(PersonaLibrary.persona_id == persona_id)
        .first()
    )
    if persona is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "persona_not_found", "persona_id": persona_id},
        )

    allowed: set[str] | None = None
    if tier:
        allowed = get_tier_personas(normalize_tier(tier))
    return _serialize(persona, allowed)
