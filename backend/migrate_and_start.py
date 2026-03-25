import os
import sys


def main():
    sys.stdout.flush()
    print("==> Running safe migrations...", flush=True)

    try:
        from sqlalchemy import text

        from arena.database import engine

        migrations = [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
            "expertise_level VARCHAR DEFAULT 'curious'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
            "expertise_domain VARCHAR DEFAULT ''",
        ]

        with engine.connect() as conn:
            for sql in migrations:
                try:
                    conn.execute(text(sql))
                    conn.commit()
                    print(f"==> OK: {sql[:60]}...", flush=True)
                except Exception as e:
                    print(f"==> Warning: {e}", flush=True)
                    try:
                        conn.rollback()
                    except Exception:
                        pass

        print("==> Safe migrations complete.", flush=True)

    except Exception as e:
        print(f"==> Migration error (non-fatal): {e}", flush=True)
        print("==> Continuing startup...", flush=True)

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
