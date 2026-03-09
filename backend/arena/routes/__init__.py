"""API routes"""

from .prompt import router as prompt_router
from .debate import router as debate_router
from .discuss import router as discuss_router
from .session import router as session_router

__all__ = ["prompt_router", "debate_router", "discuss_router", "session_router"]
