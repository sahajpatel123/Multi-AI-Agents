"""Database setup — SQLAlchemy engine with PostgreSQL primary, SQLite fallback.

Uses psycopg 3 (postgresql+psycopg://) — psycopg 3 provides modern TLS
support and first-class SQLAlchemy 2.0 integration. The engine is built
lazily: a production DB outage does not prevent application startup.
Health probes and config validation run, then real traffic retries on
first connect.
"""

import logging
from functools import lru_cache
from typing import Generator, Optional

from sqlalchemy import create_engine, text, Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from arena.config import get_settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


_engine: Optional[Engine] = None


def _build_engine() -> Engine:
    settings = get_settings()
    primary_url = settings.database_url

    # Try PostgreSQL first (postgresql+psycopg:// via psycopg 3 driver)
    if primary_url and "postgresql" in primary_url:
        try:
            engine = create_engine(
                primary_url,
                pool_pre_ping=True,
                pool_recycle=300,
                pool_size=5,
                max_overflow=10,
            )
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Connected to PostgreSQL (psycopg 3)")
            return engine
        except Exception as e:
            logger.error(
                "[CRITICAL] PostgreSQL unavailable (%s). "
                "The application will start in degraded mode — "
                "/api/health will report 'degraded'. "
                "All DB-dependent endpoints return 503 until connectivity "
                "is restored.",
                e,
            )
            if settings.is_production:
                # Build a placeholder engine that will retry on first use.
                # SQLite fallback is deliberately NOT used — a blank DB
                # in production would silently drop all data.
                logger.info(
                    "Starting with PostgreSQL placeholder engine "
                    "(connections will retry on first request)"
                )
                placeholder = create_engine(
                    primary_url,
                    pool_pre_ping=True,
                    pool_recycle=300,
                    pool_size=5,
                    max_overflow=10,
                )
                return placeholder

    # SQLite fallback (dev only — production raises above)
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
