"""Database setup — SQLAlchemy engine with PostgreSQL primary, SQLite fallback"""

import logging
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

    # Try PostgreSQL first
    if primary_url and "postgresql" in primary_url:
        try:
            connect_args = {}
            if "sslmode" not in primary_url.lower():
                connect_args["sslmode"] = "require"
            engine = create_engine(
                primary_url,
                connect_args=connect_args,
                pool_pre_ping=True,
                pool_size=5,
                max_overflow=10,
            )
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Connected to PostgreSQL")
            return engine
        except Exception as e:
            # SQLite fallback is unsafe in production — refuse to start.
            # Serving traffic against a freshly-empty SQLite would silently
            # drop every existing row, so production must fail closed.
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
