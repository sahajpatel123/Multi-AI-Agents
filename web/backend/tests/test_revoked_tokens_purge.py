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


class TestPeriodicPurge:
    """Background sweeper: handle the steady-state case startup misses.

    Startup purge (TestStartupPurge above) sweeps once at boot. Between
    deploys, dead tokens still accumulate. The periodic sweeper thread
    re-runs purge_expired every interval_seconds. These tests pin the
    contract end-to-end with a tiny interval so the test completes fast.
    """

    def test_start_periodic_purge_runs_concurrently(self, isolated_db, monkeypatch):
        # Use a tiny interval so the sweeper fires within the test.
        from arena.core import token_blacklist as tbl

        # Make sure no prior thread is alive (test isolation).
        tbl.stop_periodic_purge(timeout_seconds=2.0)

        from datetime import timedelta

        from arena.db_models import RevokedToken

        SessionLocal = isolated_db
        s = SessionLocal()
        try:
            s.add(RevokedToken(
                token_hash="z" * 64,
                expires_at=_utcnow_naive() - timedelta(days=1),
                reason="test-periodic-seed",
            ))
            s.commit()
        finally:
            s.close()

        # Spawn the thread with a 0.5s interval — well under any test timeout.
        spawned = tbl.start_periodic_purge(interval_seconds=1)
        assert spawned is True
        try:
            # Give the sweeper 2 seconds to fire at least once.
            import time as _time
            deadline = _time.monotonic() + 2.0
            while _time.monotonic() < deadline:
                s = SessionLocal()
                try:
                    surviving = (
                        s.query(RevokedToken)
                        .filter(RevokedToken.token_hash == "z" * 64)
                        .first()
                    )
                finally:
                    s.close()
                if surviving is None:
                    break
                _time.sleep(0.05)
            assert surviving is None, (
                "periodic sweeper thread did not remove the stale row "
                "within 2 seconds of start"
            )
        finally:
            tbl.stop_periodic_purge(timeout_seconds=2.0)

    def test_start_periodic_purge_is_idempotent(self, isolated_db):
        from arena.core import token_blacklist as tbl

        tbl.stop_periodic_purge(timeout_seconds=2.0)
        try:
            a = tbl.start_periodic_purge(interval_seconds=3600)
            b = tbl.start_periodic_purge(interval_seconds=3600)
            c = tbl.start_periodic_purge(interval_seconds=3600)
            assert a is True, "first call must spawn"
            assert b is False and c is False, "subsequent calls must no-op"
        finally:
            tbl.stop_periodic_purge(timeout_seconds=2.0)
