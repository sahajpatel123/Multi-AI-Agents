"""Tests for agent_memory's pure helpers.

agent_memory handles topic/conclusion extraction, contradiction
detection, and task-history serialization. The async LLM paths are
integration-tested; here we pin the pure parsers + helpers.

Drift here means either:
  - LLM JSON parser accepts a malicious shape (security: JSON injection)
  - LIKE escape misses a wildcard (security: SQL injection via search)
  - contradiction direction desyncs (frontend shows wrong "old vs new")
  - old_task_id resolution falls back to "" instead of matching by text
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from arena.core.agent_memory import (
    _escape_like,
    _json_array_from_response,
    _json_object_from_response,
    _resolve_old_task_id,
    _serialize_contradiction,
)


# ── _json_array_from_response ─────────────────────────────────


def test_json_array_parses_clean_array() -> None:
    assert _json_array_from_response('[1, 2, 3]') == [1, 2, 3]


def test_json_array_extracts_array_from_surrounding_prose() -> None:
    # The LLM may wrap the array in prose. The regex extracts the first
    # [...] block.
    assert _json_array_from_response('Here is the result: ["a", "b"] -- end') == ["a", "b"]


def test_json_array_returns_empty_for_no_brackets() -> None:
    assert _json_array_from_response("no array here") == []


def test_json_array_returns_empty_for_invalid_json() -> None:
    # Malformed JSON inside the brackets → empty (don't crash the topic
    # extraction pipeline).
    assert _json_array_from_response("[{not valid]") == []


def test_json_array_handles_multiline_array() -> None:
    # re.DOTALL flag lets the array span multiple lines.
    arr = _json_array_from_response('[\n  1,\n  2,\n  3\n]')
    assert arr == [1, 2, 3]


def test_json_array_handles_nested_objects() -> None:
    arr = _json_array_from_response('[{"topic": "x"}, {"topic": "y"}]')
    assert arr == [{"topic": "x"}, {"topic": "y"}]


# ── _json_object_from_response ────────────────────────────────


def test_json_object_parses_clean_object() -> None:
    out = _json_object_from_response('{"a": 1, "b": "x"}')
    assert out == {"a": 1, "b": "x"}


def test_json_object_extracts_from_surrounding_prose() -> None:
    out = _json_object_from_response('Output: {"key": "value"} -- done')
    assert out == {"key": "value"}


def test_json_object_returns_none_for_no_braces() -> None:
    assert _json_object_from_response("no object") is None


def test_json_object_returns_none_for_invalid_json() -> None:
    assert _json_object_from_response("{not valid}") is None


def test_json_object_returns_none_for_array() -> None:
    # The helper's regex matches {...} blocks only — a top-level array
    # has no braces, so it returns None. The function name + type hint
    # promise an object (or None), and that's exactly the contract.
    assert _json_object_from_response("[1, 2, 3]") is None


# ── _resolve_old_task_id ──────────────────────────────────────


def test_resolve_old_task_id_direct_match() -> None:
    past = [{"task_id": "t1"}, {"task_id": "t2"}]
    assert _resolve_old_task_id({"old_task_id": "t2", "old_task": "x"}, past) == "t2"


def test_resolve_old_task_id_empty_id_falls_back_to_text_match() -> None:
    past = [
        {"task_id": "t1", "task_text": "research SaaS pricing"},
        {"task_id": "t2", "task_text": "investigate market size"},
    ]
    # old_task_id is empty; old_task="research saas pricing" matches t1's
    # text case-insensitively.
    assert _resolve_old_task_id(
        {"old_task_id": "", "old_task": "Research SaaS Pricing"}, past
    ) == "t1"


def test_resolve_old_task_id_no_match_returns_empty_string() -> None:
    past = [{"task_id": "t1", "task_text": "foo"}]
    assert _resolve_old_task_id(
        {"old_task_id": "t99", "old_task": "completely different"}, past
    ) == ""


def test_resolve_old_task_id_handles_empty_past_dicts() -> None:
    assert _resolve_old_task_id({"old_task_id": "t1", "old_task": "x"}, []) == ""


def test_resolve_old_task_id_strips_whitespace() -> None:
    past = [{"task_id": "t1", "task_text": "foo"}]
    # old_task_id with whitespace around it must still match.
    assert _resolve_old_task_id({"old_task_id": "  t1  ", "old_task": "x"}, past) == "t1"


def test_resolve_old_task_id_partial_text_match_first_80_chars() -> None:
    # The helper checks if old_task[:80] is a substring of task_text,
    # OR if old_task is a substring of task_text. So a 50-char snippet
    # can match a long task_text.
    past = [{"task_id": "t1", "task_text": "X" * 200}]  # 200 chars
    # old_task is 'X' * 50 → fits in task_text[:80] comparison
    assert _resolve_old_task_id(
        {"old_task_id": "", "old_task": "X" * 50}, past
    ) == "t1"


# ── _serialize_contradiction ──────────────────────────────────


class _FakeContradiction:
    def __init__(
        self,
        id: int,
        old_task_id: str,
        new_task_id: str,
        contradiction_summary: str,
        severity: str,
        resolved: bool,
        created_at: datetime | None,
    ) -> None:
        self.id = id
        self.old_task_id = old_task_id
        self.new_task_id = new_task_id
        self.contradiction_summary = contradiction_summary
        self.severity = severity
        self.resolved = resolved
        self.created_at = created_at


def test_serialize_contradiction_direction_is_new_when_focus_matches_new() -> None:
    row = _FakeContradiction(
        id=1, old_task_id="t1", new_task_id="t2",
        contradiction_summary="x", severity="high",
        resolved=False, created_at=datetime(2026, 7, 20, tzinfo=timezone.utc),
    )
    out = _serialize_contradiction(row, focus_task_id="t2")
    assert out["direction"] == "new"
    assert out["other_task_id"] == "t1"


def test_serialize_contradiction_direction_is_old_when_focus_matches_old() -> None:
    row = _FakeContradiction(
        id=1, old_task_id="t1", new_task_id="t2",
        contradiction_summary="x", severity="high",
        resolved=False, created_at=None,
    )
    out = _serialize_contradiction(row, focus_task_id="t1")
    assert out["direction"] == "old"
    assert out["other_task_id"] == "t2"


def test_serialize_contradiction_serializes_resolved_as_bool() -> None:
    row = _FakeContradiction(
        id=1, old_task_id="t1", new_task_id="t2",
        contradiction_summary="x", severity="low",
        resolved=True, created_at=None,
    )
    out = _serialize_contradiction(row, focus_task_id="t1")
    assert out["resolved"] is True
    assert isinstance(out["resolved"], bool)


def test_serialize_contradiction_iso_serializes_datetime() -> None:
    dt = datetime(2026, 7, 20, 12, 0, 0, tzinfo=timezone.utc)
    row = _FakeContradiction(
        id=1, old_task_id="t1", new_task_id="t2",
        contradiction_summary="x", severity="low",
        resolved=False, created_at=dt,
    )
    out = _serialize_contradiction(row, focus_task_id="t1")
    assert out["created_at"] == "2026-07-20T12:00:00+00:00"


def test_serialize_contradiction_none_created_at_serializes_as_none() -> None:
    row = _FakeContradiction(
        id=1, old_task_id="t1", new_task_id="t2",
        contradiction_summary="x", severity="low",
        resolved=False, created_at=None,
    )
    out = _serialize_contradiction(row, focus_task_id="t1")
    assert out["created_at"] is None


def test_serialize_contradiction_top_level_shape_is_stable() -> None:
    row = _FakeContradiction(
        id=42, old_task_id="t1", new_task_id="t2",
        contradiction_summary="summary text", severity="medium",
        resolved=False, created_at=None,
    )
    out = _serialize_contradiction(row, focus_task_id="t2")
    assert set(out.keys()) == {
        "id", "direction", "other_task_id", "summary", "severity",
        "resolved", "created_at",
    }


# ── _escape_like ──────────────────────────────────────────────


def test_escape_like_escapes_percent() -> None:
    # % is SQL LIKE wildcard; must be escaped.
    assert _escape_like("100%") == "100\\%"


def test_escape_like_escapes_underscore() -> None:
    # _ is SQL LIKE single-char wildcard.
    assert _escape_like("user_name") == "user\\_name"


def test_escape_like_escapes_backslash() -> None:
    # Backslash must be escaped FIRST so subsequent escape sequences
    # don't get double-escaped.
    assert _escape_like("path\\to\\file") == "path\\\\to\\\\file"


def test_escape_like_passes_safe_text_unchanged() -> None:
    assert _escape_like("hello world") == "hello world"


def test_escape_like_escapes_all_three_in_one_value() -> None:
    assert _escape_like("\\%_") == "\\\\\\%\\_"


def test_escape_like_empty_string() -> None:
    assert _escape_like("") == ""
