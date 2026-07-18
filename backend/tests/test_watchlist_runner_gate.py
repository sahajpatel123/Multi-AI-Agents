"""Unit tests for watchlist_runner honesty gate helper."""

from __future__ import annotations

from arena.core.watchlist_runner import _gate_watchlist_question


def test_gate_returns_capability_decision_shape():
    gate = _gate_watchlist_question("What is the latest research on lithium batteries?")
    assert "capability_id" in gate
    assert gate["capability_id"] == "watchlist.create"
    assert gate["decision"] in {"allow", "reject", "fallback"}
    assert "env" in gate


def test_gate_flags_obvious_local_execution_intent():
    # Local-machine phrasing should not be treated as pure web research.
    gate = _gate_watchlist_question(
        "Open Finder and list files on my Desktop every morning"
    )
    assert gate["decision"] in {"reject", "fallback"}
