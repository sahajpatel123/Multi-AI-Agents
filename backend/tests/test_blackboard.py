"""Tests for the in-memory blackboard task store.

blackboard is the process-local state object that tracks a single Agent
pipeline run. Drift here means either:
  - the /json/ dict shape changes silently (frontend deserialization breaks)
  - attachments leak heavy/binary fields into API responses
  - the active_tasks registry grows unbounded (memory leak)
  - create/get/remove cycle doesn't behave correctly

We pin the pure helpers + the create/get/remove lifecycle.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from arena.core.blackboard import (
    Blackboard,
    StageResult,
    StageStatus,
    _json_enum,
    create_blackboard,
    get_blackboard,
    remove_blackboard,
)


@pytest.fixture(autouse=True)
def _reset_active_tasks():
    """Each test starts with a clean active_tasks registry."""
    from arena.core import blackboard

    blackboard.active_tasks.clear()
    yield
    blackboard.active_tasks.clear()


# ── _json_enum ────────────────────────────────────────────────────


def test_json_enum_returns_value_for_enum() -> None:
    from enum import Enum

    class Color(Enum):
        RED = "red"

    assert _json_enum(Color.RED) == "red"


def test_json_enum_passes_through_string() -> None:
    assert _json_enum("hello") == "hello"


def test_json_enum_passes_through_int() -> None:
    assert _json_enum(42) == 42


def test_json_enum_passes_through_none() -> None:
    assert _json_enum(None) is None


def test_json_enum_passes_through_dict() -> None:
    # Dicts are JSON-serializable on their own.
    assert _json_enum({"a": 1}) == {"a": 1}


# ── Blackboard.add_message ────────────────────────────────────────


def test_add_message_appends_to_conversation() -> None:
    bb = Blackboard()
    bb.add_message("user", "Hello")
    bb.add_message("assistant", "Hi back")
    assert len(bb.conversation) == 2
    assert bb.conversation[0]["role"] == "user"
    assert bb.conversation[0]["content"] == "Hello"
    assert bb.conversation[1]["role"] == "assistant"
    assert bb.conversation[1]["content"] == "Hi back"


def test_add_message_sets_iso_timestamp() -> None:
    bb = Blackboard()
    bb.add_message("user", "test")
    ts = bb.conversation[0]["timestamp"]
    # ISO format with 'T' separator and 'Z' or '+00:00' suffix (timezone.utc)
    assert isinstance(ts, str)
    assert "T" in ts


def test_add_message_carries_optional_refinement_type() -> None:
    bb = Blackboard()
    bb.add_message("user", "Refine this", refinement_type="clarify")
    assert bb.conversation[0]["refinement_type"] == "clarify"


def test_add_message_refinement_type_defaults_to_none() -> None:
    bb = Blackboard()
    bb.add_message("user", "test")
    assert bb.conversation[0]["refinement_type"] is None


# ── Blackboard._attachments_public_view ───────────────────────────


def test_attachments_public_view_strips_heavy_fields() -> None:
    bb = Blackboard()
    bb.attachments = [
        {
            "file_id": "f1",
            "filename": "report.pdf",
            "type": "application/pdf",
            "content_base64": "BASE64_DATA_HERE",  # heavy
            "raw_bytes": b"binary",  # heavy
            "internal_path": "/tmp/secret/path",  # internal
        }
    ]
    view = bb._attachments_public_view()
    assert len(view) == 1
    att = view[0]
    assert att == {
        "file_id": "f1",
        "filename": "report.pdf",
        "type": "application/pdf",
    }
    # Heavy / internal fields must NOT appear in the public view.
    assert "content_base64" not in att
    assert "raw_bytes" not in att
    assert "internal_path" not in att


def test_attachments_public_view_handles_empty_list() -> None:
    bb = Blackboard()
    bb.attachments = []
    assert bb._attachments_public_view() == []


def test_attachments_public_view_skips_non_dict_entries() -> None:
    # Defensive: if a non-dict snuck into the list (corrupted state), the
    # public view skips it rather than crashing the API response.
    bb = Blackboard()
    bb.attachments = [
        {"file_id": "f1", "filename": "ok.txt", "type": "text/plain"},
        "not-a-dict",  # corrupt
        None,  # corrupt
        42,  # corrupt
    ]
    view = bb._attachments_public_view()
    assert len(view) == 1
    assert view[0]["file_id"] == "f1"


# ── Blackboard.to_dict ───────────────────────────────────────────


def test_to_dict_includes_all_top_level_keys() -> None:
    # Lock the public API response shape — a frontend consuming
    # /api/agent/status would break if any key is renamed or removed.
    bb = Blackboard(user_id=42, task="test task")
    d = bb.to_dict()
    expected_keys = {
        "task_id", "user_id", "task", "status", "current_stage",
        "iterations", "stages", "final_answer", "final_confidence",
        "final_score", "sources", "flags", "caveats", "source_integrity",
        "contradictions", "intelligence_score", "assumptions",
        "dissent_report", "temporal_profile", "memory_saved",
        "expertise_level", "expertise_domain", "expertise_modifier",
        "steelman", "insight_report", "is_live", "live_last_checked",
        "live_next_check", "live_updates", "conversation",
        "is_refinement", "parent_task_id", "refinement_count",
        "original_task", "bridge_from_arena", "attachments",
        "mcp_integration_ids", "mcp_context", "total_input_tokens",
        "total_output_tokens", "total_tokens", "total_cost_usd",
        "started_at", "completed_at", "error",
    }
    assert set(d.keys()) == expected_keys


def test_to_dict_stages_includes_all_seven_stages() -> None:
    bb = Blackboard()
    d = bb.to_dict()
    expected_stages = {
        "planner", "researcher", "solver", "critic", "verifier",
        "synthesizer", "judge",
    }
    assert set(d["stages"].keys()) == expected_stages


def test_to_dict_stage_payload_shape() -> None:
    bb = Blackboard()
    d = bb.to_dict()
    for stage_name, stage_payload in d["stages"].items():
        # Every stage payload must carry status / output / model / duration_ms.
        assert set(stage_payload.keys()) == {
            "status", "output", "model", "duration_ms",
        }, f"Stage {stage_name!r} has unexpected payload keys"


def test_to_dict_serializes_enum_values_as_strings() -> None:
    bb = Blackboard()
    bb.plan.status = StageStatus.COMPLETE
    d = bb.to_dict()
    assert d["stages"]["planner"]["status"] == "complete"
    assert d["status"] == "pending"  # Blackboard.status default = PENDING


def test_to_dict_attachments_use_public_view() -> None:
    bb = Blackboard()
    bb.attachments = [
        {"file_id": "f1", "filename": "x", "type": "text/plain", "raw": "heavy"}
    ]
    d = bb.to_dict()
    # The dict response must use the public view (heavy fields stripped)
    assert d["attachments"][0] == {"file_id": "f1", "filename": "x", "type": "text/plain"}


def test_to_dict_dates_serialized_as_iso_or_none() -> None:
    bb = Blackboard()
    bb.started_at = datetime(2026, 7, 20, 12, 0, 0, tzinfo=timezone.utc)
    bb.completed_at = datetime(2026, 7, 20, 12, 30, 0, tzinfo=timezone.utc)
    d = bb.to_dict()
    assert d["started_at"] == "2026-07-20T12:00:00+00:00"
    assert d["completed_at"] == "2026-07-20T12:30:00+00:00"


def test_to_dict_dates_none_when_unset() -> None:
    bb = Blackboard()
    d = bb.to_dict()
    assert d["started_at"] is None
    assert d["completed_at"] is None


# ── Blackboard defaults ───────────────────────────────────────────


def test_blackboard_default_task_id_is_uuid_string() -> None:
    bb = Blackboard()
    assert isinstance(bb.task_id, str)
    assert len(bb.task_id) == 36  # standard UUID length
    # Two blackboards get different default IDs.
    bb2 = Blackboard()
    assert bb.task_id != bb2.task_id


def test_blackboard_default_status_is_pending() -> None:
    bb = Blackboard()
    assert bb.status.value == "pending"


def test_blackboard_default_current_stage_is_planner() -> None:
    bb = Blackboard()
    assert bb.current_stage == "planner"


def test_blackboard_default_iteration_caps() -> None:
    bb = Blackboard()
    assert bb.iterations == 0
    assert bb.max_iterations == 2


def test_blackboard_each_stage_default_is_pending() -> None:
    bb = Blackboard()
    for stage in (bb.plan, bb.research, bb.solution, bb.critique,
                  bb.verification, bb.synthesis, bb.judgment):
        assert stage.status == StageStatus.PENDING


def test_blackboard_default_token_costs_are_zero() -> None:
    bb = Blackboard()
    assert bb.total_input_tokens == 0
    assert bb.total_output_tokens == 0
    assert bb.total_tokens == 0
    assert bb.total_cost_usd == 0.0


# ── StageResult defaults ────────────────────────────────────────


def test_stage_result_defaults_to_pending_with_empty_output() -> None:
    sr = StageResult(stage_name="planner")
    assert sr.stage_name == "planner"
    assert sr.status == StageStatus.PENDING
    assert sr.output == ""
    assert sr.reasoning == ""
    assert sr.confidence == 0.0
    assert sr.tokens_used == 0
    assert sr.duration_ms == 0
    assert sr.model_used == ""
    assert sr.error is None


# ── create / get / remove lifecycle ─────────────────────────────


def test_create_blackboard_registers_and_returns_bb() -> None:
    bb = create_blackboard(user_id=42, task="hello")
    assert bb.user_id == 42
    assert bb.task == "hello"
    # Lookup by task_id works
    assert get_blackboard(bb.task_id) is bb


def test_create_blackboard_sets_started_at_to_now() -> None:
    before = datetime.now(timezone.utc)
    bb = create_blackboard(user_id=1, task="x")
    after = datetime.now(timezone.utc)
    # started_at is between before and after (within a sub-second window)
    assert before <= bb.started_at <= after


def test_create_blackboard_sets_original_task_to_task() -> None:
    bb = create_blackboard(user_id=1, task="research SaaS pricing")
    assert bb.original_task == "research SaaS pricing"
    assert bb.task == "research SaaS pricing"


def test_create_two_blackboards_get_distinct_ids() -> None:
    a = create_blackboard(user_id=1, task="a")
    b = create_blackboard(user_id=1, task="b")
    assert a.task_id != b.task_id


def test_get_blackboard_returns_none_for_unknown_id() -> None:
    assert get_blackboard("does-not-exist") is None


def test_remove_blackboard_drops_from_registry() -> None:
    bb = create_blackboard(user_id=1, task="x")
    assert get_blackboard(bb.task_id) is bb
    remove_blackboard(bb.task_id)
    assert get_blackboard(bb.task_id) is None


def test_remove_blackboard_unknown_id_is_silent_noop() -> None:
    # Must not raise on unknown ids — the cleanup pass after pipeline
    # completion calls remove_blackboard unconditionally.
    remove_blackboard("never-existed")
    remove_blackboard("never-existed")  # safe to call twice
