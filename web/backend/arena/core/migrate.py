from sqlalchemy import text

from arena.database import engine


def run_safe_migrations():
    """
    Runs ADD COLUMN IF NOT EXISTS for every known column
    that may be missing from production. Safe to run on
    every startup — IF NOT EXISTS means it does nothing
    if the column already exists.
    """
    migrations = [
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

    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                print(f"Migration warning (non-fatal): {e}")
                conn.rollback()

    print("Safe migrations complete.")
