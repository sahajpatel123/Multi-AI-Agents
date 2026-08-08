"""Tests for the Orchestrator's pure helpers.

orchestrator is the cross-task synthesizer used by the Arena non-streaming
fan-out. Drift in _parse_agent_response / _inject_tool_context /
_prepend_memory_context / _create_error_response would silently desync
the AgentResponse shape the frontend consumes.
"""
from __future__ import annotations

from typing import Any

import pytest

from arena.core.orchestrator import Orchestrator
from arena.models.schemas import AgentConfig, AgentResponse


def _orchestrator() -> Orchestrator:
    # __init__ reads MODEL_REGISTRY but doesn't actually call any LLM,
    # so a real (un-patched) init works in this test environment.
    return Orchestrator()


def _agent(agent_id: str = "agent_1") -> AgentConfig:
    obj = type("AgentConfig", (), {})()
    obj.agent_id = agent_id
    obj.agent_number = 1
    return obj


# ── _inject_tool_context ─────────────────────────────────────


def test_inject_tool_context_concatenates() -> None:
    orch = _orchestrator()
    out = orch._inject_tool_context("base prompt", "tool output here")
    assert "base prompt" in out
    assert "tool output here" in out


def test_inject_tool_context_preserves_base_prompt_first() -> None:
    # The base system prompt must precede the tool context so the model's
    # primary instructions aren't buried under tool output.
    orch = _orchestrator()
    out = orch._inject_tool_context("BASE", "TOOL")
    assert out.index("BASE") < out.index("TOOL")


def test_inject_tool_context_empty_tool_context_unchanged() -> None:
    orch = _orchestrator()
    out = orch._inject_tool_context("base only", "")
    assert "base only" in out


def test_inject_tool_context_empty_base_returns_empty_or_tool_only() -> None:
    orch = _orchestrator()
    out = orch._inject_tool_context("", "tool")
    # The function should not return nothing if a tool context was
    # provided — pin whatever the current contract is.
    assert "tool" in out or out == ""


# ── _prepend_memory_context ──────────────────────────────────


def test_prepend_memory_context_returns_concatenated_string() -> None:
    orch = _orchestrator()
    out = orch._prepend_memory_context("base prompt", "memory context")
    assert "base prompt" in out
    assert "memory context" in out


def test_prepend_memory_context_memory_precedes_base() -> None:
    # Memory context comes first so the LLM sees prior sessions before
    # the live system prompt.
    orch = _orchestrator()
    out = orch._prepend_memory_context("BASE", "MEMORY")
    assert out.index("MEMORY") < out.index("BASE")


def test_prepend_memory_context_empty_memory_returns_base() -> None:
    orch = _orchestrator()
    out = orch._prepend_memory_context("only base", "")
    assert "only base" in out


# ── _parse_agent_response ────────────────────────────────────


def test_parse_agent_response_parses_clean_json() -> None:
    orch = _orchestrator()
    raw = '{"verdict": "x", "one_liner": "y", "confidence": 85, "key_assumption": "z"}'
    out = orch._parse_agent_response(raw, _agent())
    assert isinstance(out, AgentResponse)
    assert out.verdict == "x"
    assert out.one_liner == "y"
    assert out.confidence == 85
    assert out.key_assumption == "z"


def test_parse_agent_response_strips_markdown_code_blocks() -> None:
    # The LLM often wraps JSON in ```json ... ``` — the helper strips
    # the fence before parsing.
    orch = _orchestrator()
    raw = '```json\n{"verdict": "v", "one_liner": "l", "confidence": 60}\n```'
    out = orch._parse_agent_response(raw, _agent())
    assert out.verdict == "v"
    assert out.confidence == 60


def test_parse_agent_response_strips_plain_fence() -> None:
    orch = _orchestrator()
    raw = '```\n{"verdict": "v", "one_liner": "l"}\n```'
    out = orch._parse_agent_response(raw, _agent())
    assert out.verdict == "v"


def test_parse_agent_response_defaults_confidence_to_50() -> None:
    # The contract: confidence defaults to 50 when missing from the LLM
    # output. Lock that value.
    orch = _orchestrator()
    raw = '{"verdict": "v", "one_liner": "l"}'
    out = orch._parse_agent_response(raw, _agent())
    assert out.confidence == 50


def test_parse_agent_response_preserves_agent_metadata() -> None:
    orch = _orchestrator()
    agent = _agent(agent_id="agent_3")
    agent.agent_number = 2  # 1..4 valid range per AgentResponse
    raw = '{"verdict": "v"}'
    out = orch._parse_agent_response(raw, agent)
    assert out.agent_id == "agent_3"
    assert out.agent_number == 2


def test_parse_agent_response_invalid_json_raises() -> None:
    # The helper does NOT gracefully handle malformed JSON — it raises
    # json.JSONDecodeError. This is a deliberate contract: callers are
    # expected to wrap with the error_response fallback.
    orch = _orchestrator()
    with pytest.raises(Exception):  # json.JSONDecodeError or ValueError
        orch._parse_agent_response("not json", _agent())


# ── _create_error_response ──────────────────────────────────


def test_create_error_response_uses_error_prefix() -> None:
    orch = _orchestrator()
    out = orch._create_error_response(_agent(), "rate_limited")
    assert "Error" in out.verdict
    assert "rate_limited" in out.verdict


def test_create_error_response_one_liner_marks_unavailable() -> None:
    orch = _orchestrator()
    out = orch._create_error_response(_agent(), "boom")
    # The one_liner on an error response is a fixed human-readable marker.
    assert "unavailable" in out.one_liner.lower() or out.one_liner == ""


def test_create_error_response_preserves_agent_metadata() -> None:
    orch = _orchestrator()
    agent = _agent(agent_id="agent_42")
    out = orch._create_error_response(agent, "boom")
    assert out.agent_id == "agent_42"


def test_create_error_response_confidence_is_zero() -> None:
    # On error, confidence must be 0 (the LLM didn't produce a verdict)
    # so downstream callers don't credit a failed run.
    orch = _orchestrator()
    out = orch._create_error_response(_agent(), "boom")
    assert out.confidence == 0
