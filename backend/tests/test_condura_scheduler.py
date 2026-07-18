"""Unit tests for arena.core.condura_scheduler sweep loop helpers."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from arena.core import condura_scheduler as cs


@pytest.mark.asyncio
async def test_schedule_runs_one_sweep_then_sleeps(monkeypatch):
    calls = {"mark": 0, "purge": 0, "sleep": 0}

    def _mark(db, older_than_hours=6):
        calls["mark"] += 1
        return 2

    def _purge(db):
        calls["purge"] += 1
        return 1

    async def _sleep(_seconds):
        calls["sleep"] += 1
        raise asyncio_break()

    class asyncio_break(Exception):
        pass

    session = MagicMock()
    monkeypatch.setattr(cs, "SessionLocal", lambda: session)
    monkeypatch.setattr(cs, "mark_stale_handoffs", _mark)
    monkeypatch.setattr(cs, "purge_expired_handoffs", _purge)
    monkeypatch.setattr(cs.asyncio, "sleep", _sleep)

    with pytest.raises(asyncio_break):
        await cs.schedule_condura_reconciler()

    assert calls["mark"] == 1
    assert calls["purge"] == 1
    assert calls["sleep"] == 1
    session.close.assert_called_once()


@pytest.mark.asyncio
async def test_schedule_survives_sweep_exception(monkeypatch):
    calls = {"sleep": 0}

    def _boom(db, older_than_hours=6):
        raise RuntimeError("db down")

    async def _sleep(_seconds):
        calls["sleep"] += 1
        raise StopAsyncIteration()

    session = MagicMock()
    monkeypatch.setattr(cs, "SessionLocal", lambda: session)
    monkeypatch.setattr(cs, "mark_stale_handoffs", _boom)
    monkeypatch.setattr(cs, "purge_expired_handoffs", lambda db: 0)
    monkeypatch.setattr(cs.asyncio, "sleep", _sleep)
    warn = MagicMock()
    monkeypatch.setattr(cs.logger, "warning", warn)

    with pytest.raises(StopAsyncIteration):
        await cs.schedule_condura_reconciler()

    assert warn.called
    assert calls["sleep"] == 1
    session.close.assert_called_once()


def test_sweep_constants():
    assert cs.SWEEP_INTERVAL_SECONDS == 6 * 60 * 60
    assert cs.STALE_AFTER_HOURS == 6
