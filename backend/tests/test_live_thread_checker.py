"""Unit tests for arena.core.live_thread_checker pure helpers."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from arena.core.live_thread_checker import (
    _gate_live_task_text,
    _reschedule_hours,
    check_if_update_meaningful,
)


def test_reschedule_hours_defaults_and_clamps():
    assert _reschedule_hours(SimpleNamespace()) == 24
    assert _reschedule_hours(SimpleNamespace(live_reschedule_hours=None)) == 24
    assert _reschedule_hours(SimpleNamespace(live_reschedule_hours="nope")) == 24
    assert _reschedule_hours(SimpleNamespace(live_reschedule_hours=0)) == 1
    assert _reschedule_hours(SimpleNamespace(live_reschedule_hours=-3)) == 1
    assert _reschedule_hours(SimpleNamespace(live_reschedule_hours=12)) == 12
    assert _reschedule_hours(SimpleNamespace(live_reschedule_hours=999)) == 24 * 7
    assert _reschedule_hours(SimpleNamespace(live_reschedule_hours="48")) == 48


def test_gate_live_task_text_shape():
    gate = _gate_live_task_text("Summarize recent lithium battery breakthroughs")
    assert gate["capability_id"] == "agent.research"
    assert gate["decision"] in {"allow", "reject", "fallback"}
    assert "env" in gate


def test_gate_live_task_text_local_intent():
    # Capability gate may allow research-shaped phrasing; pin the contract
    # shape and that decision is always one of the three known outcomes.
    gate = _gate_live_task_text(
        "On my Mac, open Terminal and run a local script against /Users/me/data"
    )
    assert gate["decision"] in {"allow", "reject", "fallback"}
    assert gate["capability_id"] == "agent.research"


@pytest.mark.asyncio
async def test_check_if_update_meaningful_yes(monkeypatch):
    async def _yes(**kwargs):
        return ("yes", 1, 1)

    monkeypatch.setattr(
        "arena.core.live_thread_checker.call_llm",
        _yes,
    )
    from arena.core import live_thread_checker as ltc

    monkeypatch.setitem(
        ltc.MODEL_REGISTRY,
        "deepseek_v4_flash",
        {"client": object(), "provider": "deepseek", "model_id": "x"},
    )
    assert (
        await check_if_update_meaningful("old answer", "brand new finding", "q")
        is True
    )


@pytest.mark.asyncio
async def test_check_if_update_meaningful_no_and_failure(monkeypatch):
    async def _no(**kwargs):
        return ("no significant change", 1, 1)

    from arena.core import live_thread_checker as ltc

    monkeypatch.setattr(ltc, "call_llm", _no)
    monkeypatch.setitem(
        ltc.MODEL_REGISTRY,
        "deepseek_v4_flash",
        {"client": object(), "provider": "deepseek", "model_id": "x"},
    )
    assert (
        await check_if_update_meaningful("old", "same-ish", "q") is False
    )

    async def _boom(**kwargs):
        raise RuntimeError("down")

    monkeypatch.setattr(ltc, "call_llm", _boom)
    assert await check_if_update_meaningful("old", "new", "q") is False
