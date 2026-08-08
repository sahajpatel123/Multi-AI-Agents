"""Regression tests: AgentTask JSON column helpers never raise on bad data.

Pins the contract from HOT-PATH-ANALYSIS MEDIUM finding
"`DBSession.topics` no server_default — raw INSERTs get NULL → `json.loads(None)` crashes".
The `_json_column_value` helper + the four row-extraction helpers in
``arena/routes/agent.py`` form a defensive normalization layer that must
NEVER raise out of any of the following inputs:

  - ``None`` (NULL column)
  - already-parsed list/dict (PostgreSQL native JSONB)
  - a JSON-encoded string (SQLite stores as text)
  - a malformed JSON string (corrupted row, partial write, manual edit)
  - a non-string non-iterable scalar (defensive — schema drift)

A regression here would let a single bad row 500 the entire
``GET /api/agent/tasks/{task_id}`` family — that surface is the agent
detail page, polled aggressively by the UI.
"""

from __future__ import annotations

import json


class _StubRow:
    """Minimal stub that quacks like AgentTaskRow for the helper functions."""

    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def test_json_column_value_handles_none():
    from arena.routes.agent import _json_column_value

    assert _json_column_value(None) is None


def test_json_column_value_passes_through_native_types():
    from arena.routes.agent import _json_column_value

    assert _json_column_value([1, 2, 3]) == [1, 2, 3]
    assert _json_column_value({"k": "v"}) == {"k": "v"}


def test_json_column_value_parses_string_payload():
    from arena.routes.agent import _json_column_value

    assert _json_column_value(json.dumps({"a": 1})) == {"a": 1}
    assert _json_column_value(json.dumps([1, 2])) == [1, 2]


def test_json_column_value_returns_none_on_malformed_string():
    from arena.routes.agent import _json_column_value

    assert _json_column_value("{not-json") is None
    assert _json_column_value("") is None
    assert _json_column_value("   ") is None


def test_json_column_value_returns_none_on_unexpected_scalar():
    """Defensive: schema drift or future column-type change must not crash."""
    from arena.routes.agent import _json_column_value

    assert _json_column_value(42) is None
    assert _json_column_value(3.14) is None
    assert _json_column_value(True) is None


def test_live_updates_from_row_returns_empty_list_for_bad_payload():
    from arena.routes.agent import _live_updates_from_row

    # Bad: malformed JSON string → must be [] (caller iterates safely).
    row = _StubRow(live_updates="{not-json")
    assert _live_updates_from_row(row) == []

    # Bad: native non-list (dict in this slot) → must be [].
    row = _StubRow(live_updates={"id": "not-a-list"})
    assert _live_updates_from_row(row) == []


def test_pipeline_contradictions_from_row_normalizes_payload():
    from arena.routes.agent import _pipeline_contradictions_from_row

    # String-encoded list (SQLite path).
    row = _StubRow(contradictions=json.dumps([{"a": 1}, {"b": 2}]))
    assert _pipeline_contradictions_from_row(row) == [{"a": 1}, {"b": 2}]

    # Native list (Postgres JSONB path).
    row = _StubRow(contradictions=[{"c": 3}])
    assert _pipeline_contradictions_from_row(row) == [{"c": 3}]

    # Garbage → [] (never raises).
    row = _StubRow(contradictions="garbage")
    assert _pipeline_contradictions_from_row(row) == []


def test_insight_report_from_row_returns_none_for_non_dict():
    from arena.routes.agent import _insight_report_from_row

    row = _StubRow(insight_report=json.dumps([1, 2]))  # list, not dict
    assert _insight_report_from_row(row) is None

    row = _StubRow(insight_report="garbage")
    assert _insight_report_from_row(row) is None


def test_intelligence_score_from_row_returns_empty_dict_for_non_dict():
    from arena.routes.agent import _intelligence_score_from_row

    row = _StubRow(intelligence_score=json.dumps([1, 2]))  # list, not dict
    assert _intelligence_score_from_row(row) == {}

    row = _StubRow(intelligence_score=None)
    assert _intelligence_score_from_row(row) == {}