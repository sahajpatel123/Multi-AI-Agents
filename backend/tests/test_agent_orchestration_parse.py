"""Unit tests for arena.core.agent_orchestration pure parse helpers."""

from __future__ import annotations

from types import SimpleNamespace

from arena.core.agent_orchestration import (
    _parse_synthesis_json,
    _plain_answer_snippet,
    _strip_json_fence,
)


def test_strip_json_fence():
    raw = '```json\n{"synthesis": "x", "bullets": [], "conflicts": []}\n```'
    assert _strip_json_fence(raw).startswith("{")


def test_parse_synthesis_json_happy_path():
    raw = (
        '{"synthesis": " Unified view. ", "bullets": ["a", "  ", 3], '
        '"conflicts": [{"task_a": 1, "task_b": 2, "conflict": "tension"}, "skip"]}'
    )
    out = _parse_synthesis_json(raw)
    assert out["synthesis"] == "Unified view."
    assert out["bullets"] == ["a", "3"]
    assert out["conflicts"] == [
        {"task_a": 1, "task_b": 2, "conflict": "tension"}
    ]


def test_parse_synthesis_json_recovers_from_prose():
    raw = 'Here is the report:\n{"synthesis": "ok", "bullets": ["b1"], "conflicts": []}\nThanks'
    out = _parse_synthesis_json(raw)
    assert out["synthesis"] == "ok"
    assert out["bullets"] == ["b1"]


def test_parse_synthesis_json_garbage():
    assert _parse_synthesis_json("not json") == {
        "synthesis": "",
        "bullets": [],
        "conflicts": [],
    }
    assert _parse_synthesis_json("[]") == {
        "synthesis": "",
        "bullets": [],
        "conflicts": [],
    }


def test_plain_answer_snippet_plain_and_json_sentences():
    plain = SimpleNamespace(final_answer="Short answer.")
    assert _plain_answer_snippet(plain) == "Short answer."

    long = SimpleNamespace(final_answer="x" * 450)
    snip = _plain_answer_snippet(long, max_len=400)
    assert snip.endswith("…")
    assert len(snip) == 401

    import json

    structured = SimpleNamespace(
        final_answer=json.dumps(
            {
                "sentences": [
                    {"text": "First."},
                    {"text": "Second."},
                ]
            }
        )
    )
    assert _plain_answer_snippet(structured) == "First. Second."


def test_plain_answer_snippet_empty():
    assert _plain_answer_snippet(SimpleNamespace(final_answer=None)) == ""
    assert _plain_answer_snippet(SimpleNamespace(final_answer="   ")) == ""
