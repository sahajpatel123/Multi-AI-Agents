"""Run idempotent DB migrations + schema check, then exec uvicorn (same PID for Render)."""

import os
import sys


def verify_schema() -> None:
    from sqlalchemy import inspect

    from arena.database import engine

    insp = inspect(engine)
    if not insp.has_table("users"):
        print("FATAL: Missing table: users")
        sys.exit(1)
    columns = {c["name"] for c in insp.get_columns("users")}
    # DB column is password_hash (not hashed_password)
    required = (
        "id",
        "email",
        "password_hash",
        "expertise_level",
        "expertise_domain",
    )
    missing = [c for c in required if c not in columns]
    if missing:
        print(f"FATAL: Missing columns: {missing}")
        sys.exit(1)
    print("==> Schema check passed.")


def main() -> None:
    print("==> Running safe migrations...")
    from arena.core.migrate import run_safe_migrations

    run_safe_migrations()
    verify_schema()

    print("==> Starting server...")
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
