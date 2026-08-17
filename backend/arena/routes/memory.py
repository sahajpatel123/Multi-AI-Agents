"""Memory persistence routes."""

from __future__ import annotations

import json
import logging
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import Text, cast, or_
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required
from arena.core.datetime_utils import utcnow_naive
from arena.core.input_validation import sanitize_model_text, sanitize_model_optional_text
from arena.core.memory import get_memory_manager
from arena.core.preferences import infer_preferences_from_session
from arena.core.rate_limits import enforce_user_rate_limit
from arena.core.stance_archive import save_agent_stance
from arena.core.tier_config import get_tier_str, has_feature, normalize_tier
from arena.database import get_db
from arena.db_models import SessionSummary
from arena.models.schemas import UserResponse

logger = logging.getLogger(__name__)

memory_router = APIRouter(tags=["memory"])

# Cap the list endpoint so a user with thousands of compressed sessions
# can't pull the whole table in one request. The UI paginates; this is
# the upper bound per page.
MAX_SUMMARIES_PER_PAGE = 100
MemorySummarySort = Literal["newest", "oldest", "most_exchanges", "fewest_exchanges"]


def _apply_summary_search(query, search: Optional[str]):
    """Apply the Memory search consistently across list and export routes.

    ``main_topics`` is a JSON column on PostgreSQL, so cast it to text before
    using ``ILIKE``. Escaping the LIKE wildcards keeps a literal search such
    as ``100%`` from turning into a broad query.
    """
    if not search:
        return query

    safe = sanitize_model_optional_text(search, max_length=100, field_name="search")
    if not safe:
        return query

    escaped = safe.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    return query.filter(
        or_(
            SessionSummary.session_summary.ilike(pattern, escape="\\"),
            cast(SessionSummary.main_topics, Text).ilike(pattern, escape="\\"),
        )
    )


def _apply_summary_date_range(query, from_date: date | None, to_date: date | None):
    """Limit summaries to inclusive UTC calendar dates when requested.

    ``compressed_at`` is stored as a timezone-naive UTC timestamp. Using a
    half-open interval for the end date keeps the filter inclusive without
    losing records created in the final microsecond of that day.
    """
    if from_date:
        query = query.filter(
            SessionSummary.compressed_at >= datetime.combine(from_date, time.min)
        )
    if to_date:
        if to_date == date.max:
            return query.filter(SessionSummary.compressed_at <= datetime.max)
        end_exclusive = datetime.combine(to_date + timedelta(days=1), time.min)
        query = query.filter(SessionSummary.compressed_at < end_exclusive)
    return query


def _apply_summary_filters(
    query,
    *,
    category: Optional[str],
    persona_id: Optional[str],
    search: Optional[str],
    from_date: date | None,
    to_date: date | None,
):
    """Apply the caller-visible Memory filters consistently to every view."""
    if category:
        query = query.filter(SessionSummary.dominant_category == category)
    if persona_id:
        # Exact match — persona_id is a closed enum string.
        query = query.filter(SessionSummary.trusted_persona == persona_id)
    query = _apply_summary_search(query, search)
    return _apply_summary_date_range(query, from_date, to_date)


def _order_summary_query(query, sort: MemorySummarySort):
    """Apply a safe, deterministic order to a filtered summary query.

    The id tie-breaker keeps pagination stable when two summaries were
    compressed in the same second (common in tests and quick sessions).
    """
    if sort == "oldest":
        return query.order_by(SessionSummary.compressed_at.asc(), SessionSummary.id.asc())
    if sort == "most_exchanges":
        return query.order_by(
            SessionSummary.exchange_count.desc(),
            SessionSummary.compressed_at.desc(),
            SessionSummary.id.desc(),
        )
    if sort == "fewest_exchanges":
        return query.order_by(
            SessionSummary.exchange_count.asc(),
            SessionSummary.compressed_at.desc(),
            SessionSummary.id.desc(),
        )
    return query.order_by(SessionSummary.compressed_at.desc(), SessionSummary.id.desc())


def _validate_summary_date_range(from_date: date | None, to_date: date | None) -> None:
    """Reject reversed date ranges before querying or exporting data."""
    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "invalid_date_range",
                "message": "From date must be on or before to date.",
            },
        )


def _decode_json_column(value, default):
    """Postgres returns JSON columns as lists/dicts; SQLite returns strings.

    Memory summaries need a stable shape regardless of driver so the list
    and detail endpoints can share a serializer.
    """
    if value is None:
        return default
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return default
    return default


def _markdown_inline(value) -> str:
    """Keep exported metadata on one safe Markdown line.

    Summary metadata can contain model-derived values, and legacy rows may
    contain arbitrary JSON. Escaping backslashes/backticks and flattening all
    line separators prevents one malformed value from changing the structure
    of the rest of the portable document. The summary body is deliberately
    left untouched by the Markdown exporter so users can keep its formatting.
    """
    if value is None:
        return ""
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace("`", "\\`")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\n", " ")
        .replace("\u2028", " ")
        .replace("\u2029", " ")
        .replace("\t", " ")
        .strip()
    )


def _serialize_summary(row: SessionSummary, *, include_body: bool) -> dict:
    """Project a SessionSummary row to its public dict.

    ``include_body=False`` omits the long-form fields (session_summary text
    and key_positions_taken) so list responses stay small. Detail requests
    pass True to get the full row.
    """
    base = {
        "id": row.id,
        "session_id": row.session_id,
        "dominant_category": row.dominant_category,
        "preferred_depth": row.preferred_depth,
        "trusted_persona": row.trusted_persona,
        "exchange_count": int(row.exchange_count or 0),
        "main_topics": _decode_json_column(row.main_topics, []),
        "compressed_at": row.compressed_at.isoformat() if row.compressed_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
    if include_body:
        base["session_summary"] = row.session_summary or ""
        base["key_positions_taken"] = _decode_json_column(row.key_positions_taken, [])
        base["raw_exchanges_count"] = int(row.raw_exchanges_count or 0)
    return base


class MemorySaveRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=64)
    trigger: Literal["session_end", "new_chat", "manual"]

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        return sanitize_model_text(v, max_length=64, field_name="session_id")


@memory_router.post("/save")
async def save_memory(
    body: MemorySaveRequest,
    db: Session = Depends(get_db),
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    if not has_feature(normalize_tier(get_tier_str(user)), "memory"):
        return {"status": "skipped", "reason": "Memory requires Plus tier"}

    # Bound save chatter (compression is LLM-backed and cost-bearing).
    enforce_user_rate_limit(
        user.id,
        scope="memory_save",
        limit=30,
        window_seconds=3600,
        message="Too many memory save requests. Limit is 30 per hour.",
    )

    memory = get_memory_manager()
    session_state = memory.get_session_state(body.session_id)
    if not session_state or not session_state.get("exchanges"):
        return {"status": "skipped", "reason": "no exchanges"}

    # Ownership guard (in-memory first): session_id is a client-chosen key.
    # Without this check, any authenticated Plus user who learns another
    # user's live session_id could compress their exchanges, write a
    # SessionSummary under their own account, and clear the victim's
    # short-term memory (IDOR + session wipe).
    # Use 404 (not 403) so foreign session_ids cannot be distinguished
    # from missing ones.
    owner = str(session_state.get("user_id") or "").strip()
    caller = str(user.id)
    if owner and owner not in ("anonymous", "None") and owner != caller:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "not_found",
                "message": "Session not found",
            },
        )

    exchanges = list(session_state["exchanges"])
    stances_saved = 0
    partial_error: str | None = None

    # Ownership guard (persisted): a summary row belonging to another user
    # must never be reassigned or overwritten. Reject before compression
    # / clear so the error is not swallowed by the persistence try/except.
    existing_summary = (
        db.query(SessionSummary)
        .filter(SessionSummary.session_id == body.session_id)
        .first()
    )
    if existing_summary is not None and existing_summary.user_id != user.id:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "not_found",
                "message": "Session not found",
            },
        )

    try:
        summary = await memory.compressor.compress_session(
            session_id=body.session_id,
            exchanges=exchanges,
            user_id=user.id,
        )
    except Exception as exc:
        # Log full detail server-side only — never return str(exc) to clients
        # (stack paths, SQL, provider URLs, etc.).
        logger.exception("Memory compression failed for %s: %s", body.session_id, exc)
        partial_error = "compression_failed"
        summary = {
            "session_id": body.session_id,
            "main_topics": [],
            "dominant_category": exchanges[-1].get("prompt_category", "question"),
            "preferred_depth": "moderate",
            "trusted_persona": None,
            "key_positions_taken": [],
            "session_summary": f"Session with {len(exchanges)} exchanges.",
            "exchange_count": len(exchanges),
            "timestamp": datetime.now(UTC).isoformat(),
        }

    try:
        row = db.query(SessionSummary).filter(SessionSummary.session_id == body.session_id).first()
        if row is None:
            row = SessionSummary(session_id=body.session_id, user_id=user.id)

        row.user_id = user.id
        row.main_topics = list(summary.get("main_topics") or [])
        row.dominant_category = str(summary.get("dominant_category") or "question")
        row.preferred_depth = str(summary.get("preferred_depth") or "moderate")
        row.trusted_persona = summary.get("trusted_persona")
        row.key_positions_taken = list(summary.get("key_positions_taken") or [])
        row.session_summary = str(summary.get("session_summary") or f"Session with {len(exchanges)} exchanges.")
        row.exchange_count = int(summary.get("exchange_count") or len(exchanges))
        row.raw_exchanges_count = len(exchanges)
        row.compressed_at = datetime.now(UTC).replace(tzinfo=None)
        if row.id is None:
            db.add(row)
        db.commit()

        for entry in row.key_positions_taken:
            persona_id = entry.get("persona_id")
            topic = entry.get("topic")
            stance = entry.get("stance")
            if not persona_id or not topic or not stance:
                continue
            await save_agent_stance(
                user_id=user.id,
                persona_id=persona_id,
                topic=topic,
                stance=stance,
                confidence=int(entry.get("confidence", 0)),
                session_id=body.session_id,
                prompt_snippet=topic[:100],
                db=db,
            )
            stances_saved += 1

        await infer_preferences_from_session(
            user.id,
            {"exchanges": exchanges, "summary": summary},
            db,
        )
    except Exception as exc:
        logger.exception(
            "Memory persistence partially failed for %s: %s", body.session_id, exc
        )
        # Stable public code only — do not surface exception text.
        partial_error = partial_error or "persistence_failed"

    memory.clear_session(body.session_id)

    if partial_error:
        return {
            "status": "partial",
            "session_id": body.session_id,
            "exchanges_compressed": len(exchanges),
            "topics_extracted": list(summary.get("main_topics") or []),
            "stances_saved": stances_saved,
            "error": partial_error,
            "message": "Some memory data could not be fully saved. Your session was closed.",
        }

    return {
        "status": "saved",
        "session_id": body.session_id,
        "exchanges_compressed": len(exchanges),
        "topics_extracted": list(summary.get("main_topics") or []),
        "stances_saved": stances_saved,
    }


# ─── Summary listing & detail ────────────────────────────────────────────────


@memory_router.get("/summaries")
async def list_summaries(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=MAX_SUMMARIES_PER_PAGE),
    category: Optional[str] = Query(None, max_length=50, description="Filter by dominant_category."),
    persona_id: Optional[str] = Query(None, max_length=50, description="Filter to summaries where trusted_persona matches."),
    search: Optional[str] = Query(None, max_length=100, description="Case-insensitive substring match on session_summary text."),
    from_date: date | None = Query(None, description="Include summaries compressed on or after this UTC date."),
    to_date: date | None = Query(None, description="Include summaries compressed on or before this UTC date."),
    sort: MemorySummarySort = Query("newest", description="Summary order."),
) -> dict:
    """Paginated list of the caller's compressed session summaries.

    Returns an envelope so the UI can render pagination controls and a
    filter summary without inferring state. Long-form fields
    (session_summary, key_positions_taken) are omitted from list rows —
    clients fetch the full body via GET /summaries/{id} only when needed.
    """
    # 60/min/user — paginated history; ILIKE search can be DB-heavy.
    enforce_user_rate_limit(
        user.id,
        scope="memory_summaries_list",
        limit=60,
        window_seconds=60,
        message="Too many memory summary list reads. Please slow down.",
    )
    if not has_feature(normalize_tier(get_tier_str(user)), "memory"):
        return {
            "summaries": [],
            "total": 0,
            "page": 1,
            "per_page": per_page,
            "total_pages": 0,
            "filters": {
                "category": None,
                "persona_id": None,
                "search": None,
                "from_date": None,
                "to_date": None,
                "sort": sort,
            },
        }

    _validate_summary_date_range(from_date, to_date)
    # Filters are shared by list and export routes so users can export the
    # exact Memory view they are browsing.
    q = _apply_summary_filters(
        db.query(SessionSummary).filter(SessionSummary.user_id == user.id),
        category=category,
        persona_id=persona_id,
        search=search,
        from_date=from_date,
        to_date=to_date,
    )

    total = q.count()
    rows = _order_summary_query(q, sort).offset((page - 1) * per_page).limit(per_page).all()

    return {
        "summaries": [_serialize_summary(r, include_body=False) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page if per_page else 0,
        "filters": {
            "category": category,
            "persona_id": persona_id,
            "search": search,
            "from_date": from_date.isoformat() if from_date else None,
            "to_date": to_date.isoformat() if to_date else None,
            "sort": sort,
        },
    }


@memory_router.get("/summaries/export.csv")
async def export_summaries_csv(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    category: Optional[str] = Query(None, max_length=50, description="Filter by dominant_category."),
    persona_id: Optional[str] = Query(None, max_length=50, description="Filter to summaries where trusted_persona matches."),
    search: Optional[str] = Query(None, max_length=100, description="Case-insensitive substring match on session_summary text."),
    from_date: date | None = Query(None, description="Include summaries compressed on or after this UTC date."),
    to_date: date | None = Query(None, description="Include summaries compressed on or before this UTC date."),
    sort: MemorySummarySort = Query("newest", description="Summary order."),
):
    """CSV export of all session summaries for a user.

    Streams compressed session data with formula-injection defense.
    Supports the same filters as /api/memory/summaries.
    """
    enforce_user_rate_limit(
        user.id,
        scope="memory_summaries_csv",
        limit=30,
        window_seconds=60,
        message="Too many CSV exports. Please wait.",
    )
    
    if not has_feature(normalize_tier(get_tier_str(user)), "memory"):
        raise HTTPException(
            status_code=403,
            detail={"error": "feature_not_allowed", "message": "Memory export requires Plus or Pro."},
        )
    
    def _csv_safe(value) -> str:
        """Escape value for CSV to prevent formula injection."""
        if value is None:
            return ""
        s = str(value)
        if s.startswith(("=", "+", "-", "@")):
            return "'" + s
        return s
    
    _validate_summary_date_range(from_date, to_date)
    # Get all matching summaries (not paginated for CSV).
    q = _apply_summary_filters(
        db.query(SessionSummary).filter(SessionSummary.user_id == user.id),
        category=category,
        persona_id=persona_id,
        search=search,
        from_date=from_date,
        to_date=to_date,
    )
    
    summaries = _order_summary_query(q, sort).all()
    
    import csv
    import io
    from arena.core.datetime_utils import utcnow_naive
    
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    
    # Write header
    writer.writerow([
        "id",
        "session_id",
        "session_summary",
        "dominant_category",
        "preferred_depth",
        "trusted_persona",
        "exchange_count",
        "main_topics",
        "compressed_at",
    ])
    
    # Write rows
    for row in summaries:
        writer.writerow([
            _csv_safe(row.id),
            _csv_safe(row.session_id),
            _csv_safe((row.session_summary or "")[:500]),
            _csv_safe(row.dominant_category),
            _csv_safe(row.preferred_depth),
            _csv_safe(row.trusted_persona),
            _csv_safe(row.exchange_count),
            _csv_safe(";".join(row.main_topics or [])),
            _csv_safe(row.compressed_at.isoformat() if row.compressed_at else ""),
        ])
    
    filename = f"arena-memory-summaries-{user.id}-{utcnow_naive().strftime('%Y%m%d')}.csv"
    from fastapi.responses import Response
    from arena.core.http_headers import content_disposition_attachment
    
    headers = {
        "Content-Disposition": content_disposition_attachment(filename),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
    }
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )


@memory_router.get("/summaries/export.json")
async def export_summaries_json(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    category: Optional[str] = Query(None, max_length=50, description="Filter by dominant_category."),
    persona_id: Optional[str] = Query(None, max_length=50, description="Filter to summaries where trusted_persona matches."),
    search: Optional[str] = Query(None, max_length=100, description="Case-insensitive substring match on session_summary text."),
    from_date: date | None = Query(None, description="Include summaries compressed on or after this UTC date."),
    to_date: date | None = Query(None, description="Include summaries compressed on or before this UTC date."),
    sort: MemorySummarySort = Query("newest", description="Summary order."),
):
    """JSON export of all session summaries for a user.

    Returns all session summaries as a JSON array.
    Supports the same filters as /api/memory/summaries.
    """
    enforce_user_rate_limit(
        user.id,
        scope="memory_summaries_json",
        limit=30,
        window_seconds=60,
        message="Too many JSON exports. Please wait.",
    )
    
    if not has_feature(normalize_tier(get_tier_str(user)), "memory"):
        raise HTTPException(
            status_code=403,
            detail={"error": "feature_not_allowed", "message": "Memory export requires Plus or Pro."},
        )
    
    _validate_summary_date_range(from_date, to_date)
    # Get all matching summaries (not paginated for export).
    q = _apply_summary_filters(
        db.query(SessionSummary).filter(SessionSummary.user_id == user.id),
        category=category,
        persona_id=persona_id,
        search=search,
        from_date=from_date,
        to_date=to_date,
    )
    
    summaries = _order_summary_query(q, sort).all()
    
    import json
    from arena.core.datetime_utils import utcnow_naive
    
    # Format as JSON-serializable list
    items = []
    for row in summaries:
        items.append({
            "id": row.id,
            "session_id": row.session_id,
            "session_summary": row.session_summary,
            "dominant_category": row.dominant_category,
            "preferred_depth": row.preferred_depth,
            "trusted_persona": row.trusted_persona,
            "exchange_count": row.exchange_count,
            "main_topics": list(row.main_topics or []),
            "compressed_at": row.compressed_at.isoformat() if row.compressed_at else None,
        })
    
    filename = f"arena-memory-summaries-{user.id}-{utcnow_naive().strftime('%Y%m%d')}.json"
    from fastapi.responses import Response
    from arena.core.http_headers import content_disposition_attachment
    
    headers = {
        "Content-Disposition": content_disposition_attachment(filename),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
    }
    return Response(
        content=json.dumps(items, indent=2, default=str),
        media_type="application/json; charset=utf-8",
        headers=headers,
    )


@memory_router.get("/summaries/export.md")
async def export_summaries_markdown(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    category: Optional[str] = Query(None, max_length=50, description="Filter by dominant_category."),
    persona_id: Optional[str] = Query(None, max_length=50, description="Filter to summaries where trusted_persona matches."),
    search: Optional[str] = Query(None, max_length=100, description="Case-insensitive substring match on session_summary text."),
    from_date: date | None = Query(None, description="Include summaries compressed on or after this UTC date."),
    to_date: date | None = Query(None, description="Include summaries compressed on or before this UTC date."),
    sort: MemorySummarySort = Query("newest", description="Summary order."),
):
    """Export all matching session summaries as a portable Markdown document."""
    enforce_user_rate_limit(
        user.id,
        scope="memory_summaries_markdown",
        limit=30,
        window_seconds=60,
        message="Too many Markdown exports. Please wait.",
    )

    if not has_feature(normalize_tier(get_tier_str(user)), "memory"):
        raise HTTPException(
            status_code=403,
            detail={"error": "feature_not_allowed", "message": "Memory export requires Plus or Pro."},
        )

    _validate_summary_date_range(from_date, to_date)
    q = _apply_summary_filters(
        db.query(SessionSummary).filter(SessionSummary.user_id == user.id),
        category=category,
        persona_id=persona_id,
        search=search,
        from_date=from_date,
        to_date=to_date,
    )
    summaries = _order_summary_query(q, sort).all()

    def _date(value) -> str:
        return value.strftime("%Y-%m-%d") if value else "Unknown date"

    lines = [
        "# Arena Memory",
        "",
        f"Exported: {utcnow_naive().strftime('%Y-%m-%d')}",
        f"Summaries: {len(summaries)}",
    ]
    filters = []
    if search:
        filters.append(f"Search: {_markdown_inline(search)}")
    if category:
        filters.append(f"Kind: {_markdown_inline(category)}")
    if persona_id:
        filters.append(f"Trusted mind: {_markdown_inline(persona_id)}")
    if from_date:
        filters.append(f"From: {from_date.isoformat()}")
    if to_date:
        filters.append(f"To: {to_date.isoformat()}")
    if sort != "newest":
        filters.append(f"Sort: {sort.replace('_', ' ')}")
    if filters:
        lines.extend(["", "Filters: " + " · ".join(filters)])

    for row in summaries:
        lines.extend(
            [
                "",
                "---",
                "",
                f"## {_markdown_inline(row.dominant_category or 'Session')} · {_date(row.compressed_at)}",
                "",
                f"- Session ID: `{_markdown_inline(row.session_id)}`",
                f"- Exchanges: {int(row.exchange_count or 0)}",
            ]
        )
        if row.preferred_depth:
            lines.append(f"- Depth: {_markdown_inline(row.preferred_depth)}")
        if row.trusted_persona:
            lines.append(f"- Trusted mind: {_markdown_inline(row.trusted_persona)}")

        topics = _decode_json_column(row.main_topics, [])
        if isinstance(topics, list) and topics:
            lines.extend(["", "### Topics", ""])
            lines.extend(
                f"- {_markdown_inline(topic)}"
                for topic in topics
                if _markdown_inline(topic)
            )

        lines.extend(["", "### Summary", "", row.session_summary or "_No summary text was saved._"])

        positions = _decode_json_column(row.key_positions_taken, [])
        if isinstance(positions, list) and positions:
            position_lines = []
            for position in positions:
                if not isinstance(position, dict):
                    continue
                parts = []
                if position.get("persona_id"):
                    parts.append(_markdown_inline(position["persona_id"]))
                if position.get("topic"):
                    parts.append(_markdown_inline(position["topic"]))
                if position.get("stance"):
                    parts.append(_markdown_inline(position["stance"]))
                if position.get("confidence") is not None:
                    parts.append(f"confidence {_markdown_inline(position['confidence'])}%")
                if parts:
                    position_lines.append("- " + " — ".join(parts))
            if position_lines:
                lines.extend(["", "### Positions", "", *position_lines])

    from fastapi.responses import Response
    from arena.core.http_headers import content_disposition_attachment

    filename = f"arena-memory-summaries-{user.id}-{utcnow_naive().strftime('%Y%m%d')}.md"
    headers = {
        "Content-Disposition": content_disposition_attachment(filename),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
    }
    return Response(
        content="\n".join(lines).rstrip() + "\n",
        media_type="text/markdown; charset=utf-8",
        headers=headers,
    )


@memory_router.get("/summaries/{summary_id}")
async def get_summary(
    summary_id: int,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Full body of one summary — list endpoint strips the long fields to
    keep list responses small, so the detail view needs a follow-up call.

    Scope by owner so foreign ids look like missing ones (no 403 oracle).
    """
    # 120/min/user — detail hydrate on open; ownership still gates.
    enforce_user_rate_limit(
        user.id,
        scope="memory_summary_detail",
        limit=120,
        window_seconds=60,
        message="Too many memory summary reads. Please slow down.",
    )
    if not has_feature(normalize_tier(get_tier_str(user)), "memory"):
        raise HTTPException(
            status_code=403,
            detail={"error": "feature_not_allowed", "message": "Memory requires a Plus tier."},
        )

    row = (
        db.query(SessionSummary)
        .filter(SessionSummary.id == summary_id, SessionSummary.user_id == user.id)
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Summary not found"},
        )
    return _serialize_summary(row, include_body=True)


@memory_router.delete("/summaries/{summary_id}")
async def delete_summary(
    summary_id: int,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Delete one summary. Foreign ids return 404 (same shape as missing)
    so a caller can't enumerate ids by status code."""
    if not has_feature(normalize_tier(get_tier_str(user)), "memory"):
        raise HTTPException(
            status_code=403,
            detail={"error": "feature_not_allowed", "message": "Memory requires a Plus tier."},
        )

    enforce_user_rate_limit(
        user.id,
        scope="memory_summary_delete",
        limit=60,
        window_seconds=3600,
        message="Too many summary deletes. Limit is 60 per hour.",
    )

    row = (
        db.query(SessionSummary)
        .filter(SessionSummary.id == summary_id, SessionSummary.user_id == user.id)
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Summary not found"},
        )
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": summary_id}
