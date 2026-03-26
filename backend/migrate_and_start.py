# MIGRATION RULE — READ BEFORE EDITING db_models.py
#
# Every time you add a Column to ANY model in
# db_models.py, you MUST also add a corresponding
# ALTER TABLE ... ADD COLUMN IF NOT EXISTS entry
# to the migrations list in this file.
#
# Failure to do this = 500 errors on every endpoint
# that queries that table in production.
#
# ADD COLUMN IF NOT EXISTS is safe to run multiple
# times — it does nothing if the column exists.

import os
import sys


def main():
    print("==> Running safe migrations...", flush=True)

    try:
        from arena.database import engine
        from sqlalchemy import text

        migrations = [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
            "name VARCHAR DEFAULT ''",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
            "expertise_level VARCHAR DEFAULT 'curious'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
            "expertise_domain VARCHAR DEFAULT ''",
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS "
            "title VARCHAR",
        ]

        with engine.connect() as conn:
            for sql in migrations:
                try:
                    conn.execute(text(sql))
                    conn.commit()
                    print(f"==> Migrated: {sql[50:90]}", flush=True)
                except Exception as e:
                    print(f"==> Warning: {e}", flush=True)
                    try:
                        conn.rollback()
                    except Exception:
                        pass

        print("==> All migrations complete.", flush=True)

    except Exception as e:
        print(f"==> Migration failed: {e}", flush=True)
        print("==> ABORTING — DB not ready.", flush=True)
        sys.exit(1)

    print("==> Starting server...", flush=True)
    sys.stdout.flush()

    port = os.environ.get("PORT", "10000")
    os.execvp("uvicorn", [
        "uvicorn",
        "main:app",
        "--host",
        "0.0.0.0",
        "--port",
        port,
    ])


if __name__ == "__main__":
    main()
