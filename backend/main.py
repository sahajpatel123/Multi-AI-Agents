"""FastAPI application entry point"""

import asyncio
import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from arena.config import get_settings
from arena.core.seed_personas import seed_persona_library
from arena.core.observability import get_health_data, setup_logging
from arena.database import SessionLocal, get_db, init_db
from arena.routes.auth import router as auth_router
from arena.routes.personas import router as personas_router
from arena.routes.panels import router as panels_router
from arena.routes.prompt import router as prompt_router
from arena.routes.debate import router as debate_router
from arena.routes.discuss import router as discuss_router
from arena.routes.memory import memory_router
from arena.routes.saved import router as saved_router
from arena.routes.session import router as session_router

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()

    setup_logging()
    init_db()

    app = FastAPI(
        title="Arena",
        description="Multi-AI Agent Chatroom API",
        version=settings.app_version,
        debug=settings.debug,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router)
    app.include_router(prompt_router)
    app.include_router(debate_router)
    app.include_router(discuss_router)
    app.include_router(session_router)
    app.include_router(memory_router, prefix="/api/memory")
    app.include_router(personas_router, prefix="/api")
    app.include_router(panels_router, prefix="/api")
    app.include_router(saved_router, prefix="/api")

    @app.on_event("startup")
    async def seed_personas_on_startup() -> None:
        db = SessionLocal()
        try:
            await seed_persona_library(db)
        except Exception as exc:
            logger.exception("Persona library seed failed: %s", exc)
        finally:
            db.close()

    @app.get("/api/health", tags=["health"])
    async def health_check(db: Session = Depends(get_db)):
        db_ok = False
        try:
            db.execute(text("SELECT 1"))
            db_ok = True
        except Exception:
            pass
        return get_health_data(db_connected=db_ok)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
