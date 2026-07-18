"""Unit tests for arena.core.intelligence_scorer clamp + fallback paths."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from arena.core import intelligence_scorer as scorer


@pytest.mark.asyncio
async def test_fallback_when_llm_fails(monkeypatch):
    async def _boom(**kwargs):
        raise RuntimeError("down")

    monkeypatch.setattr(scorer, "call_llm", _boom)
    monkeypatch.setitem(
        scorer.MODEL_REGISTRY,
        "deepseek_v3",
        {"client": object(), "provider": "deepseek", "model_id": "x"},
    )
    out = await scorer.calculate_intelligence_score("task", "answer body")
    assert out["total_score"] == 60
    assert out["score_label"] == "Solid"
    assert "could not be calculated" in out["one_line_verdict"].lower()


@pytest.mark.asyncio
async def test_clamps_dimension_scores_and_recomputes_total(monkeypatch):
    async def _ok(**kwargs):
        body = (
            '{"research_depth": {"score": 99, "label": "x", "reason": "r"}, '
            '"logical_soundness": {"score": -5, "label": "x", "reason": "r"}, '
            '"consensus_level": {"score": 20, "label": "x", "reason": "r"}, '
            '"answer_durability": {"score": 10, "label": "x", "reason": "r"}, '
            '"total_score": 0, "score_label": "Weak", '
            '"one_line_verdict": "v"}'
        )
        return (body, 3, 4)

    monkeypatch.setattr(scorer, "call_llm", _ok)
    monkeypatch.setitem(
        scorer.MODEL_REGISTRY,
        "deepseek_v3",
        {"client": object(), "provider": "deepseek", "model_id": "x"},
    )
    bb = SimpleNamespace(total_input_tokens=0, total_output_tokens=0)
    out = await scorer.calculate_intelligence_score(
        "task", "plain answer", research_output="r", judgment_output="j", bb=bb
    )
    assert out["research_depth"]["score"] == 25
    assert out["logical_soundness"]["score"] == 0
    # 25 + 0 + 20 + 10 = 55 → Mixed
    assert out["total_score"] == 55
    assert out["score_label"] == "Mixed"
    assert bb.total_input_tokens == 3
    assert bb.total_output_tokens == 4


@pytest.mark.asyncio
async def test_unwraps_sentence_json_answer(monkeypatch):
    seen = {}

    async def _capture(**kwargs):
        seen["user_prompt"] = kwargs["user_prompt"]
        raise RuntimeError("stop after prompt build")

    monkeypatch.setattr(scorer, "call_llm", _capture)
    monkeypatch.setitem(
        scorer.MODEL_REGISTRY,
        "deepseek_v3",
        {"client": object(), "provider": "deepseek", "model_id": "x"},
    )
    answer = json_dumps_sentences()
    out = await scorer.calculate_intelligence_score("q", answer)
    assert "First claim." in seen["user_prompt"]
    assert "Second claim." in seen["user_prompt"]
    assert out["total_score"] == 60


def json_dumps_sentences() -> str:
    import json

    return json.dumps(
        {
            "sentences": [
                {"text": "First claim."},
                {"text": "Second claim."},
            ]
        }
    )
