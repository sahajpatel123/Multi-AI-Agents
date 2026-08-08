"""Tests for the intelligence_score key allowlist in to_dict.

Blackboard.to_dict() historically returned the full
intelligence_score dict verbatim. A user-injected value
(e.g. via a corrupted pipeline or a maliciously-modified
row in the DB) could include arbitrary keys. The to_dict()
call returns this dict verbatim, so the injection would
be emitted in every GET /tasks/{id}/detail response.

Fix: cap intelligence_score to the 7 known keys produced
by calculate_intelligence_score. Any other key is dropped
at the to_dict() boundary.

Tests pin:
- A dict with only the 7 known keys is unchanged
- A dict with 1 unknown key drops that key
- A dict with 100 unknown keys drops all of them
- A non-dict returns {} (defensive)
- The to_dict() call applies the cap
- A nested dict (e.g. {"research_depth": {"score": 15}})
  is preserved (the cap is on top-level keys, not nested)
- The cap is the same 7 keys used by
  calculate_intelligence_score
"""

from __future__ import annotations

from arena.core.blackboard import (
    Blackboard,
    _filter_intelligence_score_keys,
    _INTELLIGENCE_SCORE_KEYS,
)


# --- the helper directly ---


def test_all_7_known_keys_preserved() -> None:
    value = {
        "research_depth": {"score": 15, "label": "Moderate", "reason": "x"},
        "logical_soundness": {"score": 15, "label": "Sound", "reason": "x"},
        "consensus_level": {"score": 15, "label": "Debated", "reason": "x"},
        "answer_durability": {"score": 15, "label": "Stable", "reason": "x"},
        "total_score": 60,
        "score_label": "Solid",
        "one_line_verdict": "Score could not be calculated.",
    }
    result = _filter_intelligence_score_keys(value)
    assert set(result.keys()) == set(_INTELLIGENCE_SCORE_KEYS)


def test_unknown_key_dropped() -> None:
    """A dict with 1 unknown key drops that key (the
    injection case)."""
    value = {
        "total_score": 60,
        "score_label": "Solid",
        "malicious_key": "<script>alert(1)</script>",
    }
    result = _filter_intelligence_score_keys(value)
    assert "malicious_key" not in result
    assert "total_score" in result
    assert "score_label" in result


def test_100_unknown_keys_dropped() -> None:
    """A dict with 100 unknown keys drops all of them."""
    value = {f"key{i}": f"value{i}" for i in range(100)}
    value["total_score"] = 60  # one known key
    result = _filter_intelligence_score_keys(value)
    assert len(result) == 1
    assert "total_score" in result


def test_non_dict_returns_empty() -> None:
    """A non-dict returns {} (defensive: the JSON column
    could be null or a string)."""
    for bad in [None, "string", 42, []]:
        assert _filter_intelligence_score_keys(bad) == {}


def test_nested_dict_preserved() -> None:
    """A nested dict (e.g. {"research_depth": {"score": 15}})
    is preserved — the cap is on top-level keys, not nested
    fields. The known sub-keys (score/label/reason) are not
    filtered."""
    value = {
        "research_depth": {"score": 15, "label": "Moderate", "reason": "x"},
    }
    result = _filter_intelligence_score_keys(value)
    assert result == {"research_depth": {"score": 15, "label": "Moderate", "reason": "x"}}


def test_allowlist_has_seven_keys() -> None:
    """The allowlist is the 7 known keys produced by
    calculate_intelligence_score."""
    assert len(_INTELLIGENCE_SCORE_KEYS) == 7
    assert _INTELLIGENCE_SCORE_KEYS == frozenset({
        "research_depth", "logical_soundness", "consensus_level",
        "answer_durability", "total_score", "score_label",
        "one_line_verdict",
    })


# --- integration: to_dict applies the cap ---


def test_to_dict_applies_intelligence_score_cap() -> None:
    """Integration: Blackboard.to_dict() applies the cap, so
    a Blackboard with a maliciously-injected intelligence_score
    returns only the known keys in the to_dict() output.
    """
    bb = Blackboard(task_id="t", user_id=1)
    bb.intelligence_score = {
        "total_score": 80,
        "score_label": "Excellent",
        "one_line_verdict": "Strong answer.",
        "malicious_key": "dropped",
    }
    result = bb.to_dict()
    assert "malicious_key" not in result["intelligence_score"]
    assert result["intelligence_score"]["total_score"] == 80
    assert result["intelligence_score"]["score_label"] == "Excellent"


def test_to_dict_empty_intelligence_score() -> None:
    """An empty intelligence_score returns {} in to_dict()."""
    bb = Blackboard(task_id="t", user_id=1)
    bb.intelligence_score = {}
    result = bb.to_dict()
    assert result["intelligence_score"] == {}
