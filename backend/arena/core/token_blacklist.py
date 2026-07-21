"""Persistent JWT blacklist backed by Postgres.

Stores the SHA-256 hash of the raw token (NEVER the token itself) plus
the JWT's `exp` claim. A lookup also drops expired rows it touches, so
the working set stays bounded without needing a separate cleanup cron.

Replaces a previous per-process in-memory set; see the security-governance
memory for the original fix and iter-11 for the bypass that prompted
this rewrite. The DB-backed version is what makes the logout contract
hold across:
  - multi-worker Render deployments (each uvicorn worker has its own
    process memory)
  - process restarts / deploys (the in-memory set was wiped on every
    bounce, granting logged-out tokens a fresh window of validity)

All callers now pass an explicit `db: Session` so the same row is read
and written by any worker. The legacy `add(token)` / `is_blacklisted(token)`
singleton-with-no-args API is gone — the dependency injection forces every
call site to be deliberate about which session the lookup runs against.
"""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

import hashlib
import logging
import threading
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from arena.db_models import RevokedToken

logger = logging.getLogger(__name__)


# Interval at which the periodic background sweeper wakes up. One hour
# is short enough that the table doesn't grow large between deploys,
# long enough that the per-worker DB load is negligible.
_DEFAULT_PURGE_INTERVAL_SECONDS = 3600

# Background-sweep handle + guard so create_app() can be called more
# than once (e.g. in pytest) without spawning parallel sweepers.
_periodic_thread: Optional[threading.Thread] = None
_periodic_stop: Optional[threading.Event] = None
_periodic_lock = threading.Lock()


def _purge_loop(stop_event: threading.Event, interval_seconds: int) -> None:
    """Daemon thread body: sleep `interval_seconds` between sweeps, exit
    cleanly when stop_event is set. Best-effort — DB errors are logged
    and the next tick still runs.
    """
    while not stop_event.is_set():
        # Sleep in small slices so a stop signal at app shutdown is honored
        # within a second or two instead of having to wait the full interval.
        if stop_event.wait(timeout=interval_seconds):
            return  # stop requested during sleep
        try:
            # Lazy import — avoid pulling SQLAlchemy / SessionLocal at module
            # import time, which would break any script that just wants the
            # hashing helpers.
            from arena.database import SessionLocal
            s = SessionLocal()
            try:
                n = purge_expired(s)
                if n:
                    logger.info(
                        "Periodic revoked_tokens purge cleared %s row(s)",
                        n,
                    )
                from arena.core.webhook_idempotency import purge_expired_webhook_events

                wn = purge_expired_webhook_events(s)
                if wn:
                    logger.info(
                        "Periodic processed_webhook_events purge cleared %s row(s)",
                        wn,
                    )
            finally:
                s.close()
        except Exception as _exc:  # pragma: no cover - hard to trigger
            logger.warning(
                "Periodic revoked_tokens purge failed: %s", _exc,
            )


def start_periodic_purge(interval_seconds: int = _DEFAULT_PURGE_INTERVAL_SECONDS) -> bool:
    """Start the background sweeper if it isn't already running.

    Idempotent: calling this more than once is a no-op. Returns True
    if a new thread was spawned this call, False if one was already
    alive (or the interval was non-positive, in which case the function
    does nothing).

    The thread is a daemon so it dies with the process — no shutdown
    ceremony needed on Render restarts.
    """
    if interval_seconds <= 0:
        return False
    global _periodic_thread, _periodic_stop
    with _periodic_lock:
        if _periodic_thread is not None and _periodic_thread.is_alive():
            return False
        stop = threading.Event()
        t = threading.Thread(
            target=_purge_loop,
            args=(stop, interval_seconds),
            name="revoked_tokens-purge",
            daemon=True,
        )
        t.start()
        _periodic_thread = t
        _periodic_stop = stop
        logger.info(
            "Started periodic revoked_tokens purge (every %s seconds)", interval_seconds,
        )
        return True


def stop_periodic_purge(timeout_seconds: float = 2.0) -> bool:
    """Signal the background sweeper to stop and wait briefly for it
    to exit. Returns True if the thread was running and stopped, False
    otherwise. Useful in tests; production relies on process exit + daemon.
    """
    global _periodic_thread, _periodic_stop
    with _periodic_lock:
        thread = _periodic_thread
        stop = _periodic_stop
        _periodic_thread = None
        _periodic_stop = None
    if thread is None or stop is None:
        return False
    stop.set()
    thread.join(timeout=timeout_seconds)
    return not thread.is_alive()


def _hash_token(token: str) -> str:
    """Return the SHA-256 hex digest of `token`.

    Storing only the hash means a stolen DB row is not itself a JWT that
    can be replayed against /api/auth/me. The hash is 64 hex chars so the
    column is `String(64)` and the index is fixed-width.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()




def add(token: str, expires_at: datetime, db: Session, reason: Optional[str] = None) -> None:
    """Persist the revocation of `token`.

    `expires_at` should be the JWT's `exp` claim — the row's TTL in the DB
    — so expired rows naturally fall out of any bounded scan.

    Idempotent: re-revoking the same token is a no-op (we look up by
    the unique `token_hash` first). Empty / non-string tokens are ignored
    so callers cannot poison the table with a hash of ``""``.
    """
    if not token or not isinstance(token, str) or not token.strip():
        return
    h = _hash_token(token.strip())
    existing = db.query(RevokedToken).filter(RevokedToken.token_hash == h).first()
    if existing:
        # If the existing row is already expired, refresh its expiry
        # so it doesn't get dropped before the lookup hits it. Belt and
        # braces for callers that revoke at the same instant the JWT
        # crosses exp.
        if existing.expires_at < expires_at:
            existing.expires_at = expires_at
            db.commit()
        return
    try:
        db.add(RevokedToken(token_hash=h, expires_at=expires_at, reason=reason))
        db.commit()
    except IntegrityError:
        db.rollback()
        logger.debug(
            "concurrent blacklist insert detected for token %s...; rolled back",
            h[:16],
        )


def is_blacklisted(token: str, db: Session) -> bool:
    """Return True iff `token` was previously revoked AND its JWT is not
    past its `exp`. Expired rows seen during the lookup are cleaned up.

    Lazy cleanup keeps the table bounded in case no separate purge job
    ever runs. The cost is one extra DELETE in the cold-path lookup
    — fine for an auth path that runs a handful of times per request.
    """
    if not token or not isinstance(token, str) or not token.strip():
        return False
    h = _hash_token(token.strip())
    now = utcnow_naive()
    row = (
        db.query(RevokedToken)
        .filter(RevokedToken.token_hash == h, RevokedToken.expires_at > now)
        .first()
    )
    if row is not None:
        return True
    # Lazy cleanup: any matching hash with expires_at <= now is dead
    # and should not influence future auth, regardless of whether the
    # token is presented. Idempotent on repeat hits.
    dead = (
        db.query(RevokedToken)
        .filter(RevokedToken.token_hash == h, RevokedToken.expires_at <= now)
        .all()
    )
    if dead:
        for r in dead:
            db.delete(r)
        db.commit()
    return False


def purge_expired(db: Session, batch_limit: int = 1000) -> int:
    """Best-effort bulk cleanup. Returns the rows deleted.

    Safe to call from a cron / scheduled task; uses an arbitrary LIMIT
    so a runaway-size table doesn't lock for minutes.
    """
    now = utcnow_naive()
    rows = (
        db.query(RevokedToken)
        .filter(RevokedToken.expires_at <= now)
        .limit(batch_limit)
        .all()
    )
    n = len(rows)
    for r in rows:
        db.delete(r)
    if n:
        db.commit()
    return n


# ── Compatibility shim ─────────────────────────────────────────────
# Pre-iter-12 callers (and any third-party script) `from arena.core.token_blacklist
# import token_blacklist` and call `token_blacklist.is_blacklisted(token, db)`
# / `token_blacklist.add(token, expires_at, db)`. Keep a thin singleton
# that delegates so the import surface stays stable. New callers should
# use the module-level `add` / `is_blacklisted` directly.
class _PersistentBlacklistSingleton:
    def add(self, token: str, expires_at: datetime, db: Session, reason: Optional[str] = None) -> None:
        add(token, expires_at=expires_at, db=db, reason=reason)

    def is_blacklisted(self, token: str, db: Session) -> bool:
        return is_blacklisted(token, db)

    def purge_expired(self, db: Session, batch_limit: int = 1000) -> int:
        return purge_expired(db, batch_limit=batch_limit)

    # Test-only no-op retained for the autouse reset fixture in
    # tests/test_auth_blacklist_bypass.py. The actual reset wipes the
    # revoked_tokens table directly via SQLAlchemy now; this attribute
    # stays so legacy `token_blacklist.clear()` calls don't AttributeError.
    def clear(self) -> None:  # pragma: no cover - deprecated, kept for compat
        return None


token_blacklist = _PersistentBlacklistSingleton()
