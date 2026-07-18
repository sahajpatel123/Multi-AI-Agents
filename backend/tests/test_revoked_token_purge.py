"""Tests for the persistent revoked-token purge helper."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

from datetime import datetime, timedelta, timezone

import pytest

from arena.core.token_blacklist import purge_expired
from arena.db_models import RevokedToken


def _seed(db, *, token_hash: str, expires_at: datetime) -> RevokedToken:
    row = RevokedToken(
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(row)
    db.flush()
    return row


def test_purge_removes_only_expired_rows(db_session):
    now = utcnow_naive()
    _seed(db_session, token_hash="hash-old-1", expires_at=now - timedelta(hours=2))
    _seed(db_session, token_hash="hash-old-2", expires_at=now - timedelta(minutes=1))
    _seed(db_session, token_hash="hash-live", expires_at=now + timedelta(hours=1))
    db_session.commit()

    deleted = purge_expired(db_session)
    assert deleted == 2

    survivors = db_session.query(RevokedToken).all()
    assert len(survivors) == 1
    assert survivors[0].token_hash == "hash-live"


def test_purge_is_a_noop_when_nothing_expired(db_session):
    now = utcnow_naive()
    _seed(db_session, token_hash="hash-fresh", expires_at=now + timedelta(hours=2))
    db_session.commit()

    deleted = purge_expired(db_session)
    assert deleted == 0
    assert db_session.query(RevokedToken).count() == 1


def test_purge_only_runs_until_batch_limit(db_session):
    """The helper caps work at batch_limit so a runaway-size table
    doesn't lock for minutes on a single call."""
    now = utcnow_naive()
    for i in range(5):
        _seed(db_session, token_hash=f"hash-old-{i}", expires_at=now - timedelta(hours=1))
    db_session.commit()

    deleted = purge_expired(db_session, batch_limit=3)
    assert deleted == 3
    assert db_session.query(RevokedToken).count() == 2


def test_purge_global_scope(db_session):
    """The blacklist is global (no user_id column) — purge sweeps
    all rows regardless of which user they came from."""
    now = utcnow_naive()
    for i in range(3):
        _seed(db_session, token_hash=f"hash-{i}", expires_at=now - timedelta(hours=1))
    db_session.commit()

    deleted = purge_expired(db_session)
    assert deleted == 3
    assert db_session.query(RevokedToken).count() == 0


def test_purge_boundary_at_exactly_now(db_session):
    """expires_at <= now is treated as expired; a token expiring at this
    exact instant doesn't get a free reprieve."""
    now = utcnow_naive()
    _seed(db_session, token_hash="hash-boundary", expires_at=now)
    db_session.commit()

    deleted = purge_expired(db_session)
    assert deleted == 1
    assert db_session.query(RevokedToken).count() == 0
