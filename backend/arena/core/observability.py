"""Observability — structured JSON logging, request tracing, health endpoint data"""

import json
import logging
import logging.handlers
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from sqlalchemy.orm import Session

from arena.db_models import PersonaDriftLog, ScoringAudit, UXEvent

logger = logging.getLogger(__name__)

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
            "stage_timings_ms": agent_timings_ms,
            "total_processing_ms": total_processing_ms,
            "winner_agent_id": winner_agent_id,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_cost_usd": round(estimated_cost_usd, 6),
            "errors": errors or [],
            "warnings": warnings or [],
        },
    )


class LatencyTracker:
    def __init__(self):
        self.stages: dict[str, int] = {}
        self.start_time = time.monotonic()

    def mark(self, stage: str):
        self.stages[stage] = int((time.monotonic() - self.start_time) * 1000)

    def get_all(self) -> dict:
        return self.stages.copy()

    def get_stage_duration(self, start_stage: str, end_stage: str) -> int | None:
        start = self.stages.get(start_stage)
        end = self.stages.get(end_stage)
        if start is not None and end is not None:
            return end - start
        return None


async def log_drift_result(
    session_id: str,
    user_id: int | None,
    persona_id: str,
    agent_id: str,
    prompt_snippet: str,
    drift_detected: bool,
    overlap_detected: bool,
    overlap_score: float | None,
    reprompt_triggered: bool,
    reprompt_success: bool | None,
    original_response_snippet: str,
    final_response_snippet: str | None,
    db: Session,
) -> None:
    try:
        log = PersonaDriftLog(
            session_id=session_id,
            user_id=user_id,
            persona_id=persona_id,
            agent_id=agent_id,
            prompt_snippet=prompt_snippet,
            drift_detected=drift_detected,
            overlap_detected=overlap_detected,
            overlap_score=overlap_score,
            reprompt_triggered=reprompt_triggered,
            reprompt_success=reprompt_success,
            original_response_snippet=original_response_snippet,
            final_response_snippet=final_response_snippet,
        )
        db.add(log)
        db.commit()
    except Exception:
        logger.exception("drift log failed")
        db.rollback()


async def log_scoring_result(
    session_id: str,
    user_id: int | None,
    prompt_snippet: str,
    prompt_category: str | None,
    winner_agent_id: str,
    winner_persona_id: str,
    winner_score: int,
    scores: dict,
    criteria_breakdown: dict | None,
    confidence_values: list | None,
    persona_ids_used: list | None,
    scoring_duration_ms: int | None,
    fallback_used: bool,
    db: Session,
) -> None:
    try:
        audit = ScoringAudit(
            session_id=session_id,
            user_id=user_id,
            prompt_snippet=prompt_snippet,
            prompt_category=prompt_category,
            winner_agent_id=winner_agent_id,
            winner_persona_id=winner_persona_id,
            winner_score=winner_score,
            scores=scores,
            criteria_breakdown=criteria_breakdown,
            confidence_values=confidence_values,
            persona_ids_used=persona_ids_used,
            scoring_duration_ms=scoring_duration_ms,
            fallback_used=fallback_used,
        )
        db.add(audit)
        db.commit()
    except Exception:
        logger.exception("scoring audit failed")
        db.rollback()


async def log_ux_event(
    session_id: str,
    event_type: str,
    user_id: int | None,
    persona_id: str | None,
    agent_id: str | None,
    metadata: dict | None,
    db: Session,
) -> None:
    try:
        event = UXEvent(
            user_id=user_id,
            session_id=session_id,
            event_type=event_type,
            persona_id=persona_id,
            agent_id=agent_id,
            event_metadata=metadata,
        )
        db.add(event)
        db.commit()
    except Exception:
        logger.exception("ux event failed")
        db.rollback()


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

def _read_rss_bytes() -> Optional[int]:
    """Read RSS (resident set size) for the current process in bytes.

    Prefers ``psutil`` for cross-platform reliability, but falls back to
    parsing ``/proc/self/status`` so the endpoint stays useful on minimal
    images that do not ship psutil. Returns ``None`` when neither path
    yields a number, instead of raising — operators only see this field
    go missing rather than the whole endpoint 500.
    """
    try:
        import psutil  # type: ignore[import-not-found]

        return int(psutil.Process(os.getpid()).memory_info().rss)
    except Exception:
        pass

    status_path = Path("/proc/self/status")
    if not status_path.exists():
        return None
    try:
        for line in status_path.read_text().splitlines():
            if line.startswith("VmRSS:"):
                parts = line.split()
                if len(parts) >= 2 and parts[1].isdigit():
                    # VmRSS is reported in kilobytes.
                    return int(parts[1]) * 1024
    except Exception:
        return None
    return None


def _read_open_fd_count() -> Optional[int]:
    """Count file descriptors currently open by this process.

    Falls back to ``/proc/self/fd`` on Linux and silently returns
    ``None`` on platforms (or sandboxes) where that path isn't readable.
    """
    fd_dir = Path("/proc/self/fd")
    if not fd_dir.exists():
        return None
    try:
        return sum(1 for entry in fd_dir.iterdir())
    except Exception:
        return None


def _read_cpu_count() -> Optional[int]:
    """Return the host's logical CPU count, or ``None`` if it cannot be read."""
    try:
        return os.cpu_count()
    except Exception:
        return None


def get_health_data(db_connected: bool) -> dict:
    """Public health payload exposed at GET /api/health.

    status is healthy only when the database is reachable; otherwise degraded.
    Callers (load balancers, Render) should treat degraded as not fully ready.

    This is the UNAUTHENTICATED surface — keep it minimal. Operational
    detail (uptime, version, worker identity) is exposed only via
    get_health_data_detailed(), which the /api/health/detailed endpoint
    gates behind authentication. The split exists because uptime_seconds
    + version pin the release window in a way that helps an attacker pick
    the right exploit timing.
    """
    return {
        "status": "healthy" if db_connected else "degraded",
        "database": "connected" if db_connected else "disconnected",
    }


def get_health_data_detailed(db_connected: bool) -> dict:
    """Authenticated, operator-facing health payload.

    Returns the public fields plus app version, process uptime, and the
    worker's OS PID. Returned only by /api/health/detailed which requires
    a valid bearer token. NEVER call this from an unauthenticated path.

    Notably ABSENT here is a request-count field — a per-process counter
    would be misleading (multi-worker Render deployments see N independent
    counters, and showing a single one lies). Drop the field rather than
    expose a value that silently misrepresents the deployment.
    """
    import os
    from arena.config import get_settings
    # Lazy import: avoid import-time coupling between observability and auth.
    from arena.core.auth import legacy_hits

    settings = get_settings()
    uptime = int(time.time() - _app_start_time)
    return {
        **get_health_data(db_connected),
        "version": settings.app_version,
        "uptime_seconds": uptime,
        "worker_pid": os.getpid(),
        # Operator telemetry (admin-gated route only): how many times the
        # legacy-password verify path has matched since process start.
        # Stays nonzero only while pre-SHA256-prehash accounts still log in.
        # Once this stays 0 for a full user-active window (~90 days), the
        # fallback branch can be deleted safely.
        "legacy_password_hits": legacy_hits(),
        # Process-resource snapshot. Each helper swallows its own
        # exceptions so a single unavailable metric never takes down the
        # endpoint — operators see the field go ``null`` instead of a 500.
        "process_rss_bytes": _read_rss_bytes(),
        "process_open_fds": _read_open_fd_count(),
        "host_cpu_count": _read_cpu_count(),
    }
