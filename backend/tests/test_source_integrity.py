"""Unit tests for arena.core.source_integrity fallback paths."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from arena.core import source_integrity as si


@pytest.mark.asyncio
async def test_empty_research_returns_fallback():
    out = await si.analyze_source_integrity("", "task")
    assert out["source_count"] == 0
    assert out["claims"] == []
    assert out["integrity_label"] == "uncertain"
    assert "No research" in out["summary"]


@pytest.mark.asyncio
async def test_whitespace_research_returns_fallback():
    out = await si.analyze_source_integrity("   \n\t  ", "task")
    assert out["source_count"] == 0
    assert out["overall_source_integrity"] == 60


@pytest.mark.asyncio
async def test_parses_llm_json_and_tracks_tokens(monkeypatch):
    async def _ok(**kwargs):
        payload = (
            '{"source_count": 2, "claims": [{"claim": "c", "sources_confirming": 2, '
            '"sources_contradicting": 0, "sources_neutral": 0, "agreement_confidence": 92, '
            '"status": "confirmed"}], "contradictions": [], "overall_source_integrity": 90, '
            '"integrity_label": "high", "summary": "solid"}'
        )
        return (payload, 5, 7)

    monkeypatch.setattr(si, "call_llm", _ok)
    monkeypatch.setitem(
        si.MODEL_REGISTRY,
        "deepseek_v3",
        {"client": object(), "provider": "deepseek", "model_id": "deepseek"},
    )
    bb = SimpleNamespace(total_input_tokens=1, total_output_tokens=2)
    out = await si.analyze_source_integrity("source A says X. source B says X.", "task", bb=bb)
    assert out["overall_source_integrity"] == 90
    assert out["integrity_label"] == "high"
    assert bb.total_input_tokens == 6
    assert bb.total_output_tokens == 9


@pytest.mark.asyncio
async def test_llm_failure_returns_unavailable_fallback(monkeypatch):
    async def _boom(**kwargs):
        raise RuntimeError("down")

    monkeypatch.setattr(si, "call_llm", _boom)
    monkeypatch.setitem(
        si.MODEL_REGISTRY,
        "deepseek_v3",
        {"client": object(), "provider": "deepseek", "model_id": "deepseek"},
    )
    out = await si.analyze_source_integrity("some research text", "task")
    assert out["summary"] == "Source analysis unavailable"
    assert out["claims"] == []
