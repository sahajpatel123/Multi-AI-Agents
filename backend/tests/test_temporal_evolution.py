"""Tests for temporal evolution analysis."""

from arena.core.temporal_evolution import analyze_temporal_evolution, extract_answer_snippet


def test_extract_answer_snippet_from_json_one_liner():
    raw = '{"one_liner": "Stress-test the runway first.", "text": "longer"}'
    assert extract_answer_snippet(raw) == "Stress-test the runway first."


def test_analyze_temporal_evolution_detects_shift():
    result = analyze_temporal_evolution(
        [
            {
                "task_id": "1",
                "one_liner": "Markets will crash due to leverage risk",
                "created_at": "2026-01-01T00:00:00",
            },
            {
                "task_id": "2",
                "one_liner": "Markets remain resilient despite leverage fears",
                "created_at": "2026-02-01T00:00:00",
            },
        ]
    )
    assert result["evolution_score"] >= 30
    assert result["trend_label"] in {"evolving", "moderate shift", "stable", "converging"}
    assert result["related_count"] == 2
    assert len(result["key_shifts"]) >= 1
    assert len(result["timeline"]) == 2
    assert result["timeline"][0]["task_id"] == "1"
    assert "crash" in result["timeline"][0]["snippet"].lower() or "leverage" in result["timeline"][0]["snippet"].lower()


def test_analyze_temporal_evolution_insufficient():
    result = analyze_temporal_evolution([{"task_id": "1", "one_liner": "alone", "created_at": "2026-01-01"}])
    assert result["trend_label"] == "insufficient"
    assert result["evolution_score"] == 0
    assert len(result["timeline"]) == 1
