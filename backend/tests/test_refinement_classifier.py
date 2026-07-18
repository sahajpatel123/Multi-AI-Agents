"""Unit tests for arena.core.refinement_classifier fallback + parse paths."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from arena.core import refinement_classifier as rc


@pytest.mark.asyncio
async def test_classify_refinement_parses_json_blob(monkeypatch):
    async def _fake_call_llm(**kwargs):
        return (
            'Sure.\n{"type": "challenge", "focus": "claim X", '
            '"instruction": "attack claim X", "stages_needed": ["critic", "synthesizer"]}\n',
            10,
            20,
        )

    monkeypatch.setattr(rc, "call_llm", _fake_call_llm)
    monkeypatch.setitem(
        rc.MODEL_REGISTRY,
        "gpt_4o_mini",
        {"client": object(), "provider": "openai", "model_id": "gpt-4o-mini"},
    )

    bb = SimpleNamespace(total_input_tokens=0, total_output_tokens=0)
    out = await rc.classify_refinement("challenge that", "answer body", bb=bb)
    assert out["type"] == "challenge"
    assert out["stages_needed"] == ["critic", "synthesizer"]
    assert bb.total_input_tokens == 10
    assert bb.total_output_tokens == 20


@pytest.mark.asyncio
async def test_classify_refinement_falls_back_on_llm_failure(monkeypatch):
    async def _boom(**kwargs):
        raise RuntimeError("llm down")

    monkeypatch.setattr(rc, "call_llm", _boom)
    monkeypatch.setitem(
        rc.MODEL_REGISTRY,
        "gpt_4o_mini",
        {"client": object(), "provider": "openai", "model_id": "gpt-4o-mini"},
    )

    out = await rc.classify_refinement("dig deeper on costs", "prior answer")
    assert out["type"] == "followup"
    assert out["focus"] == "dig deeper on costs"
    assert out["stages_needed"] == ["solver", "synthesizer"]


@pytest.mark.asyncio
async def test_classify_refinement_falls_back_when_no_json(monkeypatch):
    async def _plain(**kwargs):
        return ("no json here", 1, 1)

    monkeypatch.setattr(rc, "call_llm", _plain)
    monkeypatch.setitem(
        rc.MODEL_REGISTRY,
        "gpt_4o_mini",
        {"client": object(), "provider": "openai", "model_id": "gpt-4o-mini"},
    )

    out = await rc.classify_refinement("rewrite shorter", "answer")
    assert out["type"] == "followup"
    assert "rewrite shorter" in out["instruction"]
