"""Tests for the watchlist question gate.

watchlist_runner._gate_watchlist_question applies the same honesty
gate used by the Agent HTTP entry points. We pin:
  - the capability_id is exactly 'watchlist.create' (the registry entry
    that the frontend surfaces in the persona picker / capabilities docs)
  - the task_text is passed through verbatim (the gate classifier
    inspects this for local-intent heuristics)
  - the decision shape matches the rest of the codebase
    ({decision, env, capability, capability_id, error_body?})
"""
from __future__ import annotations

import pytest
from unittest.mock import patch

from arena.core import watchlist_runner


def test_gate_allow_decision_for_normal_question() -> None:
    expected = {
        "decision": "allow",
        "env": "web",
        "capability": "watchlist.create",
        "capability_id": "watchlist.create",
        "error_body": None,
    }
    with patch.object(
        watchlist_runner,
        "evaluate_capability_gate",
        return_value=expected,
    ) as gate:
        result = watchlist_runner._gate_watchlist_question("What changed in markets this week?")
    gate.assert_called_once_with(
        capability_id="watchlist.create",
        task_text="What changed in markets this week?",
    )
    assert result == expected


def test_gate_reject_decision_for_local_intent_question() -> None:
    expected = {
        "decision": "reject",
        "env": "condura",
        "capability": None,
        "capability_id": "watchlist.create",
        "error_body": {"error": "requires_local_execution"},
    }
    with patch.object(
        watchlist_runner,
        "evaluate_capability_gate",
        return_value=expected,
    ):
        result = watchlist_runner._gate_watchlist_question("Open Linear and create a ticket")
    assert result["decision"] == "reject"
    assert result["env"] == "condura"
    assert result["error_body"]["error"] == "requires_local_execution"


def test_gate_fallback_decision_when_honesty_flag_off() -> None:
    # With CONDURA_HONEST_REJECTION_ENABLED off, the gate returns
    # 'fallback' (allow with warning) instead of 'reject'. The watchlist
    # runner must respect this and continue with the web pipeline.
    expected = {
        "decision": "fallback",
        "env": "condura",
        "capability": "watchlist.create",
        "capability_id": "watchlist.create",
        "error_body": None,
    }
    with patch.object(
        watchlist_runner,
        "evaluate_capability_gate",
        return_value=expected,
    ):
        result = watchlist_runner._gate_watchlist_question("Save a report to my disk")
    assert result["decision"] == "fallback"
    assert result["error_body"] is None


def test_gate_passes_empty_question_through_to_classifier() -> None:
    # The runner has its own empty-question skip logic AFTER the gate,
    # so the gate must always be invoked even for empty / whitespace
    # strings. The classifier sees the raw text and may produce its own
    # decision; the runner decides whether to act on it.
    expected = {
        "decision": "allow",
        "env": "web",
        "capability": "watchlist.create",
        "capability_id": "watchlist.create",
        "error_body": None,
    }
    with patch.object(
        watchlist_runner,
        "evaluate_capability_gate",
        return_value=expected,
    ) as gate:
        watchlist_runner._gate_watchlist_question("")
    gate.assert_called_once_with(capability_id="watchlist.create", task_text="")


def test_gate_uses_watchlist_create_capability_id_constant() -> None:
    # The capability_id string is the registry contract — the gate must
    # pass exactly 'watchlist.create' so the capability registry (which
    # has matching docs / examples / tests) resolves correctly.
    with patch.object(
        watchlist_runner,
        "evaluate_capability_gate",
        return_value={"decision": "allow", "env": "web", "capability": None, "capability_id": "watchlist.create", "error_body": None},
    ) as gate:
        watchlist_runner._gate_watchlist_question("anything")
    called_kwargs = gate.call_args.kwargs
    assert called_kwargs["capability_id"] == "watchlist.create"


def test_gate_forwards_task_text_verbatim_no_truncation() -> None:
    # Watchlist questions can be up to 2000 chars (the runner's own
    # gate). The gate must see the EXACT text — any silent truncation
    # would let classifiers mis-classify short vs long questions.
    long_question = "x" * 1500
    with patch.object(
        watchlist_runner,
        "evaluate_capability_gate",
        return_value={"decision": "allow", "env": "web", "capability": None, "capability_id": "watchlist.create", "error_body": None},
    ) as gate:
        watchlist_runner._gate_watchlist_question(long_question)
    assert gate.call_args.kwargs["task_text"] == long_question


def test_gate_result_keys_are_stable() -> None:
    # Lock the gate result shape so a future edit that renames a key
    # (e.g. capability → capability_descriptor) breaks loudly.
    with patch.object(
        watchlist_runner,
        "evaluate_capability_gate",
        return_value={
            "decision": "allow",
            "env": "web",
            "capability": "watchlist.create",
            "capability_id": "watchlist.create",
            "error_body": None,
        },
    ):
        result = watchlist_runner._gate_watchlist_question("hi")
    assert set(result.keys()) >= {
        "decision",
        "env",
        "capability",
        "capability_id",
        "error_body",
    }


@pytest.mark.asyncio
async def test_run_due_watchlist_skips_item_with_active_run(
    isolated_db, monkeypatch
):
    """A manual run-now already in flight must not be duplicated by the sweep."""
    from datetime import timedelta

    from arena.core.blackboard import AgentStatus, create_blackboard, remove_blackboard
    from arena.core.datetime_utils import utcnow_naive
    from arena.db_models import User, UserTier, WatchlistItem

    SessionLocal = isolated_db
    db = SessionLocal()
    try:
        user = User(
            email="wl-busy-sweep@test.com",
            password_hash="x",
            tier=UserTier.PRO,
            name="WL",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        now = utcnow_naive()
        item = WatchlistItem(
            user_id=user.id,
            question="Is the rupee stabilizing?",
            interval_hours=24,
            next_run_at=now - timedelta(minutes=1),
            is_active=True,
            expertise_level="curious",
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        item_id = item.id
        old_next = item.next_run_at
    finally:
        db.close()

    bb = create_blackboard(user_id=user.id, task="Is the rupee stabilizing?")
    bb.status = AgentStatus.RUNNING
    db = SessionLocal()
    try:
        row = db.query(WatchlistItem).filter(WatchlistItem.id == item_id).first()
        row.latest_task_id = bb.task_id
        db.commit()
    finally:
        db.close()

    started: list = []

    async def _fake_pipeline(*args, **kwargs):
        started.append(args)

    monkeypatch.setattr(
        "arena.routes.agent.run_agent_pipeline_background",
        _fake_pipeline,
    )

    try:
        await watchlist_runner.run_due_watchlist()

        assert started == []
        db = SessionLocal()
        try:
            row = db.query(WatchlistItem).filter(WatchlistItem.id == item_id).first()
            assert row is not None
            assert row.latest_task_id == bb.task_id
            assert row.next_run_at == old_next
            assert row.run_count == 0
        finally:
            db.close()
    finally:
        remove_blackboard(bb.task_id)
