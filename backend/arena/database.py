"""Database setup — SQLAlchemy engine with PostgreSQL primary, SQLite fallback.

Uses psycopg 3 (postgresql+psycopg://) for production — psycopg 2 binary
distributions ship an outdated OpenSSL that cannot complete a TLS handshake
with Render's managed PostgreSQL. psycopg 3 bundles a modern OpenSSL and
reads sslmode directly from the connection URL.
"""

import logging
import time
from functools import lru_cache
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from arena.config import get_settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


def _build_engine():
    settings = get_settings()
    primary_url = settings.database_url

    # Try PostgreSQL first (postgresql+psycopg:// via psycopg 3 driver)
    if primary_url and "postgresql" in primary_url:
        max_attempts = 6 if settings.is_production else 1
        for attempt in range(1, max_attempts + 1):
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
                if settings.is_production and attempt < max_attempts:
                    wait = min(2 ** attempt, 30)
                    logger.warning(
                        "PostgreSQL connection attempt %d/%d failed (%s). "
                        "Retrying in %ds...",
                        attempt, max_attempts, e, wait,
                    )
                    time.sleep(wait)
                    continue
                if settings.is_production:
                    logger.error(
                        "[CRITICAL] PostgreSQL unavailable in production (%s) — "
                        "refusing to start with SQLite fallback. "
                        "Set DATABASE_URL to a reachable Postgres instance.",
                        e,
                    )
                    raise RuntimeError(
                        f"PostgreSQL unavailable in production: {e}. "
                        "SQLite fallback is disabled when ENVIRONMENT=production."
                    ) from e
                logger.warning(f"PostgreSQL unavailable ({e}), falling back to SQLite")

    # SQLite fallback (dev only — production raises above)
    fallback_url = settings.database_url_fallback or "sqlite:///./arena.db"
    engine = create_engine(
        fallback_url,
        connect_args={"check_same_thread": False} if "sqlite" in fallback_url else {},
    )
    logger.info(f"Using SQLite fallback: {fallback_url}")
    return engine


engine = _build_engine()
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
    Base.metadata.create_all(bind=engine)
