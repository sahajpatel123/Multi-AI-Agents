"""Session route — retrieve and manage session data"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from arena.models.schemas import SessionData, ErrorResponse, UserResponse
from arena.core.memory import get_memory_manager
from arena.core.dependencies import get_current_user_required
from arena.database import get_db


router = APIRouter(prefix="/api", tags=["session"])


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
    memory = get_memory_manager()
    session = memory.get_session(session_id)

    # Uniform 404 for missing *and* foreign sessions so session_id cannot be
    # enumerated via 403 vs 404 (existence / ownership oracle).
    if not session or str(session.user_id or "").strip() != str(user.id):
        raise HTTPException(status_code=404, detail="Session not found")

    return session
