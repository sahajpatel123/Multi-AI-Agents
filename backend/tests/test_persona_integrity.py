"""Unit tests for arena.core.persona_integrity drift + overlap engine.

The two helpers (compute_drift_score, record_response) gate the
'agent is repeating itself' UX. The other persona_integrity
behaviour (clear_session_history wiring into session delete) is
covered in tests/test_session_routes.py. This file fills the
remaining gap: direct unit tests of the math.
"""

from __future__ import annotations

import pytest

from arena.core.persona_integrity import (
    DRIFT_THRESHOLD,
    OVERLAP_THRESHOLD,
    _session_history,
    clear_session_history,
    compute_drift_score,
    compute_pairwise_overlap,
    record_response,
)


@pytest.fixture(autouse=True)
def _clear_drift_state():
    """Each test starts from a clean per-session dict.

    The persona_integrity module's _session_history is process-local
    state, so this autouse fixture makes the assertions deterministic.
    """
    _session_history.clear()
    yield
    _session_history.clear()


def test_compute_drift_score_no_history_returns_zero():
    """First call for a session has no prior verdicts to compare against."""
    assert compute_drift_score("agent_1", "anything goes here", "session_1") == 0.0


def test_compute_drift_score_repeats_bump_drift():
    """Two identical verdicts in a row should produce a high drift score."""
    record_response("agent_1", "this is a long enough verdict to compare", "session_1")
    record_response("agent_1", "this is a long enough verdict to compare", "session_1")
    drift = compute_drift_score(
        "agent_1", "this is a long enough verdict to compare", "session_1"
    )
    # SequenceMatcher.ratio returns 1.0 for identical strings, so the
    # second call sees a max_sim of 1.0 → drift = 1.0.
    assert drift == pytest.approx(1.0, abs=0.01)


def test_compute_drift_score_different_verdicts_drops_drift():
    """A novel verdict should produce a low drift score."""
    record_response("agent_1", "the quick brown fox jumps over the lazy dog", "s")
    record_response("agent_1", "the quick brown fox jumps over the lazy dog", "s")
    drift = compute_drift_score(
        "agent_1",
        "completely different content about quantum computing and Python types",
        "s",
    )
    # Two clearly different strings → SequenceMatcher ratio is well
    # below the 0.6 DRIFT_THRESHOLD.
    assert drift < DRIFT_THRESHOLD


def test_record_response_caps_history_at_max():
    """Each session has a bounded per-agent history; older entries fall off."""
    from arena.core.persona_integrity import MAX_HISTORY_PER_AGENT

    # Record more entries than the cap.
    for i in range(MAX_HISTORY_PER_AGENT + 5):
        record_response("agent_1", f"verdict number {i}", "session_cap")

    history = _session_history["session_cap"]["agent_1"]
    assert len(history) == MAX_HISTORY_PER_AGENT
    # Oldest entries are dropped; the most recent ones survive.
    assert history[-1] == f"verdict number {MAX_HISTORY_PER_AGENT + 4}"


def test_clear_session_history_drops_every_agent_for_session():
    record_response("agent_1", "v1", "to_clear")
    record_response("agent_2", "v2", "to_clear")
    record_response("agent_3", "v3", "other_session")

    assert "to_clear" in _session_history
    assert "other_session" in _session_history

    clear_session_history("to_clear")
    assert "to_clear" not in _session_history
    # Other sessions are untouched.
    assert "other_session" in _session_history
    assert _session_history["other_session"] == {"agent_3": ["v3"]}


def test_compute_pairwise_overlap_flags_duplicate_agents():
    """Two agents producing near-identical verdicts trigger the overlap filter."""
    from arena.models.schemas import AgentResponse

    a = AgentResponse(
        agent_id="agent_1",
        agent_number=1,
        verdict="This is a long verdict that should match another agent's output very closely.",
        one_liner="short",
        confidence=80,
        key_assumption="x",
    )
    b = AgentResponse(
        agent_id="agent_2",
        agent_number=2,
        verdict="This is a long verdict that should match another agent's output very closely.",
        one_liner="short",
        confidence=80,
        key_assumption="x",
    )
    c = AgentResponse(
        agent_id="agent_3",
        agent_number=3,
        verdict="a totally different answer about something else entirely",
        one_liner="short",
        confidence=50,
        key_assumption="y",
    )

    pairs = compute_pairwise_overlap([a, b, c])
    # a and b are duplicates — SequenceMatcher.ratio ~1.0, well above 0.55.
    assert any(
        p["agent_a"] == "agent_1" and p["agent_b"] == "agent_2" for p in pairs
    )
    # c is unrelated to either — should not appear in any overlap pair.
    c_partners = {p["agent_a"] for p in pairs} | {
        p["agent_b"] for p in pairs
    }
    assert "agent_3" not in c_partners


def test_compute_pairwise_overlap_empty_input_returns_empty_list():
    assert compute_pairwise_overlap([]) == []
    # Two agents with completely disjoint verdicts → no pair crosses
    # the 0.55 overlap threshold. Choose sentences that share no
    # 3-grams to keep the SequenceMatcher ratio well below 0.55.
    assert (
        compute_pairwise_overlap(
            [
                _make_agent("a", verdict="quantum entanglement is a phenomenon where particles remain connected"),
                _make_agent("b", verdict="the history of the roman empire spans several centuries"),
            ]
        )
        == []
    )


def _make_agent(agent_id: str, verdict: str = "x"):
    from arena.models.schemas import AgentResponse

    return AgentResponse(
        agent_id=agent_id,
        agent_number=1,
        verdict=verdict,
        one_liner="short",
        confidence=80,
        key_assumption="x",
    )


def test_constants_are_sane():
    """Sanity check — if anyone bumps these without re-tuning the
    pipeline tests, the threshold assertions elsewhere will catch it,
    but the values themselves should never be zero or negative."""
    assert 0.0 < DRIFT_THRESHOLD <= 1.0
    assert 0.0 < OVERLAP_THRESHOLD <= 1.0