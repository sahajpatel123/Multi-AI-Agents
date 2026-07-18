"""End-to-end: the three background runners all remove the blackboard.

The cycle 17 fix wired ``remove_blackboard(task_id)`` into the
``run_agent_pipeline_background`` function so the module-level
``active_tasks`` dict doesn't grow unbounded across runs. Cycle 19
extends the same fix to the other two background runners that
also create blackboards: ``run_refinement_background`` and
``run_bridge_pipeline_background``. Both routes create a blackboard
in active_tasks before the background runner fires; without the
``finally`` cleanup the entry would stay in the dict for the
process lifetime.

This file exercises all three runners: a successful path drops
the blackboard, and a raised exception still drops it via the
``finally`` block.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from arena.core.blackboard import active_tasks, create_blackboard
from arena.routes.agent import (
    run_agent_pipeline_background,
    run_bridge_pipeline_background,
    run_refinement_background,
)


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


# ── Cycle 19: same pattern for the other two background runners. ──────


@pytest.mark.asyncio
async def test_refinement_background_drops_blackboard(monkeypatch):
    """run_refinement_background must drop the blackboard on completion.

    Cycle 19 fix wired remove_blackboard into the function's finally
    block. Without the fix, every refine call leaked an entry in
    active_tasks for the process lifetime.
    """
    tid = _bb_id()
    assert tid in active_tasks

    async def _ok_refine(existing_bb, user_message, user_id):
        return None

    monkeypatch.setattr(
        "arena.routes.agent.run_refinement_pipeline",
        _ok_refine,
    )
    await run_refinement_background(
        task_id=tid, user_message="refine me", user_id=99
    )
    assert tid not in active_tasks


@pytest.mark.asyncio
async def test_refinement_background_drops_on_failure(monkeypatch):
    """Exception path: finally still runs."""
    tid = _bb_id()
    assert tid in active_tasks

    async def _boom_refine(existing_bb, user_message, user_id):
        raise RuntimeError("refinement failed")

    monkeypatch.setattr(
        "arena.routes.agent.run_refinement_pipeline",
        _boom_refine,
    )
    await run_refinement_background(
        task_id=tid, user_message="refine me", user_id=99
    )
    assert tid not in active_tasks


@pytest.mark.asyncio
async def test_bridge_pipeline_drops_blackboard(monkeypatch):
    """run_bridge_pipeline_background must drop the blackboard on completion.

    Cycle 19 fix wired remove_blackboard into the function's finally
    block. The bridge pipeline runs from /api/agent/verify-from-arena;
    without the fix each verify call leaked a Blackboard in active_tasks.
    """
    tid = _bb_id()
    assert tid in active_tasks

    async def _ok_bridge(bb, memory_context):
        from arena.core.blackboard import AgentStatus

        bb.status = AgentStatus.COMPLETE
        return bb

    monkeypatch.setattr(
        "arena.routes.agent.run_agent_pipeline_on_blackboard",
        _ok_bridge,
    )
    await run_bridge_pipeline_background(task_id=tid, user_id=99)
    assert tid not in active_tasks


@pytest.mark.asyncio
async def test_bridge_pipeline_drops_on_failure(monkeypatch):
    """Exception path: finally still runs."""
    tid = _bb_id()
    assert tid in active_tasks

    async def _boom_bridge(bb, memory_context):
        raise RuntimeError("bridge pipeline failed")

    monkeypatch.setattr(
        "arena.routes.agent.run_agent_pipeline_on_blackboard",
        _boom_bridge,
    )
    await run_bridge_pipeline_background(task_id=tid, user_id=99)
    assert tid not in active_tasks


@pytest.mark.asyncio
async def test_bridge_invalid_blackboard_returns_without_creating(monkeypatch):
    """The function must NOT create a blackboard if the id is missing
    or owned by a different user — the active_tasks dict must stay
    untouched in that case."""
    pre = dict(active_tasks)
    await run_bridge_pipeline_background(task_id="does-not-exist", user_id=99)
    assert active_tasks == pre, "bridge runner must not add to active_tasks on early-return"