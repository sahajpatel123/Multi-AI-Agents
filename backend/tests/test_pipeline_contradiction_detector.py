"""Unit tests for arena.core.pipeline_contradiction_detector normalize path."""

from __future__ import annotations

from arena.core.pipeline_contradiction_detector import (
    _normalize_contradictions,
    _strip_json_fence,
)


def test_strip_json_fence():
    raw = "```\n[{\"claim_new\": \"a\", \"claim_old\": \"b\"}]\n```"
    assert _strip_json_fence(raw).startswith("[")


def test_normalize_filters_unknown_task_ids_and_bad_items():
    raw = (
        '[{"claim_new": "new A", "claim_old": "old A", "task_id_old": "t1", '
        '"task_title": "T1", "severity": "DIRECT", "resolution_hint": "r1"}, '
        '{"claim_new": "new B", "claim_old": "old B", "task_id_old": "unknown", '
        '"task_title": "X", "severity": "direct", "resolution_hint": "r2"}, '
        '{"claim_new": "", "claim_old": "old C", "task_id_old": "t1"}, '
        '"skip-me"]'
    )
    out = _normalize_contradictions(raw, past_ids={"t1"})
    assert len(out) == 1
    assert out[0]["task_id_old"] == "t1"
    assert out[0]["severity"] == "direct"
    assert out[0]["claim_new"] == "new A"


def test_normalize_defaults_severity_and_allows_empty_past_ids():
    raw = (
        '[{"claim_new": "n", "claim_old": "o", "task_id_old": "any", '
        '"severity": "weird", "task_title": "t", "resolution_hint": "h"}]'
    )
    out = _normalize_contradictions(raw, past_ids=set())
    assert len(out) == 1
    assert out[0]["severity"] == "nuanced"


def test_normalize_recovers_array_from_prose():
    raw = 'Findings:\n[{"claim_new": "a", "claim_old": "b", "task_id_old": "t1", "severity": "nuanced"}]\n'
    out = _normalize_contradictions(raw, past_ids={"t1"})
    assert len(out) == 1
    assert out[0]["claim_old"] == "b"


def test_normalize_garbage_returns_empty():
    assert _normalize_contradictions("nope", past_ids={"t1"}) == []
    assert _normalize_contradictions("{}", past_ids={"t1"}) == []
