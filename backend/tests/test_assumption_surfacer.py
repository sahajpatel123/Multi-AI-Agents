"""Unit tests for arena.core.assumption_surfacer parse + fallback paths."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from arena.core import assumption_surfacer as surf


@pytest.mark.asyncio
async def test_fallback_when_llm_fails(monkeypatch):
    async def _boom(**kwargs):
        raise RuntimeError("down")

    monkeypatch.setattr(surf, "call_llm", _boom)
    monkeypatch.setitem(
        surf.MODEL_REGISTRY,
        "gpt_4o",
        {"client": object(), "provider": "openai", "model_id": "gpt-4o"},
    )
    out = await surf.surface_assumptions("task", "answer text")
    assert out["assumption_count"] == 1
    assert out["assumptions"][0]["flag"] is True
    assert out["most_critical"] == 0


@pytest.mark.asyncio
async def test_caps_flagged_assumptions_at_three(monkeypatch):
    async def _ok(**kwargs):
        body = (
            '{"assumptions": ['
            '{"assumption": "a1", "category": "context", "criticality": "high", '
            '"if_wrong": "x", "flag": true},'
            '{"assumption": "a2", "category": "domain", "criticality": "medium", '
            '"if_wrong": "x", "flag": true},'
            '{"assumption": "a3", "category": "timeframe", "criticality": "low", '
            '"if_wrong": "x", "flag": true},'
            '{"assumption": "a4", "category": "audience", "criticality": "low", '
            '"if_wrong": "x", "flag": true}'
            '], "most_critical": 0, "summary": "s"}'
        )
        return (body, 2, 3)

    monkeypatch.setattr(surf, "call_llm", _ok)
    monkeypatch.setitem(
        surf.MODEL_REGISTRY,
        "gpt_4o",
        {"client": object(), "provider": "openai", "model_id": "gpt-4o"},
    )
    bb = SimpleNamespace(total_input_tokens=0, total_output_tokens=0)
    out = await surf.surface_assumptions("task", "answer", bb=bb)
    flags = [a["flag"] for a in out["assumptions"]]
    assert flags == [True, True, True, False]
    assert out["assumption_count"] == 4
    assert bb.total_input_tokens == 2
    assert bb.total_output_tokens == 3


@pytest.mark.asyncio
async def test_unwraps_sentence_json_answer(monkeypatch):
    seen = {}

    async def _capture(**kwargs):
        seen["prompt"] = kwargs["user_prompt"]
        raise RuntimeError("stop")

    monkeypatch.setattr(surf, "call_llm", _capture)
    monkeypatch.setitem(
        surf.MODEL_REGISTRY,
        "gpt_4o",
        {"client": object(), "provider": "openai", "model_id": "gpt-4o"},
    )
    import json

    answer = json.dumps({"sentences": [{"text": "Hidden claim A."}, {"text": "Claim B."}]})
    out = await surf.surface_assumptions("q", answer)
    assert "Hidden claim A." in seen["prompt"]
    assert out["assumption_count"] == 1
