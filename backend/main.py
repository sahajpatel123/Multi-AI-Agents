"""FastAPI application entry point"""

import asyncio
import logging
import traceback
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from arena.config import get_settings
from arena.core.seed_personas import seed_persona_library
from arena.core.observability import get_health_data, setup_logging
from arena.core.rate_limits import client_ip, rate_limiter
from arena.database import SessionLocal, get_db, init_db
from arena.routes.auth import router as auth_router, user_router
from arena.routes.analytics import router as analytics_router
from arena.routes.personas import router as personas_router
from arena.routes.panels import router as panels_router
from arena.routes.prompt import router as prompt_router
from arena.routes.debate import router as debate_router
from arena.routes.discuss import router as discuss_router
from arena.routes.memory import memory_router
from arena.routes.saved import router as saved_router
from arena.routes.session import router as session_router
from arena.routes.payments import router as payments_router
from arena.routes.agent import router as agent_router
from arena.routes.calibration import router as calibration_router
from arena.routes.rooms import router as rooms_router
from arena.routes.mcp import router as mcp_router
from arena.core.live_scheduler import schedule_live_checks
from arena.core.loyalty_scheduler import schedule_loyalty_checks
from arena.core.watchlist_runner import schedule_watchlist_checks

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# Security middleware
# ──────────────────────────────────────────────────────────────

class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests whose Content-Length exceeds max_size bytes."""

    def __init__(self, app, max_size: int = 10 * 1024):
        super().__init__(app)
        self.max_size = max_size

    async def dispatch(self, request: Request, call_next):
        path = request.url.path.rstrip("/")
        # Razorpay webhooks can exceed the default API body limit
        if path.endswith("/api/payments/webhook"):
            return await call_next(request)
        # Skip size check for OPTIONS preflight requests
        if request.method == "OPTIONS":
            return await call_next(request)
        max_allowed = self.max_size
        if path.endswith("/api/agent/upload"):
            max_allowed = 11 * 1024 * 1024  # 10MB file + multipart overhead
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > max_allowed:
            msg = (
                "File too large (max 10MB)"
                if path.endswith("/api/agent/upload")
                else "Request too large. Maximum 10KB allowed."
            )
            return JSONResponse(
                status_code=413,
                content={
                    "error": "payload_too_large",
                    "message": msg,
                },
            )
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to every response."""

    def __init__(self, app, is_production: bool = False):
        super().__init__(app)
        self.is_production = is_production

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if self.is_production:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        # Remove server fingerprinting headers
        if "server" in response.headers:
            del response.headers["server"]
        if "x-powered-by" in response.headers:
            del response.headers["x-powered-by"]
        return response


class GlobalRateLimitMiddleware(BaseHTTPMiddleware):
    """Apply a global 100 requests/minute/IP cap, excluding payment webhooks."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path.rstrip("/")
        if path.endswith("/api/payments/webhook"):
            return await call_next(request)
        rate_limiter.hit(
            f"global:{client_ip(request)}",
            limit=100,
            window_seconds=60,
            message="Too many requests from this IP. Please slow down.",
        )
        return await call_next(request)


# ──────────────────────────────────────────────────────────────
# App factory
# ──────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()

    # Validate secrets/API keys before starting
    settings.validate_secrets()
    settings.validate_api_keys()

    setup_logging()
    init_db()

    app = FastAPI(
        title="Arena",
        description="Multi-AI Agent Chatroom API",
        version=settings.app_version,
        debug=settings.debug,
    )

    # ── Rate limiting ─────────────────────────────────────────
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── Global exception handler ──────────────────────────────
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        error_detail = traceback.format_exc()
        # Always log full traceback server-side
        logger.error(
            "[GLOBAL ERROR] %s %s\n%s",
            request.method,
            request.url.path,
            error_detail,
        )
        if settings.is_production:
            return JSONResponse(
                status_code=500,
                content={
                    "error": "internal_server_error",
                    "message": "Something went wrong. Please try again.",
                },
            )
        # Development only — show detail for debugging
        return JSONResponse(
            status_code=500,
            content={
                "error": "internal_server_error",
                "message": str(exc),
                "detail": error_detail[-1000:],
            },
        )

    # ── Middleware (order matters — outermost runs first) ─────
    # Explicit origins only — required when allow_credentials=True (no "*")
    allowed_origins = [
        "https://multi-ai-agents-chi.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000",
    ]
    if settings.is_production and "*" in allowed_origins:
        logger.error("[SECURITY ERROR] CORS wildcard (*) is not allowed in production")
        raise ValueError("CORS wildcard not allowed in production")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["set-cookie"],
        max_age=3600,
    )
    app.add_middleware(GlobalRateLimitMiddleware)
    app.add_middleware(SecurityHeadersMiddleware, is_production=settings.is_production)
    app.add_middleware(RequestSizeLimitMiddleware, max_size=10 * 1024)

    # ── Routers ───────────────────────────────────────────────
    app.include_router(auth_router)
    app.include_router(user_router)
    app.include_router(prompt_router)
    app.include_router(debate_router)
    app.include_router(discuss_router)
    app.include_router(session_router)
    app.include_router(memory_router, prefix="/api/memory")
    app.include_router(personas_router, prefix="/api")
    app.include_router(panels_router, prefix="/api")
    app.include_router(saved_router, prefix="/api")
    app.include_router(analytics_router, prefix="/api")
    app.include_router(payments_router, prefix="/api/payments")
    app.include_router(agent_router, prefix="/api/agent")
    app.include_router(calibration_router, prefix="/api/calibration")
    app.include_router(rooms_router, prefix="/api/rooms")
    app.include_router(mcp_router, prefix="/api/mcp")

    # ── Startup ───────────────────────────────────────────────
    @app.on_event("startup")
    async def run_startup_tasks() -> None:
        db = SessionLocal()
        try:
            await seed_persona_library(db)
        except Exception as exc:
            logger.exception("Persona library seed failed: %s", exc)
        finally:
            db.close()

        asyncio.create_task(schedule_live_checks())
        asyncio.create_task(schedule_watchlist_checks())
        asyncio.create_task(schedule_loyalty_checks())

    # ── Health check ──────────────────────────────────────────
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
