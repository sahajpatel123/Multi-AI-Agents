"""Regression: every user- or IP-scoped route in arena/routes/ must be rate-limited OR admin-gated.

Cycles 32 / 33 closed the public-IP rate-limit gap on agent routes. Cycle 40
closed `rooms.py`. Cycle 41 closes `condura.py`. The pattern that keeps
reappearing: someone adds a route, forgets the rate-limit call, ships it,
moves on. Without a guard, the gap silently reopens.

This test walks every `@router.<method>` declaration in a curated set of
route files and asserts each handler body has at least one of:

  * `enforce_user_rate_limit(...)` — user-scoped throttle
  * `enforce_ip_rate_limit(...)`   — IP-scoped throttle
  * `@limiter.limit(...)`          — slowapi decorator
  * `require_admin_email(...)`     — admin gate (acceptable exception;
                                    admin reads can be uncapped because
                                    ADMIN_EMAIL is a closed allowlist)
  * `verify_razorpay_signature`    — webhook (signature is the throttle)

Files checked:
  * rooms.py    (cycle 40 closed 5 gaps)
  * condura.py  (cycle 41 closed 6 gaps)
  * personas.py (cycle 42 closed 2 public-catalog gaps)
  * saved.py    (cycle 42 closed 2 destructive-delete gaps)
  * mcp.py      (cycle 43 closed list/catalog/disconnect gaps)
  * panels.py   (cycle 43 closed panel read + presets gaps)
  * session.py  (cycle 43 closed get + list gaps)
  * discuss.py  (cycle 44 closed thread list/detail; stream uses cost_tracker)

Other route files use different throttling mechanisms:
  * debate.py / prompt.py → tier-limit via cost_tracker.check_and_increment_user
  * auth.py / payments.py → mix of IP+user+signature verification; covered by separate tests
  * agent.py → cycle 32/33 closed the public gaps
  * memory.py / analytics.py → already audited
  * metrics.py → single admin endpoint
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest


ROUTES_DIR = Path(__file__).resolve().parent.parent / "arena" / "routes"

# Files this test asserts on. Adding a file here means: every route in it
# must have a rate-limit call OR an admin gate inside its handler body.
# Don't add files that legitimately use a different throttle mechanism
# (tier-limit, signature verification, etc.) — those get separate coverage.
COVERED_FILES = [
    "rooms.py",
    "condura.py",
    "personas.py",
    "saved.py",
    "calibration.py",
    "mcp.py",
    "panels.py",
    "session.py",
    "discuss.py",
]

# Acceptable defenses inside a handler body. Match each as a regex.
DEFENSES = {
    "user_rate_limit": re.compile(r"\benforce_user_rate_limit\b"),
    "ip_rate_limit": re.compile(r"\benforce_ip_rate_limit\b"),
    "limiter_decorator": re.compile(r"@limiter\.limit\b"),
    "admin_gate": re.compile(r"\brequire_admin_email\b"),
    "razorpay_sig": re.compile(r"\bverify_razorpay_signature\b"),
    "stripe_sig": re.compile(r"\bverify_stripe_signature\b"),
    # LLM spend throttle used by discuss/debate/prompt stream handlers.
    "tier_cost_tracker": re.compile(r"\bcheck_and_increment_user\b"),
}

# `@router.<method>("<path>")` — multi-line decorators OK (open paren on
# the same line; the test only needs the method + path).
_DECORATOR_RE = re.compile(
    r'@router\.(get|post|patch|delete|put)\(\s*\n?\s*[\'"]([^\'"]+)[\'"]',
    re.MULTILINE,
)


def _iter_route_decorators(py_file: Path) -> list[tuple[str, str, int]]:
    """Return (method, path, line_no) for every `@router.<method>("<path>")`."""
    source = py_file.read_text()
    decorators: list[tuple[str, str, int]] = []
    pos = 0
    while True:
        m = _DECORATOR_RE.search(source, pos)
        if not m:
            break
        prefix = source[: m.start()]
        line_no = prefix.count("\n") + 1
        decorators.append((m.group(1), m.group(2), line_no))
        pos = m.end()
    return decorators


def _function_body(py_file: Path, start_line: int) -> str:
    """Walk forward from the decorator to capture the decorated function body.

    Captures from the next ``async def`` / ``def`` line until the next
    ``@router.`` decorator (or EOF). Caps at 120 lines so a long handler
    still fits without swallowing a later route's rate-limit call
    (which would create a false-positive "protected" verdict).

    Multi-line decorators (``@router.post(\\n  "/path",\\n  responses=...)``)
    need a wider look-ahead than 6 lines — 24 covers responses= dicts without
    jumping into a later route's body.
    """
    source = py_file.read_text()
    lines = source.split("\n")
    # start_line is 1-indexed (from the decorator match); convert to 0-index.
    start_idx = max(start_line - 1, 0)
    func_start = None
    for i in range(start_idx, min(start_idx + 24, len(lines))):
        if re.match(r"\s*(?:async )?def ", lines[i]):
            func_start = i
            break
    if func_start is None:
        return ""
    end = min(func_start + 120, len(lines))
    for j in range(func_start + 1, end):
        if re.match(r"@router\.(get|post|patch|delete|put)\b", lines[j]):
            end = j
            break
    return "\n".join(lines[func_start:end])


def _route_is_protected(method: str, path: str, py_file: Path, line_no: int) -> tuple[bool, list[str]]:
    """Return (protected, missing_defenses). `missing_defenses` is the list of
    defense patterns the handler DIDN'T match — useful for diagnostics.
    """
    body = _function_body(py_file, line_no)
    matched = [name for name, pat in DEFENSES.items() if pat.search(body)]
    return (bool(matched), [name for name in DEFENSES if name not in matched])


@pytest.mark.parametrize("filename", COVERED_FILES)
def test_every_route_in_covered_files_is_protected(filename: str):
    """Every @router.<method> in the covered files must have a defense."""
    py_file = ROUTES_DIR / filename
    assert py_file.exists(), f"Route file not found: {py_file}"

    decorators = _iter_route_decorators(py_file)
    assert decorators, f"No routes found in {filename} — parser may be broken"

    gaps: list[tuple[str, str, int, list[str]]] = []
    for method, path, line_no in decorators:
        protected, missing = _route_is_protected(method, path, py_file, line_no)
        if not protected:
            gaps.append((method, path, line_no, missing))

    assert not gaps, (
        f"{filename} routes without any defense (rate-limit / admin-gate / "
        "webhook signature):\n"
        + "\n".join(
            f"  {m.upper():6} {p:50} @ line {ln:>4}   (missing: {', '.join(miss)})"
            for m, p, ln, miss in gaps
        )
        + "\n\nWire one of: enforce_user_rate_limit / enforce_ip_rate_limit / "
        "@limiter.limit / require_admin_email / verify_razorpay_signature."
    )


def test_covered_files_list_matches_actual_files():
    """Sanity check the parametrize list — every named file must exist
    and have at least one route, so a future deletion can't make this test
    silently pass on an empty list.
    """
    for name in COVERED_FILES:
        p = ROUTES_DIR / name
        assert p.exists(), f"{name} not in routes/"
        assert _iter_route_decorators(p), f"{name} has no routes — remove from COVERED_FILES"