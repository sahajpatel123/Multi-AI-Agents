"""Startup purge of expired revoked_tokens.

The DB-backed blacklist (iter-12) needs a way to drop expired rows that
no one is going to present again — otherwise the table grows unbounded.
Lazy cleanup at lookup time covers tokens whose hash gets re-presented,
but never-re-presented tokens are dead without a periodic sweep.

We invoke create_app() in tests against SQLite — if the startup purge
is wired correctly, any revoked_tokens row whose expires_at is in the
past must be gone by the time the app is ready to serve requests.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.fixture
def isolated_db_with_revoked(isolated_db):
    """Provide an isolated DB AND a pre-populated revoked_tokens row whose
    expires_at is already in the past. The row was already committed
    before create_app() runs, so the startup purge is the *only* thing
    that can remove it.
    """
    from arena.db_models import RevokedToken

    SessionLocal = isolated_db
    s = SessionLocal()
    try:
        # Long-dead row: yesterday's expiry. Should be purged at startup.
        s.add(RevokedToken(
            token_hash="x" * 64,
            expires_at=_utcnow_naive() - timedelta(days=1),
            reason="test-seed",
        ))
        # Far-future row: should NOT be purged — token still actionable.
        s.add(RevokedToken(
            token_hash="y" * 64,
            expires_at=_utcnow_naive() + timedelta(days=7),
            reason="test-seed-future",
        ))
        s.commit()
    finally:
        s.close()

    yield SessionLocal

    # Cleanup after the test for hygiene.
    s = SessionLocal()
    try:
        s.query(RevokedToken).delete()
        s.commit()
    finally:
        s.close()


class TestStartupPurge:
    def test_purge_expired_drops_dead_rows_on_startup(
        self, isolated_db, monkeypatch
    ):
        # Seed BEFORE create_app() runs so the seeded rows are visible
        # at the moment the startup purge executes.
        from arena.db_models import RevokedToken
        SessionLocal = isolated_db
        s = SessionLocal()
        try:
            s.add(RevokedToken(
                token_hash="x" * 64,
                expires_at=_utcnow_naive() - timedelta(days=1),
                reason="test-seed-dead",
            ))
            s.add(RevokedToken(
                token_hash="y" * 64,
                expires_at=_utcnow_naive() + timedelta(days=7),
                reason="test-seed-live",
            ))
            s.commit()
        finally:
            s.close()

        # Build the app — startup purge runs here against our seeded DB.
        # Same env-validation bypass the conftest uses.
        from arena.config import Settings as _Settings
        monkeypatch.setattr(_Settings, "validate_secrets", lambda self: None)
        monkeypatch.setattr(_Settings, "validate_api_keys", lambda self: None)
        from main import create_app
        create_app()

        # Read what's left.
        s = SessionLocal()
        try:
            surviving = {
                row[0]
                for row in s.query(RevokedToken.token_hash)
                .filter(RevokedToken.token_hash.in_(["x" * 64, "y" * 64]))
                .all()
            }
        finally:
            s.close()

        assert "x" * 64 not in surviving, (
            "purge_expired must remove revoked_tokens whose expires_at "
            "is in the past during create_app()."
        )
        assert "y" * 64 in surviving, (
            "purge_expired must NOT remove rows whose expires_at is "
            "still in the future."
        )

    def test_purge_helper_returns_row_count(self, isolated_db):
        from arena.core.token_blacklist import (
            add, is_blacklisted, purge_expired,
        )
        from arena.db_models import RevokedToken

        SessionLocal = isolated_db
        s = SessionLocal()
        try:
            # Add a row that's already past exp.
            s.add(RevokedToken(
                token_hash="a" * 64,
                expires_at=_utcnow_naive() - timedelta(days=1),
            ))
            # Add a row still valid.
            add("deadbeef-purge-test", _utcnow_naive() + timedelta(days=2), s)
            s.commit()

            n = purge_expired(s)
            assert n >= 1, "purge_expired must report at least one row removed"

            # Stale row is gone.
            assert is_blacklisted("a-padding-not-real", s) is False
            # Live row still flags as blacklisted.
            assert is_blacklisted("deadbeef-purge-test", s) is True
        finally:
            s.close()
