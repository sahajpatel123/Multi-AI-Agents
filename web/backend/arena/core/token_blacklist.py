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

import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from arena.db_models import RevokedToken

logger = logging.getLogger(__name__)


def _hash_token(token: str) -> str:
    """Return the SHA-256 hex digest of `token`.

    Storing only the hash means a stolen DB row is not itself a JWT that
    can be replayed against /api/auth/me. The hash is 64 hex chars so the
    column is `String(64)` and the index is fixed-width.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _utcnow_naive() -> datetime:
    # The codebase stores naive UTC datetimes everywhere (Base._now);
    # match that convention here so inequality comparisons stay correct.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def add(token: str, expires_at: datetime, db: Session, reason: Optional[str] = None) -> None:
    """Persist the revocation of `token`.

    `expires_at` should be the JWT's `exp` claim — the row's TTL in the DB
    — so expired rows naturally fall out of any bounded scan.

    Idempotent: re-revoking the same token is a no-op (we look up by
    the unique `token_hash` first).
    """
    h = _hash_token(token)
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
    db.add(RevokedToken(token_hash=h, expires_at=expires_at, reason=reason))
    db.commit()


def is_blacklisted(token: str, db: Session) -> bool:
    """Return True iff `token` was previously revoked AND its JWT is not
    past its `exp`. Expired rows seen during the lookup are cleaned up.

    Lazy cleanup keeps the table bounded in case no separate purge job
    ever runs. The cost is one extra DELETE in the cold-path lookup
    — fine for an auth path that runs a handful of times per request.
    """
    h = _hash_token(token)
    now = _utcnow_naive()
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
    now = _utcnow_naive()
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
