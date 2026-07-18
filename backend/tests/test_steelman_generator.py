"""Unit tests for arena.core.steelman_generator parse + fallback paths."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from arena.core import steelman_generator as sm


@pytest.mark.asyncio
async def test_empty_steelman_on_llm_failure(monkeypatch):
    async def _boom(**kwargs):
        raise RuntimeError("down")

    monkeypatch.setattr(sm, "call_llm", _boom)
    monkeypatch.setitem(
        sm.MODEL_REGISTRY,
        "claude_sonnet",
        {"client": object(), "provider": "claude", "model_id": "claude"},
    )
    out = await sm.generate_steelman("question?", "research")
    assert out == sm._empty_steelman()


@pytest.mark.asyncio
async def test_parses_json_and_caps_arguments(monkeypatch):
    async def _ok(**kwargs):
        body = (
            'Here:\n{"opposing_position": "Markets stay tight.", '
            '"key_arguments": ["a1", "a2", "a3", "a4", 12, ""], '
            '"strongest_evidence": "Fed speak.", "concession": "Liquidity matters."}\n'
        )
        return (body, 4, 5)

    # wait_for just awaits the coroutine — patch call_llm underneath.
    monkeypatch.setattr(sm, "call_llm", _ok)
    monkeypatch.setitem(
        sm.MODEL_REGISTRY,
        "claude_sonnet",
        {"client": object(), "provider": "claude", "model_id": "claude"},
    )
    bb = SimpleNamespace(total_input_tokens=1, total_output_tokens=1)
    out = await sm.generate_steelman("q", "research", expertise_modifier="Be sharp", bb=bb)
    assert out["opposing_position"] == "Markets stay tight."
    assert out["key_arguments"] == ["a1", "a2", "a3"]
    assert out["strongest_evidence"] == "Fed speak."
    assert out["concession"] == "Liquidity matters."
    assert bb.total_input_tokens == 5
    assert bb.total_output_tokens == 6


@pytest.mark.asyncio
async def test_invalid_json_returns_empty(monkeypatch):
    async def _bad(**kwargs):
        return ("{not-json", 1, 1)

    monkeypatch.setattr(sm, "call_llm", _bad)
    monkeypatch.setitem(
        sm.MODEL_REGISTRY,
        "claude_sonnet",
        {"client": object(), "provider": "claude", "model_id": "claude"},
    )
    out = await sm.generate_steelman("q", "r")
    assert out["opposing_position"] == ""
    assert out["key_arguments"] == []
