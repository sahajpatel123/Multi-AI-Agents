"""Observability — structured JSON logging, request tracing, health endpoint data"""

import json
import logging
import logging.handlers
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ─────────────────────────────────────────────────
# Log setup — daily rotating JSON log file
# ─────────────────────────────────────────────────

_LOG_DIR = Path(__file__).parent.parent.parent / "logs"
_LOG_DIR.mkdir(parents=True, exist_ok=True)
_LOG_FILE = _LOG_DIR / "arena.log"

_app_start_time = time.time()
_requests_today: int = 0


class _JsonFormatter(logging.Formatter):
    """Emit each log record as a single JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        base = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Merge any extra fields attached to the record
        for key, value in record.__dict__.items():
            if key not in (
                "args", "asctime", "created", "exc_info", "exc_text",
                "filename", "funcName", "id", "levelname", "levelno",
                "lineno", "message", "module", "msecs", "msg", "name",
                "pathname", "process", "processName", "relativeCreated",
                "stack_info", "thread", "threadName", "taskName",
            ):
                base[key] = value
        return json.dumps(base, default=str)


def setup_logging() -> None:
    """Configure the arena logger with daily rotation. Called once at startup."""
    arena_logger = logging.getLogger("arena")
    arena_logger.setLevel(logging.INFO)

    if arena_logger.handlers:
        return  # Already configured

    # Rotating file handler — daily, keep 30 days
    file_handler = logging.handlers.TimedRotatingFileHandler(
        filename=str(_LOG_FILE),
        when="midnight",
        interval=1,
        backupCount=30,
        utc=True,
        encoding="utf-8",
    )
    file_handler.setFormatter(_JsonFormatter())
    arena_logger.addHandler(file_handler)

    # Console handler for development
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(_JsonFormatter())
    arena_logger.addHandler(console_handler)

    arena_logger.propagate = False


_logger = logging.getLogger("arena.requests")


# ─────────────────────────────────────────────────
# Request context
# ─────────────────────────────────────────────────

def new_request_id() -> str:
    return str(uuid.uuid4())


def log_request(
    request_id: str,
    user_id: str,
    prompt_length: int,
    prompt_category: str,
    agent_timings_ms: dict[str, int],
    total_processing_ms: int,
    winner_agent_id: str,
    input_tokens: int,
    output_tokens: int,
    estimated_cost_usd: float,
    errors: Optional[list[str]] = None,
    warnings: Optional[list[str]] = None,
) -> None:
    """Log a completed request. Never logs prompt content."""
    global _requests_today
    _requests_today += 1

    _logger.info(
        "request_complete",
        extra={
            "request_id": request_id,
            "user_id": user_id,
            "prompt_length_chars": prompt_length,
            "prompt_category": prompt_category,
            "agent_timings_ms": agent_timings_ms,
            "total_processing_ms": total_processing_ms,
            "winner_agent_id": winner_agent_id,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_cost_usd": round(estimated_cost_usd, 6),
            "errors": errors or [],
            "warnings": warnings or [],
        },
    )


def log_toxicity_rejection(request_id: str, user_id: str, reason: str) -> None:
    _logger.warning(
        "toxicity_rejection",
        extra={
            "request_id": request_id,
            "user_id": user_id,
            "reason": reason,
        },
    )


def log_rate_limit_hit(request_id: str, user_id: str, tier: str, used: int, limit: int) -> None:
    _logger.warning(
        "rate_limit_hit",
        extra={
            "request_id": request_id,
            "user_id": user_id,
            "tier": tier,
            "prompts_used": used,
            "daily_limit": limit,
        },
    )


def log_agent_timeout(request_id: str, agent_id: str, timeout_seconds: int) -> None:
    _logger.error(
        "agent_timeout",
        extra={
            "request_id": request_id,
            "agent_id": agent_id,
            "timeout_seconds": timeout_seconds,
        },
    )


def log_unhandled_exception(request_id: str, user_id: str, exc: Exception) -> None:
    _logger.exception(
        "unhandled_exception",
        extra={
            "request_id": request_id,
            "user_id": user_id,
            "exception_type": type(exc).__name__,
            "exception_message": str(exc),
        },
    )


# ─────────────────────────────────────────────────
# Health data
# ─────────────────────────────────────────────────

def get_health_data(db_connected: bool) -> dict:
    from arena.config import get_settings
    settings = get_settings()
    uptime = int(time.time() - _app_start_time)
    return {
        "status": "healthy",
        "version": settings.app_version,
        "uptime_seconds": uptime,
        "database": "connected" if db_connected else "disconnected",
        "total_requests_today": _requests_today,
    }
