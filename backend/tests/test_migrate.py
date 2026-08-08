"""Tests for the safe-migration runner.

migrate.run_safe_migrations is called at app startup and must be
idempotent + safe to run on every boot. We pin:

  - executes the documented migrations list (no more, no less)
  - calls conn.commit() after each successful migration
  - on failure, calls conn.rollback() and continues with the next
    migration (a single broken SQL must not abort the whole batch)
  - the SQL strings use ADD COLUMN IF NOT EXISTS so re-runs are no-ops
  - the function returns None on both success and partial failure
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Any
from unittest.mock import MagicMock

import pytest

from arena.core import migrate


class _FakeConn:
    """Records execute / commit / rollback calls for assertion."""

    def __init__(self) -> None:
        self.executes: list[str] = []
        self.commits: int = 0
        self.rollbacks: int = 0
        self._next_execute_raises: BaseException | None = None

    def execute(self, sql: Any) -> None:
        self.executes.append(str(sql))
        if self._next_execute_raises is not None:
            exc, self._next_execute_raises = self._next_execute_raises, None
            raise exc

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1


@contextmanager
def _patched_engine(conn: _FakeConn):
    """Replace arena.core.migrate.engine with a context-manager-yielded fake conn."""
    fake_engine = MagicMock()
    fake_engine.connect.return_value.__enter__.return_value = conn
    fake_engine.connect.return_value.__exit__.return_value = False
    # `with engine.connect() as conn` is the actual usage — patch the
    # `engine` symbol that migrate.py imports at module load.
    yield fake_engine


def test_runs_every_documented_migration(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = _FakeConn()
    monkeypatch.setattr(migrate, "engine", _patched_engine(conn).__enter__())
    migrate.run_safe_migrations()
    # Both ALTER TABLE statements from migrate.py must execute, in order.
    assert len(conn.executes) == 2
    assert "expertise_level" in conn.executes[0]
    assert "expertise_domain" in conn.executes[1]


def test_commits_after_every_successful_migration(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = _FakeConn()
    engine = _patched_engine(conn).__enter__()
    monkeypatch.setattr(migrate, "engine", engine)
    migrate.run_safe_migrations()
    # One commit per successful migration.
    assert conn.commits == len(conn.executes)
    assert conn.rollbacks == 0


def test_continues_after_a_failing_migration(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = _FakeConn()
    engine = _patched_engine(conn).__enter__()
    monkeypatch.setattr(migrate, "engine", engine)

    # Make the FIRST migration throw. The runner must roll back, then
    # continue with the second migration instead of aborting the batch.
    conn._next_execute_raises = RuntimeError("simulated DB outage")
    migrate.run_safe_migrations()

    # Both migrations were attempted.
    assert len(conn.executes) == 2
    # The failed migration triggered a rollback; the second one succeeded.
    assert conn.rollbacks == 1
    assert conn.commits == 1


def test_returns_none_on_success(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = _FakeConn()
    monkeypatch.setattr(migrate, "engine", _patched_engine(conn).__enter__())
    result = migrate.run_safe_migrations()
    assert result is None


def test_returns_none_on_partial_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    # Even when every migration fails, the runner must return None rather
    # than raising — startup must continue so the app binds $PORT.
    conn = _FakeConn()
    original_execute = conn.execute

    def always_fail(sql: Any) -> None:
        # Record the attempt (so the test sees every migration was tried)
        # then raise, simulating a DB outage mid-batch.
        original_execute(sql)
        raise RuntimeError("simulated outage")

    conn.execute = always_fail  # type: ignore[assignment]
    engine = _patched_engine(conn).__enter__()
    monkeypatch.setattr(migrate, "engine", engine)

    result = migrate.run_safe_migrations()
    assert result is None
    # Every migration attempted, every one rolled back, no commit.
    assert len(conn.executes) == 2
    assert conn.commits == 0
    assert conn.rollbacks == 2


def test_migrations_use_if_not_exists_for_idempotency() -> None:
    # Static check on the SQL the runner emits. If a future edit ever drops
    # the IF NOT EXISTS clause, every subsequent startup would fail on a
    # duplicate-column error and refuse to boot.
    assert all(
        "IF NOT EXISTS" in sql.upper()
        for sql in migrate.migrations
        if "ALTER TABLE" in sql.upper()
    )


def test_migration_count_log_matches_actual_list() -> None:
    # The runner logs `extra={"count": len(migrations)}` — if the
    # migrations list ever diverges from a constant elsewhere, the log
    # would mislead ops. Lock the list length at the current documented
    # value so any drift trips this test.
    assert len(migrate.migrations) == 2


def test_migrations_only_target_users_table() -> None:
    # Safety check: ALTER TABLE statements must only target the documented
    # `users` table. A future edit that accidentally tries to alter a
    # different table would risk a destructive operation; this guard
    # fails loudly so the change is deliberate.
    for sql in migrate.migrations:
        upper = sql.upper()
        if "ALTER TABLE" in upper:
            assert "USERS" in upper, f"Unexpected target table in: {sql}"
