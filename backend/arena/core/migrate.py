import logging

from sqlalchemy import text

from arena.database import engine

logger = logging.getLogger(__name__)


# Module-level so the migrations list can be inspected by tests without
# calling run_safe_migrations() (which would touch the real engine).
migrations: list[str] = [
    """
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS expertise_level
        VARCHAR DEFAULT 'curious'
    """,
    """
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS expertise_domain
        VARCHAR DEFAULT ''
    """,
]


def run_safe_migrations():
    """
    Runs ADD COLUMN IF NOT EXISTS for every known column
    that may be missing from production. Safe to run on
    every startup — IF NOT EXISTS means it does nothing
    if the column already exists.
    """
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                logger.exception("safe_migration_failed", extra={"sql": sql.strip()})
                conn.rollback()

    logger.info("safe_migrations_complete", extra={"count": len(migrations)})
