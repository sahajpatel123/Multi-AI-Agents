"""Session route — retrieve and manage session data"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session

from arena.core.datetime_utils import utcnow_naive
from arena.models.schemas import (
    AgentResponse,
    ErrorResponse,
    SessionData,
    SessionTurn,
    UserResponse,
)
from arena.core.memory import get_memory_manager
from arena.core.input_validation import sanitize_model_text
from arena.core.persona_integrity import clear_session_history
from arena.core.dependencies import get_current_user_required
from arena.core.errors import ErrorCodes
from arena.core.rate_limits import enforce_user_rate_limit
from arena.database import get_db


router = APIRouter(prefix="/api", tags=["session"])

SESSION_TITLE_MAX = 120


class RenameSessionRequest(BaseModel):
    """Body for renaming a live session in the sidebar."""

    title: str = Field(..., max_length=SESSION_TITLE_MAX)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = sanitize_model_text(
            value, max_length=SESSION_TITLE_MAX, field_name="title"
        )
        return " ".join(cleaned.split())


class PinSessionRequest(BaseModel):
    """Body for pinning / unpinning a live session in the sidebar."""

    pinned: bool


class BulkDeleteSessionsRequest(BaseModel):
    """Body for deleting a user-selected subset of live sessions."""

    session_ids: list[str] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Sessions to delete, capped so one bad UI loop cannot erase a huge store.",
    )


class BulkPinSessionsRequest(BaseModel):
    """Body for pinning / unpinning a user-selected subset of live sessions."""

    session_ids: list[str] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Sessions to pin or unpin, capped to keep one request bounded.",
    )
    pinned: bool


class BulkDuplicateSessionsRequest(BaseModel):
    """Body for forking a user-selected subset of live sessions."""

    session_ids: list[str] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Sessions to duplicate, capped so one request stays bounded.",
    )


class ImportedAgentResponse(BaseModel):
    """One stored take inside an imported transcript archive."""

    agent_id: str = Field(..., max_length=50)
    agent_number: int | None = Field(None, ge=1, le=4)
    verdict: str = Field("", max_length=2000)
    one_liner: str | None = Field(None, max_length=500)
    confidence: int = Field(80, ge=0, le=100)
    key_assumption: str | None = Field(None, max_length=500)
    timestamp: datetime | None = Field(None)


class ImportedChatTurn(BaseModel):
    """One exchange inside an imported transcript archive."""

    turn_id: str = Field("", max_length=64)
    prompt: str = Field(..., max_length=2000)
    prompt_category: str | None = Field(None, max_length=50)
    agent_responses: dict[str, ImportedAgentResponse] = Field(
        ...,
        max_length=8,
        description="Stored takes keyed by agent id.",
    )
    winner_id: str = Field("", max_length=50)
    timestamp: datetime | None = Field(None)

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value: str) -> str:
        return sanitize_model_text(value, max_length=2000, field_name="prompt")

    @field_validator("prompt_category")
    @classmethod
    def validate_category(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return sanitize_model_text(value, max_length=50, field_name="prompt_category")


class ImportedChat(BaseModel):
    """One chat to restore from an exported Arena archive."""

    title: str | None = Field(None, max_length=SESSION_TITLE_MAX)
    turns: list[ImportedChatTurn] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="Imported exchanges, capped at the live short-term limit.",
    )


class ImportChatsRequest(BaseModel):
    """Body for restoring exported Arena transcript archives."""

    chats: list[ImportedChat] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Chats to restore, capped so one request stays bounded.",
    )


# In-memory sessions are stored as raw dicts in MemoryManager._store.
# Each entry has a `session_data` (SessionData) and we need to project
# a small summary for the list endpoint so the response stays tiny.
# A "user-owned" check at the state level is what guards against cross-
# tenant access — we use it consistently across get / list / delete so
# the 404-oracle rule applies uniformly.
def _state_user_id(state: dict) -> str:
    """Pull the owning user id from a session state, falling back to
    the session_data payload if the state itself doesn't carry one."""
    owner = state.get("user_id")
    if not owner:
        session_data = state.get("session_data")
        if session_data is not None:
            owner = getattr(session_data, "user_id", None)
    return str(owner or "").strip()


def _is_owner(state: dict, user_id) -> bool:
    owner = _state_user_id(state)
    if not owner or owner in ("anonymous", "None"):
        return False
    return owner == str(user_id)


def _session_summary(session_id: str, state: dict) -> dict:
    """Project the small sidebar row for a live session state."""
    session_data = state.get("session_data")
    topics = list(getattr(session_data, "topics", []) or [])
    turns = list(getattr(session_data, "turns", []) or [])
    return {
        "session_id": session_id,
        "title": state.get("session_title"),
        "topics": topics,
        "primary_topic": topics[0] if topics else None,
        "last_prompt": turns[-1].prompt if turns else None,
        "turn_count": len(turns),
        "pinned": bool(state.get("session_pinned", False)),
        "last_active": session_data.last_active.isoformat()
        if getattr(session_data, "last_active", None)
        else None,
    }


@router.get(
    "/session/{session_id}",
    response_model=SessionData,
    responses={404: {"model": ErrorResponse}},
)
async def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: UserResponse = Depends(get_current_user_required),
) -> SessionData:
    """
    Retrieve a session by ID.
    Checks short-term memory first, then long-term storage.
    Requires authentication - users can only access their own sessions.
    """
    # 60/min/user — session hydrate on route enter; block id-scan spam.
    enforce_user_rate_limit(
        user.id,
        scope="session_get",
        limit=60,
        window_seconds=60,
        message="Too many session reads. Please slow down.",
    )
    memory = get_memory_manager()
    session = memory.get_session(session_id)

    # Uniform 404 for missing *and* foreign sessions so session_id cannot be
    # enumerated via 403 vs 404 (existence / ownership oracle).
    if not session or str(session.user_id or "").strip() != str(user.id):
        raise HTTPException(
            status_code=404,
            detail={"error": ErrorCodes.NOT_FOUND, "message": "Session not found"},
        )

    return session


@router.get("/sessions")
async def list_sessions(
    user: UserResponse = Depends(get_current_user_required),
    limit: int = Query(50, ge=1, le=200, description="Maximum sessions to return."),
) -> dict:
    """List the caller's active in-memory sessions.

    Short-term sessions live in process memory (MemoryManager._store), so
    this list is a snapshot of what's currently live. Once a session is
    compressed via /api/memory/save it disappears from this list and
    reappears under /api/memory/summaries instead. The two endpoints
    cover the full lifecycle: live chats here, persisted memory there.

    Each row carries the bare minimum (id, topic, last prompt, last_active)
    so the list payload stays small even if a user has 50 active threads.
    """
    # 60/min/user — list walks in-memory store; cap hostile polling.
    enforce_user_rate_limit(
        user.id,
        scope="session_list",
        limit=60,
        window_seconds=60,
        message="Too many session list reads. Please slow down.",
    )
    memory = get_memory_manager()
    # _store lives on ShortTermMemory; MemoryManager wraps it under
    # .short_term. Reaching through keeps the route decoupled from
    # the manager's public surface — a future swap of in-memory for
    # Redis would only need to change ShortTermMemory.
    store = getattr(memory, "short_term", None)
    store = getattr(store, "_store", {}) if store is not None else {}

    rows = []
    for sid, state in store.items():
        if not _is_owner(state, user.id):
            continue
        if state.get("session_data") is None:
            continue
        rows.append(_session_summary(sid, state))

    # Newest first so the UI's "Recent" tab shows the most recent
    # activity at the top without a client-side sort.
    rows.sort(key=lambda r: r["last_active"] or "", reverse=True)
    # Apply limit AFTER sort so the limit slices the most recent N
    # rather than an arbitrary subset.
    rows = rows[:limit]

    return {
        "sessions": rows,
        "total": len(rows),
        "limit": limit,
    }


@router.patch("/session/{session_id}")
async def rename_session(
    session_id: str,
    body: RenameSessionRequest,
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    """Rename one of the caller's live in-memory sessions.

    The title is stored on the session state so the sidebar can show a
    readable, user-chosen label instead of the last prompt. Foreign and
    missing ids return the same 404 so session ids cannot be enumerated.
    """
    enforce_user_rate_limit(
        user.id,
        scope="session_rename",
        limit=60,
        window_seconds=60,
        message="Too many session renames. Please slow down.",
    )
    memory = get_memory_manager()
    store = getattr(memory, "short_term", None)
    store = getattr(store, "_store", {}) if store is not None else {}

    state = store.get(session_id)
    if state is None or not _is_owner(state, user.id):
        raise HTTPException(
            status_code=404,
            detail={"error": ErrorCodes.NOT_FOUND, "message": "Session not found"},
        )

    state["session_title"] = body.title
    return {"status": "renamed", "session_id": session_id, "title": body.title}


@router.post("/session/{session_id}/duplicate")
async def duplicate_session(
    session_id: str,
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    """Duplicate one of the caller's live in-memory sessions.

    A duplicate is an independent fork: same transcript, topics, and
    custom title, but a fresh id, unpinned state, and its own activity
    clock. Missing and foreign ids return the same 404 so session ids
    cannot be enumerated.
    """
    enforce_user_rate_limit(
        user.id,
        scope="session_duplicate",
        limit=30,
        window_seconds=60,
        message="Too many session duplicates. Please slow down.",
    )
    memory = get_memory_manager()
    store = getattr(memory, "short_term", None)
    store = getattr(store, "_store", {}) if store is not None else {}

    state = store.get(session_id)
    if state is None or not _is_owner(state, user.id):
        raise HTTPException(
            status_code=404,
            detail={"error": ErrorCodes.NOT_FOUND, "message": "Session not found"},
        )

    new_id = memory.short_term.duplicate_session(session_id, user_id=str(user.id))
    if new_id is None:
        raise HTTPException(
            status_code=404,
            detail={"error": ErrorCodes.NOT_FOUND, "message": "Session not found"},
        )

    duplicated_state = store.get(new_id)
    if duplicated_state is None:
        raise HTTPException(
            status_code=404,
            detail={"error": ErrorCodes.NOT_FOUND, "message": "Session not found"},
        )

    return {
        "status": "duplicated",
        "session_id": new_id,
        "session": _session_summary(new_id, duplicated_state),
    }


@router.post("/sessions/bulk/duplicate")
async def duplicate_selected_sessions(
    body: BulkDuplicateSessionsRequest,
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    """Fork a caller-selected subset of live in-memory sessions.

    Like bulk delete/pin, this touches only the ids supplied in the request.
    Foreign and missing ids are skipped without revealing them, and the
    response returns the freshly created session summaries so the UI can
    surface the forks immediately.
    """
    enforce_user_rate_limit(
        user.id,
        scope="session_bulk_duplicate",
        limit=20,
        window_seconds=60,
        message="Too many bulk session duplicates. Please slow down.",
    )
    memory = get_memory_manager()
    store = getattr(memory, "short_term", None)
    store = getattr(store, "_store", {}) if store is not None else {}

    sessions: list[dict] = []
    for sid in dict.fromkeys(body.session_ids):
        state = store.get(sid)
        # Same ownership gate as single-session duplicate and every other
        # session route. duplicate_session also checks ownership, but its
        # anonymous-session semantics are deliberately more permissive for
        # claimable write paths; bulk fork must not become a way for an
        # authenticated caller to fork an anonymous session by id.
        if state is None or not _is_owner(state, user.id):
            continue
        new_id = memory.short_term.duplicate_session(sid, user_id=str(user.id))
        if new_id is None:
            continue
        new_state = store.get(new_id)
        if new_state is None:
            continue
        sessions.append(_session_summary(new_id, new_state))

    return {
        "status": "duplicated",
        "duplicated": len(sessions),
        "sessions": sessions,
    }


def _clean_import_text(value: str | None, *, max_length: int, field_name: str) -> str:
    """Clean imported free text without failing on empty optional fields."""
    if value is None or not value.strip():
        return ""
    return sanitize_model_text(value, max_length=max_length, field_name=field_name)


def _agent_number_for_id(agent_id: str) -> int | None:
    """Map an official Arena slot id (agent_1..agent_4) to its number."""
    if agent_id not in {"agent_1", "agent_2", "agent_3", "agent_4"}:
        return None
    try:
        number = int(agent_id.rsplit("_", 1)[-1])
    except (TypeError, ValueError):
        return None
    return number if 1 <= number <= 4 else None


@router.post("/sessions/import")
async def import_sessions(
    body: ImportChatsRequest,
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    """Restore exported Arena transcript archives as new resumable chats.

    Imported chats are always created fresh: new ids, unpinned, owned by the
    caller, with their own activity clock. Source session ids and timestamps
    are preserved inside the transcript for provenance but never trusted as
    ownership. Only official Arena slot ids (agent_1..agent_4) are accepted
    for imported takes; anything else is dropped rather than resurrected as
    a spoofed or stale persona.
    """
    enforce_user_rate_limit(
        user.id,
        scope="session_import",
        limit=10,
        window_seconds=3600,
        message="Too many chat archive imports. Limit is 10 per hour.",
    )
    memory = get_memory_manager()

    bundles: list[dict] = []
    for chat in body.chats:
        turns: list[SessionTurn] = []
        exchanges: list[dict] = []
        for raw_turn in chat.turns:
            agent_responses: dict[str, AgentResponse] = {}
            for agent_id, raw in raw_turn.agent_responses.items():
                agent_number = _agent_number_for_id(agent_id)
                if agent_number is None:
                    continue
                verdict = _clean_import_text(
                    raw.verdict, max_length=2000, field_name="verdict"
                )
                one_liner = _clean_import_text(
                    raw.one_liner, max_length=500, field_name="one_liner"
                )
                key_assumption = _clean_import_text(
                    raw.key_assumption, max_length=500, field_name="key_assumption"
                )
                agent_responses[agent_id] = AgentResponse(
                    agent_id=agent_id,
                    agent_number=agent_number,
                    verdict=verdict,
                    one_liner=one_liner,
                    confidence=raw.confidence,
                    key_assumption=key_assumption,
                    timestamp=raw.timestamp or utcnow_naive(),
                )
            if not agent_responses:
                continue

            prompt = _clean_import_text(
                raw_turn.prompt, max_length=2000, field_name="prompt"
            )
            if not prompt:
                continue
            category = raw_turn.prompt_category
            if category is not None and not category.strip():
                category = None
            winner_id = (
                raw_turn.winner_id
                if raw_turn.winner_id in agent_responses
                else next(iter(agent_responses))
            )
            turn = SessionTurn(
                turn_id=raw_turn.turn_id or str(uuid.uuid4()),
                prompt=prompt,
                agent_responses=agent_responses,
                winner_id=winner_id,
                timestamp=raw_turn.timestamp or utcnow_naive(),
            )
            turns.append(turn)
            exchanges.append(
                {
                    "turn": len(turns),
                    "prompt": prompt,
                    "prompt_category": category or "question",
                    "winner_agent_id": winner_id,
                    "winner_persona_id": None,
                    "winner_one_liner": agent_responses[winner_id].one_liner,
                    "all_responses": [
                        {
                            "agent_id": response.agent_id,
                            "persona_id": None,
                            "one_liner": response.one_liner,
                            "score": 0,
                            "confidence": response.confidence,
                        }
                        for response in agent_responses.values()
                    ],
                    "timestamp": turn.timestamp,
                }
            )

        if not turns:
            continue
        bundles.append(
            {
                "title": (
                    _clean_import_text(
                        chat.title, max_length=SESSION_TITLE_MAX, field_name="title"
                    )
                    or None
                ),
                "turns": turns,
                "exchanges": exchanges,
            }
        )

    restored_states = memory.short_term.restore_sessions(
        bundles, user_id=str(user.id)
    )
    sessions = [
        _session_summary(state["session_id"], state) for state in restored_states
    ]
    return {
        "status": "imported",
        "imported": len(sessions),
        "sessions": sessions,
    }


@router.patch("/session/{session_id}/pin")
async def set_session_pin(
    session_id: str,
    body: PinSessionRequest,
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    """Pin or unpin one of the caller's live in-memory sessions.

    Pinned chats are surfaced first in the sidebar so users can keep
    important threads within reach. The flag lives on the same session
    state dict as the custom title, so it disappears along with the
    session when the in-memory chat is cleared or compressed.
    """
    enforce_user_rate_limit(
        user.id,
        scope="session_pin",
        limit=60,
        window_seconds=60,
        message="Too many session pin updates. Please slow down.",
    )
    memory = get_memory_manager()
    store = getattr(memory, "short_term", None)
    store = getattr(store, "_store", {}) if store is not None else {}

    state = store.get(session_id)
    if state is None or not _is_owner(state, user.id):
        raise HTTPException(
            status_code=404,
            detail={"error": ErrorCodes.NOT_FOUND, "message": "Session not found"},
        )

    state["session_pinned"] = body.pinned
    return {
        "status": "pinned" if body.pinned else "unpinned",
        "session_id": session_id,
        "pinned": body.pinned,
    }


@router.delete("/session/{session_id}")
async def delete_session(
    session_id: str,
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    """Clear a single in-memory session.

    Foreign-or-missing ids return 404 with the same shape so a caller
    can't enumerate other users' session_ids by status code. This is
    destructive but bounded — the session is in memory, not persisted,
    so the worst case is losing an active chat thread.
    """
    enforce_user_rate_limit(
        user.id,
        scope="session_delete",
        limit=60,
        window_seconds=3600,
        message="Too many session deletes. Limit is 60 per hour.",
    )
    memory = get_memory_manager()
    # _store lives on ShortTermMemory; MemoryManager wraps it under
    # .short_term. Reaching through keeps the route decoupled from
    # the manager's public surface — a future swap of in-memory for
    # Redis would only need to change ShortTermMemory.
    store = getattr(memory, "short_term", None)
    store = getattr(store, "_store", {}) if store is not None else {}

    # Ownership check first — refuse to delete a session we don't own
    # even if it exists, to keep the 404 contract uniform: missing
    # and foreign look identical to the caller.
    state = store.get(session_id)
    if state is None or not _is_owner(state, user.id):
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Session not found"},
        )

    # clear_session pops the entry from _store — same code path the
    # /api/memory/save handler uses after compression. Also drop the
    # persona_integrity drift history for this session_id so the
    # in-process defaultdict doesn't grow unbounded for users who
    # delete sessions frequently.
    memory.clear_session(session_id)
    clear_session_history(session_id)
    return {"status": "deleted", "session_id": session_id}


@router.delete("/sessions")
async def delete_all_sessions(
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    """Clear every in-memory session owned by the caller.

    "Sign out everywhere" / "start fresh" semantics. Foreign sessions
    are not touched — we iterate _store and only delete the entries
    whose owner matches the caller. The response reports the count so
    the UI can show '5 sessions cleared'.
    """
    enforce_user_rate_limit(
        user.id,
        scope="session_delete",
        limit=10,
        window_seconds=3600,
        message="Too many bulk session deletes. Limit is 10 per hour.",
    )
    memory = get_memory_manager()
    store = getattr(memory, "short_term", None)
    store = getattr(store, "_store", {}) if store is not None else {}

    deleted = 0
    # Snapshot the keys first — mutating _store during iteration would
    # raise RuntimeError.
    for sid in list(store.keys()):
        state = store.get(sid)
        if state is not None and _is_owner(state, user.id):
            memory.clear_session(sid)
            # Mirror the per-session cleanup: drop the persona_integrity
            # drift history alongside the in-memory session state.
            clear_session_history(sid)
            deleted += 1
    return {"status": "deleted", "deleted": deleted}


@router.delete("/sessions/bulk")
async def delete_selected_sessions(
    body: BulkDeleteSessionsRequest,
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    """Delete a caller-selected subset of live in-memory sessions.

    Unlike clear-all, this endpoint touches only the ids supplied in the
    request. Foreign and missing ids are skipped (the 404-oracle rule is
    preserved by not revealing them), and the response lists exactly which
    ids were removed so the UI can reconcile stale rows without guessing.
    """
    enforce_user_rate_limit(
        user.id,
        scope="session_bulk_delete",
        limit=20,
        window_seconds=3600,
        message="Too many bulk session deletes. Limit is 20 per hour.",
    )
    memory = get_memory_manager()
    store = getattr(memory, "short_term", None)
    store = getattr(store, "_store", {}) if store is not None else {}

    deleted_ids: list[str] = []
    for sid in dict.fromkeys(body.session_ids):
        state = store.get(sid)
        if state is None or not _is_owner(state, user.id):
            continue
        memory.clear_session(sid)
        # Mirror the single-session cleanup: drop persona_integrity drift
        # history alongside the in-memory session state.
        clear_session_history(sid)
        deleted_ids.append(sid)

    return {
        "status": "deleted",
        "deleted": len(deleted_ids),
        "deleted_ids": deleted_ids,
    }


@router.patch("/sessions/bulk/pin")
async def set_selected_sessions_pin(
    body: BulkPinSessionsRequest,
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    """Pin or unpin a caller-selected subset of live in-memory sessions.

    Like bulk delete, this touches only the ids supplied in the request.
    Foreign and missing ids are skipped without revealing them, and the
    response lists exactly which ids were updated so the UI can reconcile
    stale rows without guessing.
    """
    enforce_user_rate_limit(
        user.id,
        scope="session_bulk_pin",
        limit=60,
        window_seconds=60,
        message="Too many bulk session pin updates. Please slow down.",
    )
    memory = get_memory_manager()
    store = getattr(memory, "short_term", None)
    store = getattr(store, "_store", {}) if store is not None else {}

    updated_ids: list[str] = []
    for sid in dict.fromkeys(body.session_ids):
        state = store.get(sid)
        if state is None or not _is_owner(state, user.id):
            continue
        state["session_pinned"] = body.pinned
        updated_ids.append(sid)

    return {
        "status": "pinned" if body.pinned else "unpinned",
        "updated": len(updated_ids),
        "updated_ids": updated_ids,
    }
