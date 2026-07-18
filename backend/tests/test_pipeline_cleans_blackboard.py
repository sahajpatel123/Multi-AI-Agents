"""End-to-end: run_agent_pipeline_background removes the blackboard.

The cycle 17 fix wired ``remove_blackboard(task_id)`` into the
``run_agent_pipeline_background`` function so the module-level
``active_tasks`` dict doesn't grow unbounded across runs. This file
exercises that path: a successful pipeline completion must drop
the blackboard entry, and a raised exception in the pipeline must
also drop it (via the ``finally`` block).
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from arena.core.blackboard import active_tasks, create_blackboard
from arena.routes.agent import run_agent_pipeline_background


def _bb_id() -> str:
    """Helper: create a blackboard and return its id (also stashes in active_tasks)."""
    bb = create_blackboard(user_id=99, task="t")
    return bb.task_id


@pytest.mark.asyncio
async def test_successful_pipeline_drops_blackboard(monkeypatch):
    tid = _bb_id()
    assert tid in active_tasks

    # Stub the long path so the test doesn't run the full agent stack.
    async def _ok_pipeline(bb, memory_context, expertise_level, expertise_domain):
        from arena.core.blackboard import AgentStatus

        bb.status = AgentStatus.COMPLETE
        return bb

    monkeypatch.setattr(
        "arena.routes.agent.run_agent_pipeline_on_blackboard",
        _ok_pipeline,
    )
    monkeypatch.setattr(
        "arena.core.agent_memory.get_user_memory_context",
        lambda *a, **kw: [],
    )
    monkeypatch.setattr(
        "arena.routes.agent._save_completed_task_to_memory",
        AsyncMock(),
    )

    await run_agent_pipeline_background(
        task_id=tid, user_id=99, task="t"
    )
    # After the pipeline finishes — success or failure — the blackboard
    # must be removed from active_tasks. Without cycle 17's fix, the
    # entry would still be there.
    assert tid not in active_tasks


@pytest.mark.asyncio
async def test_failing_pipeline_still_drops_blackboard(monkeypatch):
    """The cleanup runs in ``finally``, so even a raised exception
    in the inner pipeline must drop the blackboard."""
    tid = _bb_id()
    assert tid in active_tasks

    async def _boom_pipeline(bb, memory_context, expertise_level, expertise_domain):
        raise RuntimeError("simulated pipeline failure")

    monkeypatch.setattr(
        "arena.routes.agent.run_agent_pipeline_on_blackboard",
        _boom_pipeline,
    )
    monkeypatch.setattr(
        "arena.core.agent_memory.get_user_memory_context",
        lambda *a, **kw: [],
    )

    await run_agent_pipeline_background(
        task_id=tid, user_id=99, task="t"
    )
    # Exception path: blackboard is marked FAILED in the except block,
    # but the finally block in cycle 17 still removes the entry from
    # active_tasks so it doesn't leak.
    assert tid not in active_tasks