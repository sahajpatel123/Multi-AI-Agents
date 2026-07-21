"""Tests for the agent_pipeline pure helpers.

agent_pipeline owns the 8-stage Agent research pipeline. The async +
DB-bound paths are integration-tested; here we pin the pure helpers.

Drift here means either:
  - _format_refinement_conversation drops critical signal (the
    refinement LLM sees stale history)
  - _mark_stage_pending silently no-ops for valid stage names
  - _plain_answer_text mishandles structured final_answers
"""
from __future__ import annotations

from typing import Any

import pytest

from arena.core.agent_pipeline import (
    _format_refinement_conversation,
    _mark_stage_pending,
    _plain_answer_text,
)
from arena.core.blackboard import Blackboard, StageStatus


# ── _plain_answer_text ────────────────────────────────────────


def test_plain_answer_text_passes_through_plain_string() -> None:
    assert _plain_answer_text("just a plain answer") == "just a plain answer"


def test_plain_answer_text_extracts_sentences_from_json() -> None:
    import json as _json
    structured = _json.dumps({
        "sentences": [
            {"text": "First sentence."},
            {"text": "Second sentence."},
        ]
    })
    out = _plain_answer_text(structured)
    assert "First sentence" in out
    assert "Second sentence" in out


def test_plain_answer_text_skips_non_dict_sentences() -> None:
    import json as _json
    structured = _json.dumps({
        "sentences": [
            {"text": "ok"},
            "not a dict",
            None,
        ]
    })
    out = _plain_answer_text(structured)
    assert "ok" in out
    assert "not a dict" not in out


def test_plain_answer_text_passes_through_whitespace_unchanged() -> None:
    # _plain_answer_text only extracts sentences from JSON; for plain text
    # (including leading/trailing whitespace) it returns the input as-is.
    # The downstream caller is responsible for stripping whitespace.
    assert _plain_answer_text("  hello  ") == "  hello  "


def test_plain_answer_text_empty_string_returns_empty() -> None:
    assert _plain_answer_text("") == ""


# ── _format_refinement_conversation ──────────────────────────


def test_format_refinement_conversation_empty_returns_no_prior_messages() -> None:
    assert _format_refinement_conversation([]) == "No prior messages"


def test_format_refinement_conversation_summarizes_each_role() -> None:
    conv = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]
    out = _format_refinement_conversation(conv)
    assert "USER: hi" in out
    assert "ASSISTANT: hello" in out


def test_format_refinement_conversation_truncates_to_last_4_messages() -> None:
    conv = [
        {"role": "user", "content": "1"},
        {"role": "assistant", "content": "2"},
        {"role": "user", "content": "3"},
        {"role": "assistant", "content": "4"},
        {"role": "user", "content": "5"},
        {"role": "assistant", "content": "6"},
    ]
    out = _format_refinement_conversation(conv)
    # The last 4 messages should appear (3, 4, 5, 6); the first 2 (1, 2)
    # should NOT appear because the helper keeps only [-4:].
    assert "1" not in out
    assert "2" not in out
    assert "3" in out
    assert "4" in out
    assert "5" in out
    assert "6" in out


def test_format_refinement_conversation_truncates_long_content_at_200() -> None:
    conv = [{"role": "user", "content": "x" * 500}]
    out = _format_refinement_conversation(conv)
    # content is sliced to 200 chars; the 300 excess chars must NOT appear
    # in the output as a raw string (the prefix should be there).
    assert "x" * 300 not in out
    assert "x" * 200 in out


def test_format_refinement_conversation_uses_unknown_role_for_missing() -> None:
    conv = [{"content": "no role here"}]
    out = _format_refinement_conversation(conv)
    assert "?:" in out or "?" in out  # role defaults to "?"


def test_format_refinement_conversation_coerces_content_to_string() -> None:
    # content might be non-string (int, None) — coerced to str().
    conv = [{"role": "user", "content": 42}]
    out = _format_refinement_conversation(conv)
    assert "42" in out


# ── _mark_stage_pending ─────────────────────────────────────


def test_mark_stage_pending_sets_correct_stage_status() -> None:
    bb = Blackboard()
    # Set all stages to RUNNING first to confirm _mark_stage_pending resets
    # only the targeted one.
    for s in (bb.plan, bb.research, bb.solution, bb.critique,
              bb.verification, bb.synthesis, bb.judgment):
        s.status = StageStatus.RUNNING

    _mark_stage_pending(bb, "planner")
    assert bb.plan.status == StageStatus.PENDING
    # Other stages remain RUNNING — the helper targets a single stage.
    assert bb.research.status == StageStatus.RUNNING
    assert bb.solution.status == StageStatus.RUNNING
    assert bb.critique.status == StageStatus.RUNNING
    assert bb.verification.status == StageStatus.RUNNING
    assert bb.synthesis.status == StageStatus.RUNNING
    assert bb.judgment.status == StageStatus.RUNNING


def test_mark_stage_pending_handles_each_documented_stage() -> None:
    # The mapping uses different attribute names from the stage string keys
    # (e.g. 'planner' stage → bb.plan StageResult). Test the full mapping
    # using the stage_string → attribute_name pairing from the source.
    bb = Blackboard()
    mapping = {
        "planner": bb.plan,
        "researcher": bb.research,
        "critic": bb.critique,
        "solver": bb.solution,
        "verifier": bb.verification,
        "synthesizer": bb.synthesis,
        "judge": bb.judgment,
    }
    for stage_str, stage_result in mapping.items():
        stage_result.status = StageStatus.RUNNING
        _mark_stage_pending(bb, stage_str)
        assert stage_result.status == StageStatus.PENDING, (
            f"Stage {stage_str!r} not set to PENDING"
        )


def test_mark_stage_pending_unknown_stage_is_silent_noop() -> None:
    bb = Blackboard()
    # Snapshot all stage statuses, call with an invalid stage, assert
    # nothing changed.
    before = {s.stage_name: s.status for s in (
        bb.plan, bb.research, bb.solution, bb.critique,
        bb.verification, bb.synthesis, bb.judgment,
    )}
    _mark_stage_pending(bb, "totally-fake-stage")
    after = {s.stage_name: s.status for s in (
        bb.plan, bb.research, bb.solution, bb.critique,
        bb.verification, bb.synthesis, bb.judgment,
    )}
    assert before == after


def test_mark_stage_pending_resets_to_pending_from_any_state() -> None:
    bb = Blackboard()
    # From COMPLETE → PENDING, from FAILED → PENDING — the helper must
    # always set PENDING regardless of the prior state.
    bb.research.status = StageStatus.COMPLETE
    _mark_stage_pending(bb, "researcher")
    assert bb.research.status == StageStatus.PENDING

    bb.research.status = StageStatus.FAILED
    _mark_stage_pending(bb, "researcher")
    assert bb.research.status == StageStatus.PENDING

    bb.research.status = StageStatus.SKIPPED
    _mark_stage_pending(bb, "researcher")
    assert bb.research.status == StageStatus.PENDING
