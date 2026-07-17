"""API routes"""

from .auth import router as auth_router
from .prompt import router as prompt_router
from .debate import router as debate_router
from .discuss import router as discuss_router
from .session import router as session_router

__all__ = ["auth_router", "prompt_router", "debate_router", "discuss_router", "session_router"]
