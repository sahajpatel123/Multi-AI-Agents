"""Database setup — SQLAlchemy engine with PostgreSQL primary, SQLite fallback.

Uses psycopg 3 (postgresql+psycopg://) — psycopg 3 provides modern TLS
support and first-class SQLAlchemy 2.0 integration. The engine is built
lazily: a production DB outage does not prevent application startup.
Health probes and config validation run, then real traffic retries on
first connect.
"""

import logging
import time
from typing import Generator, Optional
from urllib.parse import urlparse

from sqlalchemy import create_engine, text, Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from arena.config import get_settings

logger = logging.getLogger(__name__)


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


def _create_pg_engine(url: str) -> Engine:
    # pool_pre_ping: drop dead connections before checkout (SSL EOF / idle kills).
    # pool_recycle: recycle before common managed-PG idle timeouts.
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=5,
        max_overflow=10,
        pool_timeout=30,
    )


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
            "is restored.",
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


# Build at import time for backwards compatibility with
# migrate_and_start.py and alembic/env.py
engine = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Called on app startup."""
    from arena import db_models  # noqa: F401 — registers models with Base

    try:
        Base.metadata.create_all(bind=get_engine())
    except Exception as e:
        logger.warning("init_db: could not create tables (%s). "
                        "DB-dependent endpoints will return 503.", e)
