"""Orchestrator gather isolation + bounded SSE queue."""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from arena.core.orchestrator import (
    STREAM_QUEUE_MAXSIZE,
    Orchestrator,
    _force_queue_put,
)
from arena.models.schemas import AgentConfig, AgentResponse


def _agent(agent_id: str = "agent_1", n: int = 1) -> AgentConfig:
    return AgentConfig(
        agent_id=agent_id,
        agent_number=n,
        name=agent_id,
        color="#000000",
        system_prompt="sys",
        temperature=0.5,
    )


def test_force_queue_put_inserts_when_full():
    q: asyncio.Queue = asyncio.Queue(maxsize=2)
    q.put_nowait({"type": "old"})
    q.put_nowait({"type": "older"})
    _force_queue_put(q, {"type": "all_done"})
    items = []
    while not q.empty():
        items.append(q.get_nowait())
    assert items[-1]["type"] == "all_done"
    assert len(items) == 2


def test_normalize_gather_results_maps_exceptions():
    orch = Orchestrator()
    agents = [_agent("agent_1", 1), _agent("agent_2", 2), _agent("agent_3", 3)]
    ok = AgentResponse(
        agent_id="agent_1",
        agent_number=1,
        verdict="ok",
        one_liner="ok",
        confidence=50,
        key_assumption="x",
    )
    raw: list[Any] = [ok, asyncio.CancelledError(), RuntimeError("boom")]
    out = orch._normalize_gather_results(agents, raw)
    assert out[0].verdict == "ok"
    assert "cancelled" in out[1].verdict.lower()
    assert "failed" in out[2].verdict.lower()


@pytest.mark.asyncio
async def test_run_all_agents_isolates_cancelled_sibling(monkeypatch):
    orch = Orchestrator()
    agents = [_agent("agent_1", 1), _agent("agent_2", 2)]

    async def fake_call(agent, *args, **kwargs):
        if agent.agent_id == "agent_1":
            raise asyncio.CancelledError()
        return AgentResponse(
            agent_id=agent.agent_id,
            agent_number=agent.agent_number,
            verdict="alive",
            one_liner="alive",
            confidence=40,
            key_assumption="a",
        )

    monkeypatch.setattr(orch, "_call_agent", fake_call)
    monkeypatch.setattr(orch.tool_router, "execute_tools", AsyncMock(return_value=[]))
    monkeypatch.setattr(orch.tool_router, "format_tool_context", lambda *_a, **_k: "")
    monkeypatch.setattr(orch.tool_router, "get_tool_summary", lambda *_a, **_k: [])
    monkeypatch.setattr(orch, "_build_memory_contexts", AsyncMock(return_value={}))
    monkeypatch.setattr(orch, "_archive_stances", AsyncMock())

    responses, _tools = await orch.run_all_agents("prompt", agents=agents)
    assert len(responses) == 2
    assert "cancelled" in responses[0].verdict.lower()
    assert responses[1].verdict == "alive"
    assert responses[0].agent_id == "agent_1"
    assert responses[1].agent_id == "agent_2"


def test_stream_queue_default_is_bounded():
    assert STREAM_QUEUE_MAXSIZE >= 64
