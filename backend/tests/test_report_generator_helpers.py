"""Unit tests for pure helpers in arena.core.report_generator."""

from __future__ import annotations

import json
from types import SimpleNamespace

from arena.core.report_generator import (
    _insight_dict,
    _intel_dict,
    _json_val,
    _sentences_from_answer,
    _sources_list,
)


def test_json_val_parses_and_passthrough():
    assert _json_val(None) is None
    assert _json_val({"a": 1}) == {"a": 1}
    assert _json_val([1, 2]) == [1, 2]
    assert _json_val('{"k": "v"}') == {"k": "v"}
    assert _json_val("not-json") is None
    assert _json_val("   ") is None


def test_sources_list_from_dicts_and_strings():
    row = SimpleNamespace(
        sources_used=json.dumps(
            [
                {"title": "Paper A", "url": "https://a"},
                {"url": "https://b-only"},
                "plain source",
            ]
        )
    )
    out = _sources_list(row)
    assert out[0]["title"] == "Paper A"
    assert out[1]["title"] == "https://b-only"
    assert out[2]["title"] == "plain source"


def test_sources_list_invalid_becomes_empty():
    assert _sources_list(SimpleNamespace(sources_used=None)) == []
    assert _sources_list(SimpleNamespace(sources_used="nope")) == []
    assert _sources_list(SimpleNamespace(sources_used='{"not":"list"}')) == []


def test_intel_and_insight_dicts():
    row = SimpleNamespace(
        intelligence_score='{"total_score": 80}',
        insight_report={"synthesis": "s"},
    )
    assert _intel_dict(row)["total_score"] == 80
    assert _insight_dict(row)["synthesis"] == "s"
    empty = SimpleNamespace(intelligence_score=None, insight_report="x")
    assert _intel_dict(empty) == {}
    assert _insight_dict(empty) == {}


def test_sentences_from_answer():
    plain = "Just text"
    assert _sentences_from_answer(plain) == []
    structured = json.dumps(
        {
            "sentences": [
                {"text": "A"},
                "skip",
                {"text": "B"},
            ]
        }
    )
    sents = _sentences_from_answer(structured)
    assert sents == [{"text": "A"}, {"text": "B"}]
