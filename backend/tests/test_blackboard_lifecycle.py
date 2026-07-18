"""Blackboard lifecycle — module-level active_tasks is a bounded dict.

Cycle 17 wired ``remove_blackboard(task_id)`` into the agent pipeline
completion path so the in-process ``active_tasks`` dict doesn't grow
unbounded across many runs. This file covers the three primitives
the cycle 17 fix relies on:

  1. ``create_blackboard`` puts a new entry in active_tasks.
  2. ``get_blackboard`` reads it back.
  3. ``remove_blackboard`` pops it.

A regression in any of these breaks the bounded-memory guarantee.
"""

from __future__ import annotations

from arena.core.blackboard import (
    active_tasks,
    create_blackboard,
    get_blackboard,
    remove_blackboard,
)


def _clear_active_tasks() -> None:
    """Drop every test-leaked entry so each test starts from a clean dict.

    The blackboard module's active_tasks is a module-level dict that
    persists across tests in the same process. Other tests in this
    suite (test_agent_status_route, test_input_pipeline) also create
    blackboards without removing them, so this is needed to keep
    the assertions below deterministic.
    """
    active_tasks.clear()


def test_create_blackboard_registers_in_active_tasks():
    _clear_active_tasks()
    bb = create_blackboard(user_id=42, task="hello")
    assert bb.task_id in active_tasks
    assert active_tasks[bb.task_id] is bb


def test_get_blackboard_returns_live_entry():
    _clear_active_tasks()
    bb = create_blackboard(user_id=7, task="fetch me")
    assert get_blackboard(bb.task_id) is bb
    # Unknown id is None, not KeyError.
    assert get_blackboard("does-not-exist") is None


def test_remove_blackboard_drops_entry():
    _clear_active_tasks()
    bb = create_blackboard(user_id=1, task="drop me")
    assert bb.task_id in active_tasks
    remove_blackboard(bb.task_id)
    assert bb.task_id not in active_tasks
    # Idempotent — removing a second time is a no-op, not an error.
    remove_blackboard(bb.task_id)
    assert bb.task_id not in active_tasks


def test_active_tasks_does_not_grow_across_create_remove_cycles():
    """The bounded-memory guarantee: any number of create+remove
    cycles leaves active_tasks empty (modulo entries other tests
    created in this process — cleared by the helper)."""
    _clear_active_tasks()
    for i in range(50):
        bb = create_blackboard(user_id=i, task=f"task-{i}")
        remove_blackboard(bb.task_id)
    assert active_tasks == {}