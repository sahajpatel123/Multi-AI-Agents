"""Unit tests for arena.core.live_scheduler due-check selection."""

from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.core import live_scheduler


class _Chain:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *a, **k):
        return self

    def order_by(self, *a, **k):
        return self

    def limit(self, n):
        return self

    def all(self):
        return list(self._rows)


@pytest.mark.asyncio
async def test_run_due_live_checks_invokes_checker_per_row(monkeypatch):
    now = utcnow_naive()
    rows = [
        SimpleNamespace(id=1, is_live=True, live_next_check=now - timedelta(hours=1)),
        SimpleNamespace(id=2, is_live=True, live_next_check=None),
    ]
    db = MagicMock()
    db.query.return_value = _Chain(rows)

    checker = AsyncMock()
    monkeypatch.setattr(live_scheduler, "check_live_task", checker)

    await live_scheduler.run_due_live_checks(db)

    assert checker.await_count == 2
    assert checker.await_args_list[0].args[0] is rows[0]
    assert checker.await_args_list[1].args[0] is rows[1]


@pytest.mark.asyncio
async def test_run_due_live_checks_continues_after_row_failure(monkeypatch):
    rows = [
        SimpleNamespace(id=10, is_live=True, live_next_check=None),
        SimpleNamespace(id=11, is_live=True, live_next_check=None),
    ]
    db = MagicMock()
    db.query.return_value = _Chain(rows)

    checker = AsyncMock(side_effect=[RuntimeError("boom"), None])
    monkeypatch.setattr(live_scheduler, "check_live_task", checker)
    warn = MagicMock()
    monkeypatch.setattr(live_scheduler.logger, "warning", warn)

    await live_scheduler.run_due_live_checks(db)

    assert checker.await_count == 2
    assert warn.called
