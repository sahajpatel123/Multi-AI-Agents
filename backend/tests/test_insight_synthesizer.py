"""Unit tests for arena.core.insight_synthesizer pure parse + gates."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from arena.core import insight_synthesizer as ins


def test_strip_json_fence_removes_markdown_wrapper():
    raw = "```json\n{\"patterns\": [\"a\"], \"evolution\": \"e\", \"blind_spots\": [], \"synthesis\": \"s\"}\n```"
    assert ins._strip_json_fence(raw).startswith("{")


def test_parse_insight_report_happy_path():
    raw = (
        '{"patterns": ["p1", "  ", 3], "evolution": " evolved ", '
        '"blind_spots": ["b1"], "synthesis": "done"}'
    )
    out = ins._parse_insight_report(raw)
    assert out is not None
    assert out["patterns"] == ["p1", "3"]
    assert out["evolution"] == "evolved"
    assert out["blind_spots"] == ["b1"]
    assert out["synthesis"] == "done"


def test_parse_insight_report_recovers_from_prose_wrapper():
    raw = 'Sure.\n{"patterns": ["x"], "evolution": "y", "blind_spots": [], "synthesis": "z"}\nThanks'
    out = ins._parse_insight_report(raw)
    assert out is not None
    assert out["patterns"] == ["x"]


def test_parse_insight_report_rejects_garbage():
    assert ins._parse_insight_report("not json") is None
    assert ins._parse_insight_report("[]") is None


@pytest.mark.asyncio
async def test_synthesize_requires_at_least_three_tasks():
    assert await ins.synthesize_insights([], "q") is None
    assert await ins.synthesize_insights([{"question": "a"}], "q") is None
    assert (
        await ins.synthesize_insights(
            [{"question": "a"}, {"question": "b"}], "q"
        )
        is None
    )


@pytest.mark.asyncio
async def test_synthesize_returns_parsed_report(monkeypatch):
    async def _ok(**kwargs):
        body = (
            '{"patterns": ["recurring pricing"], "evolution": "deeper", '
            '"blind_spots": ["regs"], "synthesis": "focus on compliance"}'
        )
        return (body, 2, 3)

    monkeypatch.setattr(ins, "call_llm", _ok)
    monkeypatch.setitem(
        ins.MODEL_REGISTRY,
        "deepseek_v4_flash",
        {"client": object(), "provider": "deepseek", "model_id": "x"},
    )
    bb = SimpleNamespace(total_input_tokens=0, total_output_tokens=0)
    tasks = [
        {"question": "q1", "final_answer": "a1"},
        {"question": "q2", "final_answer": "a2"},
        {"question": "q3", "final_answer": "a3"},
    ]
    out = await ins.synthesize_insights(tasks, "current?", bb=bb)
    assert out is not None
    assert out["patterns"] == ["recurring pricing"]
    assert bb.total_input_tokens == 2
    assert bb.total_output_tokens == 3


@pytest.mark.asyncio
async def test_synthesize_returns_none_on_llm_failure(monkeypatch):
    async def _boom(**kwargs):
        raise RuntimeError("down")

    monkeypatch.setattr(ins, "call_llm", _boom)
    monkeypatch.setitem(
        ins.MODEL_REGISTRY,
        "deepseek_v4_flash",
        {"client": object(), "provider": "deepseek", "model_id": "x"},
    )
    tasks = [{"question": f"q{i}"} for i in range(3)]
    assert await ins.synthesize_insights(tasks, "now") is None
