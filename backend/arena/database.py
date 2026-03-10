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
            engine = create_engine(
                primary_url,
                pool_pre_ping=True,
                pool_size=5,
                max_overflow=10,
            )
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Connected to PostgreSQL")
            return engine
        except Exception as e:
            logger.warning(f"PostgreSQL unavailable ({e}), falling back to SQLite")

    # SQLite fallback
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
