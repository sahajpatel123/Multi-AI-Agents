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
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS consecutive_payments INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS loyalty_reward_active BOOLEAN DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS loyalty_free_months_remaining INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS loyalty_resume_at TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_addon_active BOOLEAN DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_addon_subscription_id VARCHAR(64)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_addon_cancelling BOOLEAN DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_subscription_id VARCHAR(64)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
            "name VARCHAR DEFAULT ''",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
            "expertise_level VARCHAR DEFAULT 'curious'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
            "expertise_domain VARCHAR DEFAULT ''",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_hash VARCHAR",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMP",
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

            try:
                conn.execute(
                    text(
                        "UPDATE users SET addon_subscription_id = agent_addon_subscription_id "
                        "WHERE (addon_subscription_id IS NULL OR addon_subscription_id = '') "
                        "AND agent_addon_subscription_id IS NOT NULL "
                        "AND agent_addon_subscription_id != ''"
                    )
                )
                conn.commit()
                print("==> Migrated: addon_subscription_id backfill from agent_addon_subscription_id", flush=True)
            except Exception as e:
                print(f"==> Warning (addon_subscription_id backfill): {e}", flush=True)
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

            pg_answer_feedback = """
                CREATE TABLE IF NOT EXISTS answer_feedback (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    task_id VARCHAR(64) NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
                    verdict VARCHAR NOT NULL,
                    note TEXT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT uq_answer_feedback_user_task UNIQUE (user_id, task_id)
                )
            """
            sqlite_answer_feedback = """
                CREATE TABLE IF NOT EXISTS answer_feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    task_id VARCHAR(64) NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
                    verdict VARCHAR NOT NULL,
                    note TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (user_id, task_id)
                )
            """
            af_sql = sqlite_answer_feedback if dialect == "sqlite" else pg_answer_feedback
            try:
                conn.execute(text(af_sql))
                conn.commit()
                print("==> Migrated: answer_feedback table", flush=True)
            except Exception as e:
                print(f"==> Warning (answer_feedback): {e}", flush=True)
                try:
                    conn.rollback()
                except Exception:
                    pass

            pg_orch = """
                CREATE TABLE IF NOT EXISTS orchestrations (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    task_ids JSONB NOT NULL,
                    synthesis TEXT,
                    synthesis_bullets JSONB,
                    conflicts JSONB,
                    status VARCHAR DEFAULT 'running',
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """
            sqlite_orch = """
                CREATE TABLE IF NOT EXISTS orchestrations (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    task_ids TEXT NOT NULL DEFAULT '[]',
                    synthesis TEXT,
                    synthesis_bullets TEXT,
                    conflicts TEXT,
                    status VARCHAR DEFAULT 'running',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """
            orch_sql = sqlite_orch if dialect == "sqlite" else pg_orch
            try:
                conn.execute(text(orch_sql))
                conn.commit()
                print("==> Migrated: orchestrations table", flush=True)
            except Exception as e:
                print(f"==> Warning (orchestrations): {e}", flush=True)
                try:
                    conn.rollback()
                except Exception:
                    pass

            orch_alter = (
                "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS orchestration_id VARCHAR(36)"
            )
            try:
                conn.execute(text(orch_alter))
                conn.commit()
                print("==> Migrated: agent_tasks.orchestration_id", flush=True)
            except Exception as e:
                print(f"==> Warning (agent_tasks.orchestration_id): {e}", flush=True)
                try:
                    conn.rollback()
                except Exception:
                    pass

            pg_watchlist = """
                CREATE TABLE IF NOT EXISTS watchlist_items (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    question TEXT NOT NULL,
                    interval_hours INTEGER NOT NULL,
                    expertise_level VARCHAR DEFAULT 'curious',
                    expertise_domain VARCHAR DEFAULT '',
                    last_run_at TIMESTAMP,
                    next_run_at TIMESTAMP NOT NULL,
                    latest_task_id VARCHAR,
                    run_count INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """
            sqlite_watchlist = """
                CREATE TABLE IF NOT EXISTS watchlist_items (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    question TEXT NOT NULL,
                    interval_hours INTEGER NOT NULL,
                    expertise_level VARCHAR DEFAULT 'curious',
                    expertise_domain VARCHAR DEFAULT '',
                    last_run_at TEXT,
                    next_run_at TEXT NOT NULL,
                    latest_task_id VARCHAR,
                    run_count INTEGER DEFAULT 0,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """
            wl_sql = sqlite_watchlist if dialect == "sqlite" else pg_watchlist
            try:
                conn.execute(text(wl_sql))
                conn.commit()
                print("==> Migrated: watchlist_items table", flush=True)
            except Exception as e:
                print(f"==> Warning (watchlist_items): {e}", flush=True)
                try:
                    conn.rollback()
                except Exception:
                    pass

            wl_alter = "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS watchlist_item_id VARCHAR(36)"
            try:
                conn.execute(text(wl_alter))
                conn.commit()
                print("==> Migrated: agent_tasks.watchlist_item_id", flush=True)
            except Exception as e:
                print(f"==> Warning (agent_tasks.watchlist_item_id): {e}", flush=True)
                try:
                    conn.rollback()
                except Exception:
                    pass

            pg_rooms = """
                CREATE TABLE IF NOT EXISTS rooms (
                    id VARCHAR(36) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    slug VARCHAR(128) UNIQUE NOT NULL,
                    creator_id INTEGER NOT NULL REFERENCES users(id),
                    synthesis JSONB,
                    synthesis_updated_at TIMESTAMP,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """
            sqlite_rooms = """
                CREATE TABLE IF NOT EXISTS rooms (
                    id VARCHAR(36) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    slug VARCHAR(128) UNIQUE NOT NULL,
                    creator_id INTEGER NOT NULL REFERENCES users(id),
                    synthesis TEXT,
                    synthesis_updated_at TIMESTAMP,
                    is_active INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """
            pg_rm = """
                CREATE TABLE IF NOT EXISTS room_members (
                    id SERIAL PRIMARY KEY,
                    room_id VARCHAR(36) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    joined_at TIMESTAMP DEFAULT NOW(),
                    last_seen_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT uq_room_member_room_user UNIQUE (room_id, user_id)
                )
            """
            sqlite_rm = """
                CREATE TABLE IF NOT EXISTS room_members (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    room_id VARCHAR(36) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (room_id, user_id)
                )
            """
            pg_rt = """
                CREATE TABLE IF NOT EXISTS room_tasks (
                    id SERIAL PRIMARY KEY,
                    room_id VARCHAR(36) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                    task_id VARCHAR(64) NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    added_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT uq_room_task_room_task UNIQUE (room_id, task_id)
                )
            """
            sqlite_rt = """
                CREATE TABLE IF NOT EXISTS room_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    room_id VARCHAR(36) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                    task_id VARCHAR(64) NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (room_id, task_id)
                )
            """
            try:
                conn.execute(text(sqlite_rooms if dialect == "sqlite" else pg_rooms))
                conn.commit()
                print("==> Migrated: rooms table", flush=True)
            except Exception as e:
                print(f"==> Warning (rooms): {e}", flush=True)
                try:
                    conn.rollback()
                except Exception:
                    pass
            try:
                conn.execute(text(sqlite_rm if dialect == "sqlite" else pg_rm))
                conn.commit()
                print("==> Migrated: room_members table", flush=True)
            except Exception as e:
                print(f"==> Warning (room_members): {e}", flush=True)
                try:
                    conn.rollback()
                except Exception:
                    pass
            try:
                conn.execute(text(sqlite_rt if dialect == "sqlite" else pg_rt))
                conn.commit()
                print("==> Migrated: room_tasks table", flush=True)
            except Exception as e:
                print(f"==> Warning (room_tasks): {e}", flush=True)
                try:
                    conn.rollback()
                except Exception:
                    pass

            pg_mcp = """
                CREATE TABLE IF NOT EXISTS mcp_integrations (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    service VARCHAR NOT NULL,
                    display_name VARCHAR NOT NULL,
                    access_token TEXT NOT NULL,
                    refresh_token TEXT,
                    token_expires_at TIMESTAMP,
                    is_active BOOLEAN DEFAULT TRUE,
                    connected_at TIMESTAMP DEFAULT NOW(),
                    metadata JSONB,
                    CONSTRAINT uq_mcp_user_service UNIQUE (user_id, service)
                )
            """
            sqlite_mcp = """
                CREATE TABLE IF NOT EXISTS mcp_integrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    service VARCHAR NOT NULL,
                    display_name VARCHAR NOT NULL,
                    access_token TEXT NOT NULL,
                    refresh_token TEXT,
                    token_expires_at TIMESTAMP,
                    is_active INTEGER DEFAULT 1,
                    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    metadata TEXT,
                    UNIQUE (user_id, service)
                )
            """
            try:
                conn.execute(text(sqlite_mcp if dialect == "sqlite" else pg_mcp))
                conn.commit()
                print("==> Migrated: mcp_integrations table", flush=True)
            except Exception as e:
                print(f"==> Warning (mcp_integrations): {e}", flush=True)
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
