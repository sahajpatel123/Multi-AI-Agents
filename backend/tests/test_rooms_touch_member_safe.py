"""Regression tests: ``_touch_room_member`` is side-effect-safe.

The function is invoked as a Starlette ``BackgroundTask`` after
``GET /api/rooms/{slug}`` returns. A failure here MUST NOT propagate
into the request lifecycle (which is already over) AND MUST NOT crash
the worker. Specifically:

  - When the member row is gone (deleted concurrently), the function
    exits silently — nothing to update.
  - When the DB raises on commit, the function rolls back, logs, and
    exits without raising — so a transient DB blip does not poison the
    background-task runner.

These tests pin those two contracts. A refactor that drops the
``try/except`` or skips the ``db.rollback()`` would let a transient
DB error become an unhandled exception in the background-task runner,
which Starlette logs as ERROR every time.
"""

from __future__ import annotations

import logging

import pytest


def _patch_session_local(monkeypatch, fake_session):
    """Point ``arena.routes.rooms.SessionLocal`` at a stubbed session."""
    monkeypatch.setattr("arena.routes.rooms.SessionLocal", lambda: fake_session)


class _FakeMemberRow:
    def __init__(self, *, id: int, last_seen_at=None):
        self.id = id
        self.last_seen_at = last_seen_at


class _FakeQuery:
    def __init__(self, return_value):
        self._return_value = return_value

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._return_value


class _FakeSession:
    """Stub that records commit / rollback / close calls."""

    def __init__(self, *, query_return=None, commit_raises: Exception | None = None):
        self._query_return = query_return
        self._commit_raises = commit_raises
        self.commits = 0
        self.rollbacks = 0
        self.closed = False

    def query(self, *args, **kwargs):
        return _FakeQuery(self._query_return)

    def commit(self):
        self.commits += 1
        if self._commit_raises is not None:
            raise self._commit_raises

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True


@pytest.mark.asyncio
async def test_touch_updates_last_seen_and_commits(monkeypatch):
    fake = _FakeSession(query_return=_FakeMemberRow(id=1))
    _patch_session_local(monkeypatch, fake)

    from arena.routes.rooms import _touch_room_member

    _touch_room_member(1)

    assert fake.commits == 1
    assert fake.closed is True
    # The last_seen_at was set on the row before commit.
    assert isinstance(fake._query_return.last_seen_at, object)


@pytest.mark.asyncio
async def test_touch_missing_member_silently_no_commit(monkeypatch):
    """Member row was deleted concurrently — nothing to update, just close."""
    fake = _FakeSession(query_return=None)
    _patch_session_local(monkeypatch, fake)

    from arena.routes.rooms import _touch_room_member

    _touch_room_member(42)

    assert fake.commits == 0
    assert fake.closed is True


@pytest.mark.asyncio
async def test_touch_commit_failure_does_not_raise(monkeypatch, caplog):
    """A transient DB error on commit must NOT propagate out of the
    background task. The function must roll back, log, and return cleanly."""
    fake = _FakeSession(
        query_return=_FakeMemberRow(id=1),
        commit_raises=RuntimeError("connection lost"),
    )
    _patch_session_local(monkeypatch, fake)

    from arena.routes.rooms import _touch_room_member

    with caplog.at_level(logging.WARNING, logger="arena.routes.rooms"):
        # Must not raise.
        _touch_room_member(1)

    assert fake.commits == 1  # commit() was attempted
    assert fake.rollbacks == 1
    assert fake.closed is True
    # And the operator gets a warning with traceback, not an unhandled exception.
    assert any(
        "Failed to touch room member last_seen_at" in rec.message
        for rec in caplog.records
    )