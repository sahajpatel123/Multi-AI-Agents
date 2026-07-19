"""Regression: COVERED_FILES in test_routes_rate_limit_coverage must not shrink.

Cycles 40 / 41 / 42 / 43 / 51 added route files to COVERED_FILES as the
multi-agent workspace closed rate-limit gaps. The list went from 2
(rooms.py, condura.py) to 16 (rooms.py, condura.py, personas.py,
saved.py, calibration.py, mcp.py, panels.py, session.py, discuss.py,
analytics.py, memory.py, payments.py, prompt.py, debate.py, agent.py,
auth.py, metrics.py) over the course of the loop session.

The list now covers every route file in arena/routes/. A future
contributor who removes a file from COVERED_FILES (intentionally or
during a refactor) silently loses the regression guard — a new
unprotected route would slip through.

This test pins the lower bound: COVERED_FILES must include every
file currently listed in the coverage suite. Adding new files is
fine; removing one is not.

If a route file is intentionally being deprecated, remove the route
file itself first, then update COVERED_FILES. That way the audit
trail forces you to confront the change.
"""

from __future__ import annotations

import re
from pathlib import Path


COVERAGE_TEST = (
    Path(__file__).resolve().parent / "test_routes_rate_limit_coverage.py"
)


def _extract_covered_files_from_coverage_test() -> list[str]:
    """Parse the COVERED_FILES list literal out of the coverage test."""
    source = COVERAGE_TEST.read_text()
    # Match the literal `COVERED_FILES = [` ... `]` block.
    match = re.search(r"COVERED_FILES\s*=\s*\[(.*?)\]", source, re.DOTALL)
    if not match:
        raise AssertionError(
            "Could not locate `COVERED_FILES = [...]` in "
            f"{COVERAGE_TEST}. Has the list been refactored into a "
            "non-literal form? Update this guard to match."
        )
    block = match.group(1)
    # Pull quoted strings out of the block.
    return re.findall(r"""['"]([^'"]+)['"]""", block)


def test_covered_files_matches_pinned_lower_bound():
    """The COVERED_FILES list must contain every route file currently
    covered. Removing one — accidentally or as a 'cleanup' — would silently
    lose the regression guard for that file's routes.
    """
    expected = {
        "rooms.py",
        "condura.py",
        "personas.py",
        "saved.py",
        "calibration.py",
        "mcp.py",
        "panels.py",
        "session.py",
        "discuss.py",
        "analytics.py",
        "memory.py",
        "payments.py",
        "prompt.py",
        "debate.py",
        "agent.py",
        "auth.py",
        "metrics.py",
    }

    actual = set(_extract_covered_files_from_coverage_test())
    missing = expected - actual

    assert not missing, (
        f"COVERED_FILES shrunk — these route files were covered but are "
        f"no longer asserted: {sorted(missing)}. To intentionally retire "
        f"a route file from coverage, delete the route file first (so the "
        f"audit trail records the change), then update COVERED_FILES. "
        f"Silently dropping a file from the list re-opens the silent-rate-"
        f"limit-gap class of bug."
    )


def test_covered_files_includes_every_real_route_file():
    """Every route file under arena/routes/ must be in COVERED_FILES.

    This is the inverse direction: a new route file added without
    updating COVERED_FILES would silently bypass the guard. Allowed
    exceptions live in ALLOWED_UNCOVERED.
    """
    routes_dir = COVERAGE_TEST.resolve().parent.parent / "arena" / "routes"

    # __init__.py is a package marker, not a route file.
    real_route_files = {
        p.name for p in routes_dir.glob("*.py") if p.name != "__init__.py"
    }

    covered = set(_extract_covered_files_from_coverage_test())

    # No allowed exceptions today. If a route file legitimately uses a
    # different throttle mechanism (e.g. tier-cost-tracker only, no
    # rate-limit decorator), it should still appear here so the test
    # at least sees the file. The coverage suite accepts admin-gate /
    # webhook-signature as alternative defenses, so any route file passes
    # as long as it has *some* form of protection.
    uncovered = real_route_files - covered

    assert not uncovered, (
        f"Route files in arena/routes/ not covered by the rate-limit guard: "
        f"{sorted(uncovered)}. Add them to COVERED_FILES — they pass "
        f"as long as each route has a rate-limit call OR an admin-gate "
        f"OR a webhook-signature check."
    )