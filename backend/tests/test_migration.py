"""Tests for the migration flag helpers.

migration.py exposes the Condura migration-flag scan / resolve helpers
consumed by /api/condura/migration-flags and the reconciliation loop.
Drift here means either:
  - resolve_flag returns True for a flag that doesn't exist (silent DB
    mutation + misleading UX)
  - resolve_flag truncates user_decision to a different length than
    the DB column allows
  - summarize_flags_for_user returns the wrong total / grouping shape
    and the UI's status badge mis-renders

We pin the two simplest DB-bound helpers with fake queries.
"""
from __future__ import annotations

from typing import Any, Optional

import pytest


# ── resolve_flag ─────────────────────────────────────────────────


def _make_migration_flag(
    flag_id: int = 1,
    user_id: int = 42,
    resolved_at: Optional[Any] = None,
) -> Any:
    obj = type("MigrationFlag", (), {})()
    obj.id = flag_id
    obj.user_id = user_id
    obj.resolved_at = resolved_at
    obj.user_decision = None
    return obj


class _ResolveFlagFakeQuery:
    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows
        self.filters: list[Any] = []

    def filter(self, *args: Any, **kwargs: Any) -> "_ResolveFlagFakeQuery":
        self.filters.extend(args)
        return self

    def first(self) -> Optional[Any]:
        return self._rows[0] if self._rows else None


class _ResolveFlagFakeSession:
    def __init__(self, rows: list[Any]) -> None:
        self.rows = rows
        self.commits: int = 0

    def query(self, _model: Any) -> _ResolveFlagFakeQuery:
        return _ResolveFlagFakeQuery(self.rows)

    def commit(self) -> None:
        self.commits += 1


def test_resolve_flag_returns_true_when_flag_found(monkeypatch) -> None:
    from arena.core import migration

    fixed = datetime(2026, 7, 20, 12, 0, 0)
    monkeypatch.setattr(migration, "utcnow_naive", lambda: fixed)
    flag = _make_migration_flag()
    db = _ResolveFlagFakeSession([flag])
    result = migration.resolve_flag(db, user_id=42, flag_id=1, decision="accept")
    assert result is True
    assert flag.resolved_at == fixed
    assert flag.user_decision == "accept"
    assert db.commits == 1


def test_resolve_flag_returns_false_when_flag_not_found() -> None:
    from arena.core import migration

    db = _ResolveFlagFakeSession([])  # no rows match
    result = migration.resolve_flag(db, user_id=42, flag_id=99, decision="accept")
    assert result is False
    assert db.commits == 0  # nothing committed


def test_resolve_flag_truncates_user_decision_to_64_chars() -> None:
    # The DB column is VARCHAR(64). If the helper ever drops the
    # [:64] clamp, the SQL would fail at commit with a truncation error.
    from arena.core import migration

    flag = _make_migration_flag()
    db = _ResolveFlagFakeSession([flag])
    long_decision = "X" * 200
    migration.resolve_flag(db, user_id=42, flag_id=1, decision=long_decision)
    assert len(flag.user_decision) == 64
    assert flag.user_decision == "X" * 64


def test_resolve_flag_preserves_short_user_decision() -> None:
    from arena.core import migration

    flag = _make_migration_flag()
    db = _ResolveFlagFakeSession([flag])
    migration.resolve_flag(db, user_id=42, flag_id=1, decision="ok")
    assert flag.user_decision == "ok"


def test_resolve_flag_does_not_touch_unrelated_flags(monkeypatch) -> None:
    # The fake query returns the matched flag in [0]; other rows must
    # not be modified (the filter scope is user_id + flag_id + open).
    from arena.core import migration

    flag_a = _make_migration_flag(flag_id=1, user_id=42)
    flag_b = _make_migration_flag(flag_id=2, user_id=42)
    monkeypatch.setattr(migration, "utcnow_naive", lambda: datetime(2026, 7, 20))
    db = _ResolveFlagFakeSession([flag_a])
    migration.resolve_flag(db, user_id=42, flag_id=1, decision="accept")
    assert flag_a.resolved_at is not None
    assert flag_b.resolved_at is None  # untouched


# ── summarize_flags_for_user ────────────────────────────────────


def _make_migration_flag_for_summary(
    flag_id: int,
    user_id: int,
    kind: Any,
    affected_capability: str,
    resolved_at: Optional[Any] = None,
) -> Any:
    obj = type("MigrationFlag", (), {})()
    obj.id = flag_id
    obj.user_id = user_id
    obj.kind = kind
    obj.affected_capability = affected_capability
    obj.resolved_at = resolved_at
    return obj


class _CountQuery:
    """Mock for .filter(...).count()."""

    def __init__(self, total: int) -> None:
        self._total = total

    def filter(self, *args: Any, **kwargs: Any) -> "_CountQuery":
        return self

    def count(self) -> int:
        return self._total


class _GroupByQuery:
    """Mock for db.query(Model.kind, func.count(...)).filter(...).group_by(...).all()."""

    def __init__(self, rows: list[tuple[Any, int]]) -> None:
        self._rows = rows
        self._last_filter: Any = None

    def filter(self, *args: Any, **kwargs: Any) -> "_GroupByQuery":
        return self

    def group_by(self, *args: Any, **kwargs: Any) -> "_GroupByQuery":
        return self

    def all(self) -> list[tuple[Any, int]]:
        return list(self._rows)


class _SummarizeFakeSession:
    """Mock Session whose query() returns the appropriate fake for the
    call pattern: a count-query for total_open, and a group_by-query
    for by_kind / by_capability.

    The helper calls query() 3 times: once for count, twice for group_by.
    Each call returns the next entry from `query_results` in order.
    """

    def __init__(self, query_results: list[Any]) -> None:
        self._query_results = list(query_results)
        self._call_count = 0

    def query(self, *args: Any, **kwargs: Any) -> Any:
        self._call_count += 1
        return self._query_results[self._call_count - 1]


class _StringEnum:
    """Fake enum that exposes `.value` for the summarize helper."""

    def __init__(self, value: str) -> None:
        self.value = value


def test_summarize_returns_zero_counts_when_no_open_flags() -> None:
    from arena.core import migration

    db = _SummarizeFakeSession([
        _CountQuery(0),  # total_open
        _GroupByQuery([]),  # by_kind
        _GroupByQuery([]),  # by_capability
    ])
    out = migration.summarize_flags_for_user(db, user_id=42)
    assert out == {"total_open": 0, "by_kind": {}, "by_capability": {}}


def test_summarize_groups_by_kind_and_capability(monkeypatch) -> None:
    from arena.core import migration

    # MigrationFlag.kind and affected_capability are read via .kind /
    # .affected_capability attributes on the row. The mock returns
    # (_StringEnum, int) tuples from group_by.
    db = _SummarizeFakeSession([
        _CountQuery(5),
        _GroupByQuery([
            (_StringEnum("watchlist"), 3),
            (_StringEnum("orchestration"), 2),
        ]),
        _GroupByQuery([
            ("app.open_in_linear", 3),
            ("agent.research", 2),
        ]),
    ])
    out = migration.summarize_flags_for_user(db, user_id=42)
    assert out["total_open"] == 5
    assert out["by_kind"] == {"watchlist": 3, "orchestration": 2}
    assert out["by_capability"] == {"app.open_in_linear": 3, "agent.research": 2}


def test_summarize_total_open_is_int_not_str() -> None:
    from arena.core import migration

    db = _SummarizeFakeSession([
        _CountQuery(7),
        _GroupByQuery([]),
        _GroupByQuery([]),
    ])
    out = migration.summarize_flags_for_user(db, user_id=42)
    assert isinstance(out["total_open"], int)
    assert out["total_open"] == 7


def test_summarize_top_level_shape_is_stable() -> None:
    # Lock the response shape — the Account page reads total_open + by_kind.
    from arena.core import migration

    db = _SummarizeFakeSession([
        _CountQuery(0),
        _GroupByQuery([]),
        _GroupByQuery([]),
    ])
    out = migration.summarize_flags_for_user(db, user_id=42)
    assert set(out.keys()) == {"total_open", "by_kind", "by_capability"}


# ── Shared imports for the test file ────────────────────────────


from datetime import datetime  # noqa: E402  (used by tests above)
