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
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS "
            "insight_report JSONB",
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS "
            "contradictions JSONB",
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS "
            "intelligence_score JSONB",
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS "
            "is_live BOOLEAN DEFAULT FALSE",
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS "
            "live_last_checked TIMESTAMP",
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS "
            "live_next_check TIMESTAMP",
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS "
            "live_updates JSONB",
        ]
        sqlite_json_fallback = [
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS insight_report TEXT",
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS contradictions TEXT",
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS intelligence_score TEXT",
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT 0",
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS live_last_checked TEXT",
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS live_next_check TEXT",
            "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS live_updates TEXT",
        ]

        pg_confidence_table = """
            CREATE TABLE IF NOT EXISTS confidence_ratings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                task_id VARCHAR(64) NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
                user_rating INTEGER NOT NULL,
                system_score INTEGER NOT NULL,
                delta INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                CONSTRAINT uq_confidence_rating_user_task UNIQUE (user_id, task_id)
            )
        """
        sqlite_confidence_table = """
            CREATE TABLE IF NOT EXISTS confidence_ratings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                task_id VARCHAR(64) NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
                user_rating INTEGER NOT NULL,
                system_score INTEGER NOT NULL,
                delta INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (user_id, task_id)
            )
        """

        with engine.connect() as conn:
            dialect = conn.engine.dialect.name
            to_run = list(migrations)
            if dialect == "sqlite":
                to_run = [m for m in migrations if "JSONB" not in m] + sqlite_json_fallback

            for sql in to_run:
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

            ct_sql = sqlite_confidence_table if dialect == "sqlite" else pg_confidence_table
            try:
                conn.execute(text(ct_sql))
                conn.commit()
                print("==> Migrated: confidence_ratings table", flush=True)
            except Exception as e:
                print(f"==> Warning (confidence_ratings): {e}", flush=True)
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
