"""Session route — retrieve and manage session data"""

from fastapi import APIRouter, HTTPException

from arena.models.schemas import SessionData, ErrorResponse
from arena.core.memory import get_memory_manager


router = APIRouter(prefix="/api", tags=["session"])


@router.get(
    "/session/{session_id}",
    response_model=SessionData,
    responses={404: {"model": ErrorResponse}},
)
async def get_session(session_id: str) -> SessionData:
    """
    Retrieve a session by ID.
    Checks short-term memory first, then long-term storage.
    """
    memory = get_memory_manager()
    session = memory.get_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return session
