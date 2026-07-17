"""Database setup — SQLAlchemy engine with PostgreSQL primary, SQLite fallback.

Uses psycopg 3 (postgresql+psycopg://) — psycopg 3 provides modern TLS
support and first-class SQLAlchemy 2.0 integration. The engine is built
lazily: a production DB outage does not prevent application startup.
Health probes and config validation run, then real traffic retries on
first connect.

Managed Postgres (Render / Neon / Cloud SQL) frequently aborts idle TLS
sessions or fails a cold-start handshake. Defense layers:

1. libpq URL params (sslmode, gssencmode, channel_binding, connect_timeout)
2. TCP keepalives so middleboxes do not silently drop sockets
3. pool_pre_ping + pool_recycle to discard dead pooled connections
4. Per-connect retry with backoff for transient SSL handshake failures
5. pool dispose + single request-time reconnect for poisoned pools
"""

from __future__ import annotations

import logging
import time
from typing import Any, Callable, Generator, Optional
from urllib.parse import urlparse

from sqlalchemy import create_engine, event, text, Engine
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError, OperationalError, InterfaceError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from arena.config import get_settings

logger = logging.getLogger(__name__)

# Transient connect failures worth retrying (cold start, brief TLS reset).
_RETRYABLE_CONNECT_MARKERS = (
    "ssl connection has been closed",
    "connection has been closed unexpectedly",
    "server closed the connection unexpectedly",
    "connection reset",
    "connection timed out",
    "timeout expired",
    "could not connect to server",
    "connection refused",
    "the database system is starting up",
    "the database system is in recovery mode",
    "too many connections",
    "remaining connection slots",
    "can't connect",
    "network is unreachable",
    "temporary failure",
    "broken pipe",
)


class Base(DeclarativeBase):
    pass


_engine: Optional[Engine] = None


def _safe_db_host(url: str) -> str:
    """Return host:port for logs without leaking credentials."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname or "?"
        port = parsed.port
        return f"{host}:{port}" if port else host
    except Exception:
        return "?"


def _is_retryable_connect_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return any(marker in msg for marker in _RETRYABLE_CONNECT_MARKERS)


def _pg_connect_kwargs(url: str) -> dict[str, Any]:
    """Translate a SQLAlchemy URL into kwargs for psycopg.connect()."""
    u = make_url(url)
    kwargs: dict[str, Any] = {
        "host": u.host,
        "port": u.port or 5432,
        "user": u.username,
        "password": u.password,
        "dbname": u.database,
        # TCP keepalives — managed PG proxies kill idle sockets silently.
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    }
    # URL query params (sslmode, connect_timeout, gssencmode, …)
    for key, value in u.query.items():
        # make_url may yield str or tuple for multi-value keys
        if isinstance(value, (list, tuple)):
            value = value[0] if value else ""
        kwargs[str(key)] = value
    # Drop Nones so psycopg does not receive password=None oddly
    return {k: v for k, v in kwargs.items() if v is not None}


def _make_retrying_pg_creator(url: str, max_attempts: int = 3) -> Callable[[], Any]:
    """Build a SQLAlchemy `creator` that retries transient TLS/network failures.

    Cold-start managed Postgres (and occasional mid-handshake TLS resets on
    public cloud IPs) often succeeds on the second attempt within a few
    seconds. Without this, a single failed handshake becomes a 500 login.
    """

    def creator() -> Any:
        import psycopg

        kwargs = _pg_connect_kwargs(url)
        host = kwargs.get("host") or "?"
        last_error: Optional[BaseException] = None

        for attempt in range(1, max_attempts + 1):
            try:
                return psycopg.connect(**kwargs)
            except Exception as exc:  # noqa: BLE001 — surface after retries
                last_error = exc
                retryable = _is_retryable_connect_error(exc)
                if attempt >= max_attempts or not retryable:
                    logger.error(
                        "PostgreSQL connect failed to %s after %d attempt(s): %s",
                        host,
                        attempt,
                        exc,
                    )
                    raise
                wait = min(2 ** attempt, 6)
                logger.warning(
                    "PostgreSQL connect attempt %d/%d to %s failed (%s). "
                    "Retrying in %ds...",
                    attempt,
                    max_attempts,
                    host,
                    exc,
                    wait,
                )
                time.sleep(wait)

        assert last_error is not None
        raise last_error

    return creator


def _create_pg_engine(url: str) -> Engine:
    # pool_pre_ping: drop dead connections before checkout (SSL EOF / idle kills).
    # pool_recycle: recycle before common managed-PG idle timeouts.
    # pool_use_lifo: prefer hot connections under bursty web traffic.
    # creator: per-connect retries for transient TLS handshake failures.
    engine = create_engine(
        url,
        creator=_make_retrying_pg_creator(url, max_attempts=3),
        pool_pre_ping=True,
        pool_recycle=280,
        pool_size=5,
        max_overflow=10,
        pool_timeout=30,
        pool_use_lifo=True,
        pool_reset_on_return="rollback",
    )

    @event.listens_for(engine, "invalidate")
    def _on_invalidate(dbapi_connection, connection_record, exception) -> None:  # noqa: ARG001
        if exception is not None:
            logger.warning(
                "Invalidated PostgreSQL connection (%s)",
                exception,
            )

    return engine


def _build_engine() -> Engine:
    settings = get_settings()
    primary_url = settings.database_url

    # Try PostgreSQL first (postgresql+psycopg:// via psycopg 3 driver)
    if primary_url and "postgresql" in primary_url:
        host = _safe_db_host(primary_url)
        # Short retry window helps with cold-start / transient TLS resets on
        # managed Postgres without delaying Render boot past health probes.
        max_attempts = 4 if settings.is_production else 1
        last_error: Optional[Exception] = None

        for attempt in range(1, max_attempts + 1):
            try:
                engine = _create_pg_engine(primary_url)
                with engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                logger.info(
                    "Connected to PostgreSQL (psycopg 3) at %s",
                    host,
                )
                return engine
            except Exception as e:
                last_error = e
                try:
                    engine.dispose()  # type: ignore[name-defined]
                except Exception:
                    pass
                if attempt < max_attempts:
                    wait = min(2 ** attempt, 8)
                    logger.warning(
                        "PostgreSQL connection attempt %d/%d to %s failed (%s). "
                        "Retrying in %ds...",
                        attempt,
                        max_attempts,
                        host,
                        e,
                        wait,
                    )
                    time.sleep(wait)
                    continue

        logger.error(
            "[CRITICAL] PostgreSQL unavailable at %s (%s). "
            "The application will start in degraded mode — "
            "/api/health will report 'degraded'. "
            "All DB-dependent endpoints return 503 until connectivity "
            "is restored. Ops tip: prefer the Internal Database URL on "
            "Render (same region); confirm the DB is not suspended and "
            "DATABASE_URL credentials are current.",
            host,
            last_error,
        )
        if settings.is_production:
            # Build a placeholder engine that will retry on first use.
            # SQLite fallback is deliberately NOT used — a blank DB
            # in production would silently drop all data.
            logger.info(
                "Starting with PostgreSQL placeholder engine for %s "
                "(connections will retry on first request)",
                host,
            )
            return _create_pg_engine(primary_url)

        logger.warning(
            "PostgreSQL unavailable (%s), falling back to SQLite",
            last_error,
        )

    # SQLite fallback (dev only — production uses placeholder above)
    fallback_url = settings.database_url_fallback or "sqlite:///./arena.db"
    engine = create_engine(
        fallback_url,
        connect_args={"check_same_thread": False} if "sqlite" in fallback_url else {},
    )
    logger.info(f"Using SQLite fallback: {fallback_url}")
    return engine


def get_engine() -> Engine:
    """Get the application engine, building it if necessary."""
    global _engine
    if _engine is None:
        _engine = _build_engine()
    return _engine


def dispose_engine() -> None:
    """Drop all pooled connections so the next checkout opens fresh sockets.

    Call after SSL EOF / unexpected close errors so the pool does not keep
    handing out broken connections.
    """
    global _engine
    eng = _engine
    if eng is None:
        return
    try:
        eng.dispose()
        logger.info("Disposed PostgreSQL connection pool (will reconnect on next use)")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Engine dispose failed: %s", exc)


def is_db_connectivity_error(exc: BaseException) -> bool:
    """True when ``exc`` indicates the DB is unreachable / connection died."""
    if isinstance(exc, (OperationalError, InterfaceError)):
        return True
    if isinstance(exc, DBAPIError) and getattr(exc, "connection_invalidated", False):
        return True
    # Some drivers wrap the real failure one level down
    orig = getattr(exc, "orig", None)
    if orig is not None and orig is not exc:
        return is_db_connectivity_error(orig)
    return _is_retryable_connect_error(exc)


# Build at import time for backwards compatibility with
# migrate_and_start.py and alembic/env.py
engine = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency — yields a DB session and closes it after the request.

    On a connectivity failure during the request, dispose the pool so the
    next request opens a fresh TLS session instead of reusing a dead socket.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as exc:
        if is_db_connectivity_error(exc):
            try:
                db.rollback()
            except Exception:
                pass
            dispose_engine()
        raise
    finally:
        try:
            db.close()
        except Exception:
            pass


def init_db() -> None:
    """Create all tables. Called on app startup."""
    from arena import db_models  # noqa: F401 — registers models with Base

    try:
        Base.metadata.create_all(bind=get_engine())
    except Exception as e:
        logger.warning(
            "init_db: could not create tables (%s). "
            "DB-dependent endpoints will return 503.",
            e,
        )
