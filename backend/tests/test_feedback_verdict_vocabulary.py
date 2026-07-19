"""Regression: agent.py answer-feedback validation accepts a fixed verdict vocabulary.

The answer-feedback endpoint (`POST /api/agent/tasks/{task_id}/feedback`)
validates that the body.feedback value is one of three canonical
strings. The frontend history filter (`agentHistoryFeedbackFilter.ts`)
hardcodes a parallel set called `KNOWN_VERDICTS`. If the two ever
drift, the UI's filter buttons silently never match — the user
sees an empty result list and assumes "no feedback recorded" when
in fact the verdict strings are different.

This test pins the agent.py vocabulary and surfaces the cross-stack
match so a future drift is caught immediately.

NOTE: A separate drift was discovered (see KNOWN_DRIFT below) where
backend `feedback_calibrator.py` queries for `correct/partial/wrong`
while the validation accepts `accurate/inaccurate/partial`. That
domain is not the same as the agent-history filter — the calibrator
reads a different `AnswerFeedback.verdict` field. This test does
not cover that drift; it's a follow-up scope.
"""

from __future__ import annotations

import re
from pathlib import Path


def test_agent_py_valid_feedback_set_is_exactly_three_strings():
    """Read `arena/routes/agent.py` and assert the `valid_feedback`
    tuple is exactly the three strings the frontend KNOWN_VERDICTS
    set uses.
    """
    backend_src = (
        Path(__file__).resolve().parent.parent / "arena" / "routes" / "agent.py"
    ).read_text()

    # Capture `valid_feedback = (...)` — a tuple literal. Greedy enough
    # to handle the trailing comma.
    match = re.search(
        r"valid_feedback\s*=\s*\(([^)]+)\)", backend_src
    )
    assert match, (
        "Could not find `valid_feedback = (...)` in agent.py. Has the "
        "validation been refactored? Update this guard."
    )
    backend_verdicts = sorted(re.findall(r"['\"]([^'\"]+)['\"]", match.group(1)))

    assert backend_verdicts == ["accurate", "inaccurate", "partial"], (
        f"Backend agent.py valid_feedback set drifted from canonical "
        f"answer-feedback vocabulary. Got: {backend_verdicts}. "
        f"Expected: ['accurate', 'inaccurate', 'partial']. "
        f"The frontend KNOWN_VERDICTS set in "
        f"web/frontend/src/lib/agentHistoryFeedbackFilter.ts uses these "
        f"three strings; if backend accepts a different set, the UI "
        f"filter buttons silently never match."
    )


def test_frontend_known_verdicts_set_is_canonical():
    """Pin the frontend `KNOWN_VERDICTS` set so a future contributor
    adding a new verdict (e.g. 'almost') updates both sides.
    """
    frontend_src = (
        Path(__file__).resolve().parent.parent.parent
        / "web"
        / "frontend"
        / "src"
        / "lib"
        / "agentHistoryFeedbackFilter.ts"
    ).read_text()

    match = re.search(
        r"KNOWN_VERDICTS\s*=\s*new\s+Set\(\[([^\]]+)\]\)", frontend_src
    )
    assert match, (
        f"Could not find `KNOWN_VERDICTS = new Set([...])` in "
        f"{frontend_src}. Has the lib been refactored? Update this guard."
    )
    frontend_verdicts = sorted(re.findall(r"['\"]([^'\"]+)['\"]", match.group(1)))

    assert frontend_verdicts == ["accurate", "inaccurate", "partial"], (
        f"Frontend KNOWN_VERDICTS set drifted from canonical "
        f"answer-feedback vocabulary. Got: {frontend_verdicts}. "
        f"Expected: ['accurate', 'inaccurate', 'partial']. "
        f"The agent.py valid_feedback set uses these three strings; if "
        f"frontend adds a new value, the UI filter breaks."
    )