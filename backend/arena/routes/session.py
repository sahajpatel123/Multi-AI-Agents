"""Session route — retrieve and manage session data"""

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session

from arena.models.schemas import SessionData, ErrorResponse, UserResponse
from arena.core.memory import get_memory_manager
from arena.core.persona_integrity import clear_session_history
from arena.core.dependencies import get_current_user_required
from arena.core.errors import ErrorCodes
from arena.core.rate_limits import enforce_user_rate_limit
from arena.database import get_db


router = APIRouter(prefix="/api", tags=["session"])


# In-memory sessions are stored as raw dicts in MemoryManager._store.
# Each entry has a `session_data` (SessionData) and we need to project
# a small summary for the list endpoint so the response stays tiny.
# A "user-owned" check at the state level is what guards against cross-
# tenant access — we use it consistently across get / list / delete so
# the 404-oracle rule applies uniformly.
def _state_user_id(state: dict) -> str:
    """Pull the owning user id from a session state, falling back to
    the session_data payload if the state itself doesn't carry one."""
    return str(
        state.get("user_id")
        or state.get("session_data", {}).user_id
        or ""
    ).strip()


def _is_owner(state: dict, user_id) -> bool:
    owner = _state_user_id(state)
    if not owner or owner in ("anonymous", "None"):
        return False
    return owner == str(user_id)


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

    Each row carries the bare minimum (id, topic, last_active) so the
    list payload stays small even if a user has 50 active threads.
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
        session_data = state.get("session_data")
        if session_data is None:
            continue
        topics = list(getattr(session_data, "topics", []) or [])
        rows.append({
            "session_id": sid,
            "topics": topics,
            "primary_topic": topics[0] if topics else None,
            "turn_count": len(getattr(session_data, "turns", []) or []),
            "last_active": session_data.last_active.isoformat()
            if getattr(session_data, "last_active", None)
            else None,
        })

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
