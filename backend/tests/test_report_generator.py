"""Tests for the report-generator pure helpers.

report_generator converts AgentTask rows into HTML / PDF reports. The
complex HTML shell + layout paths are integration-tested; here we pin
the pure JSON-parsing + extraction helpers. Drift here means either:
  - sources / intelligence / insight fields fail to parse and silently
    render empty (the report "looks complete" but missing data)
  - malformed rows produce KeyError instead of empty defaults
"""
from __future__ import annotations

from typing import Any

import pytest

from arena.core.report_generator import (
    _insight_dict,
    _intel_dict,
    _json_val,
    _sentences_from_answer,
    _sources_list,
)


def _task(**kwargs: Any) -> Any:
    """Build an AgentTask-shaped object with the kwargs as attributes."""
    obj = type("AgentTask", (), {})()
    for k, v in kwargs.items():
        setattr(obj, k, v)
    return obj


# ── _json_val ─────────────────────────────────────────────────────


def test_json_val_returns_none_for_none() -> None:
    assert _json_val(None) is None


def test_json_val_passes_through_list() -> None:
    assert _json_val([1, 2, 3]) == [1, 2, 3]


def test_json_val_passes_through_dict() -> None:
    d = {"a": 1}
    assert _json_val(d) is d


def test_json_val_parses_valid_json_string() -> None:
    assert _json_val('{"a": 1}') == {"a": 1}


def test_json_val_parses_valid_json_list_string() -> None:
    assert _json_val("[1, 2, 3]") == [1, 2, 3]


def test_json_val_returns_none_for_invalid_json_string() -> None:
    # Malformed JSON must NOT raise — it must fall through to None so
    # callers can render an empty placeholder.
    assert _json_val("{not json") is None
    assert _json_val("just a string") is None


def test_json_val_returns_none_for_empty_or_whitespace_string() -> None:
    # Empty strings can't be valid JSON; fall through to None.
    assert _json_val("") is None
    assert _json_val("   ") is None


def test_json_val_returns_none_for_non_string_non_list_non_dict() -> None:
    assert _json_val(42) is None
    assert _json_val(3.14) is None
    assert _json_val(True) is None


# ── _sources_list ────────────────────────────────────────────────


def test_sources_list_returns_empty_when_sources_used_is_none() -> None:
    assert _sources_list(_task(sources_used=None)) == []


def test_sources_list_returns_empty_for_non_list_value() -> None:
    assert _sources_list(_task(sources_used='{"a": 1}')) == []


def test_sources_list_extracts_titles_from_dicts() -> None:
    sources = [
        {"title": "First source", "url": "https://a.com"},
        {"title": "Second source", "url": "https://b.com"},
    ]
    import json as _json
    result = _sources_list(_task(sources_used=_json.dumps(sources)))
    assert result == [{"title": "First source"}, {"title": "Second source"}]


def test_sources_list_falls_back_to_url_when_no_title() -> None:
    sources = [{"url": "https://example.com"}, {"name": "third"}]
    import json as _json
    result = _sources_list(_task(sources_used=_json.dumps(sources)))
    assert result == [{"title": "https://example.com"}, {"title": "third"}]


def test_sources_list_handles_string_entries() -> None:
    # Source entries that aren't dicts get stringified.
    import json as _json
    result = _sources_list(_task(sources_used=_json.dumps(["raw string", 42])))
    assert result == [{"title": "raw string"}, {"title": "42"}]


def test_sources_list_silently_drops_invalid_payload() -> None:
    # Invalid JSON in sources_used → empty list (not an exception).
    assert _sources_list(_task(sources_used="{not json")) == []


# ── _intel_dict / _insight_dict ─────────────────────────────────


def test_intel_dict_returns_dict_for_valid_json() -> None:
    import json as _json
    raw = _json.dumps({"score": 0.91, "axes": {"reasoning": 0.9}})
    assert _intel_dict(_task(intelligence_score=raw)) == {
        "score": 0.91,
        "axes": {"reasoning": 0.9},
    }


def test_intel_dict_returns_empty_dict_for_none() -> None:
    assert _intel_dict(_task(intelligence_score=None)) == {}


def test_intel_dict_returns_empty_dict_for_invalid_json() -> None:
    assert _intel_dict(_task(intelligence_score="{not json")) == {}


def test_intel_dict_returns_empty_dict_for_non_dict_json() -> None:
    # A JSON list is valid JSON but not a dict — must fall through to {}
    # so the report's intelligence section renders empty rather than
    # crashing the iteration.
    import json as _json
    assert _intel_dict(_task(intelligence_score=_json.dumps([1, 2, 3]))) == {}


def test_insight_dict_returns_dict_for_valid_json() -> None:
    import json as _json
    raw = _json.dumps({"summary": "X", "bullets": ["a", "b"]})
    assert _insight_dict(_task(insight_report=raw)) == {
        "summary": "X",
        "bullets": ["a", "b"],
    }


def test_insight_dict_returns_empty_dict_for_none() -> None:
    assert _insight_dict(_task(insight_report=None)) == {}


def test_insight_dict_returns_empty_dict_for_non_dict_json() -> None:
    import json as _json
    assert _insight_dict(_task(insight_report=_json.dumps([1, 2, 3]))) == {}


# ── _sentences_from_answer ──────────────────────────────────────


def test_sentences_from_answer_returns_empty_for_none() -> None:
    assert _sentences_from_answer("") == []


def test_sentences_from_answer_returns_empty_for_whitespace() -> None:
    assert _sentences_from_answer("   \n\t  ") == []


def test_sentences_from_answer_extracts_sentences_from_json() -> None:
    import json as _json
    raw = _json.dumps({
        "sentences": [
            {"text": "First.", "citations": ["a.com"]},
            {"text": "Second."},
        ]
    })
    out = _sentences_from_answer(raw)
    assert len(out) == 2
    assert out[0] == {"text": "First.", "citations": ["a.com"]}
    assert out[1] == {"text": "Second."}


def test_sentences_from_answer_returns_empty_for_invalid_json() -> None:
    # If final_answer is not JSON, return [] rather than raise.
    assert _sentences_from_answer("not json") == []


def test_sentences_from_answer_filters_non_dict_entries() -> None:
    # Only dict entries are kept (the consumer assumes dict shape).
    import json as _json
    raw = _json.dumps({"sentences": [{"text": "ok"}, "not a dict", 42, None]})
    out = _sentences_from_answer(raw)
    assert out == [{"text": "ok"}]


def test_sentences_from_answer_returns_empty_when_sentences_missing() -> None:
    import json as _json
    # Valid JSON object but no 'sentences' key → empty list (not crash).
    assert _sentences_from_answer(_json.dumps({"other": "key"})) == []


def test_sentences_from_answer_returns_empty_when_sentences_not_a_list() -> None:
    import json as _json
    # JSON object with sentences as a string (malformed shape) → empty list
    assert _sentences_from_answer(_json.dumps({"sentences": "not a list"})) == []
