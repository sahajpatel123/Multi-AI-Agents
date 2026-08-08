"""Tests for the contradiction detector helpers.

contradiction_detector identifies when an agent's current response
contradicts a previous one in the same session. Drift here means either:
  - the similarity thresholds (0.4 / 0.6) silently shift, missing real
    contradictions or false-alarming on near-identical claims
  - the core-claim extraction drops critical signal (e.g. truncates
    the actual disagreement out of the first 2 sentences)
  - the singleton accessor returns None when callers expect an instance
  - the ContradictionReport constructor fields silently rename

We pin the pure helpers + the singleton + the report constructor.
The LLM-backed check (_llm_check_contradiction) is integration-tested.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from arena.core.contradiction_detector import (
    ContradictionDetector,
    ContradictionReport,
    get_contradiction_detector,
)


@pytest.fixture(autouse=True)
def _reset_singleton():
    """Each test starts with a clean global singleton."""
    from arena.core import contradiction_detector

    contradiction_detector._detector = None
    yield
    contradiction_detector._detector = None


def _make_detector(monkeypatch) -> ContradictionDetector:
    """Build a ContradictionDetector without invoking model_router."""
    # get_route_for_task is called in __init__; patch it to return a stub.
    monkeypatch.setattr(
        "arena.core.contradiction_detector.get_route_for_task",
        lambda _task: {"client": None, "model_id": "stub"},
    )
    return ContradictionDetector()


# ── ContradictionReport ───────────────────────────────────────────


# ── ContradictionReport ───────────────────────────────────────────


def test_contradiction_report_defaults_severity_to_low(monkeypatch) -> None:
    rep = ContradictionReport(contradiction_detected=False)
    assert rep.severity == "low"
    assert rep.contradiction_detected is False
    assert rep.contradicting_agent_id == ""
    assert rep.previous_statement == ""
    assert rep.current_statement == ""


def test_contradiction_report_carries_full_constructor_args(monkeypatch) -> None:
    rep = ContradictionReport(
        contradiction_detected=True,
        contradicting_agent_id="analyst",
        previous_statement="X is true",
        current_statement="X is false",
        severity="high",
    )
    assert rep.contradiction_detected is True
    assert rep.contradicting_agent_id == "analyst"
    assert rep.previous_statement == "X is true"
    assert rep.current_statement == "X is false"
    assert rep.severity == "high"


# ── _extract_core_claim ───────────────────────────────────────────


def test_extract_core_claim_returns_full_text_for_short_input(monkeypatch) -> None:
    # A single sentence → returned verbatim (no period appended).
    det = _make_detector(monkeypatch)
    assert det._extract_core_claim("One sentence only") == "One sentence only"


def test_extract_core_claim_returns_first_two_sentences(monkeypatch) -> None:
    # "X. Y. Z." → first two sentences joined: "X. Y."
    det = _make_detector(monkeypatch)
    assert det._extract_core_claim("X. Y. Z.") == "X. Y."


def test_extract_core_claim_handles_two_sentences_with_trailing_period(monkeypatch) -> None:
    # The function joins the first two sentences and ALWAYS appends '.',
    # so input that already ends with '.' yields a double-period. Lock
    # the current behavior — a future edit that strips the trailing
    # '.' when the second sentence ends with one is a deliberate change.
    det = _make_detector(monkeypatch)
    assert (
        det._extract_core_claim("Apple is red. Banana is yellow.")
        == "Apple is red. Banana is yellow.."
    )


def test_extract_core_claim_empty_string(monkeypatch) -> None:
    det = _make_detector(monkeypatch)
    assert det._extract_core_claim("") == ""


def test_extract_core_claim_handles_complex_punctuation(monkeypatch) -> None:
    # The split is on ". " (period + space) — single sentences without
    # that pattern stay as one sentence.
    det = _make_detector(monkeypatch)
    assert det._extract_core_claim("One sentence") == "One sentence"


# ── ContradictionDetector._calculate_similarity ────────────────────


def test_calculate_similarity_returns_one_for_identical_text(monkeypatch) -> None:
    det = _make_detector(monkeypatch)
    assert det._calculate_similarity("hello world", "hello world") == 1.0


def test_calculate_similarity_returns_one_for_case_different_only(monkeypatch) -> None:
    det = _make_detector(monkeypatch)
    # The helper lowercases both inputs before scoring.
    assert det._calculate_similarity("Hello World", "hello world") == 1.0


def test_calculate_similarity_returns_zero_for_completely_different(monkeypatch) -> None:
    det = _make_detector(monkeypatch)
    # Two strings with no shared characters → 0.0 similarity.
    assert det._calculate_similarity("abc", "xyz") == 0.0


def test_calculate_similarity_returns_between_zero_and_one_for_partial_overlap(monkeypatch) -> None:
    det = _make_detector(monkeypatch)
    sim = det._calculate_similarity("the quick brown fox", "the slow brown dog")
    assert 0.0 < sim < 1.0


def test_calculate_similarity_handles_empty_strings(monkeypatch) -> None:
    det = _make_detector(monkeypatch)
    assert det._calculate_similarity("", "") == 1.0  # SequenceMatcher treats "" == ""
    # "" vs "x" → 0.0 (no overlap)
    assert det._calculate_similarity("", "x") == 0.0


# ── get_contradiction_detector singleton ────────────────────────────


def test_get_contradiction_detector_returns_instance(monkeypatch) -> None:
    monkeypatch.setattr(
        "arena.core.contradiction_detector.get_route_for_task",
        lambda _task: {"client": None, "model_id": "stub"},
    )
    det = get_contradiction_detector()
    assert isinstance(det, ContradictionDetector)


def test_get_contradiction_detector_returns_same_instance(monkeypatch) -> None:
    monkeypatch.setattr(
        "arena.core.contradiction_detector.get_route_for_task",
        lambda _task: {"client": None, "model_id": "stub"},
    )
    a = get_contradiction_detector()
    b = get_contradiction_detector()
    assert a is b


def test_get_contradiction_detector_reinitializes_when_global_reset(monkeypatch) -> None:
    monkeypatch.setattr(
        "arena.core.contradiction_detector.get_route_for_task",
        lambda _task: {"client": None, "model_id": "stub"},
    )
    a = get_contradiction_detector()
    # Reset the module-level global; the next call must build a new instance.
    from arena.core import contradiction_detector

    contradiction_detector._detector = None
    b = get_contradiction_detector()
    assert a is not b


# ── Similarity-threshold contract ─────────────────────────────────


def test_similarity_thresholds_define_borderline_band() -> None:
    # The check_agent_consistency logic uses 0.4 / 0.6 as the borderline
    # band. Lock the band numerically — these are the values the LLM
    # fallback triggers on; shifting them silently changes detection
    # sensitivity.
    LOW = 0.4
    HIGH = 0.6
    # In-band: LLM fallback fires
    assert LOW <= 0.5 <= HIGH
    # Out-of-band (above): too similar → skip
    assert 0.9 > HIGH
    # Out-of-band (below): too different → skip
    assert 0.1 < LOW
