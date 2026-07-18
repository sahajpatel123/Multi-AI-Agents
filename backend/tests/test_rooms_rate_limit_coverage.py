"""Regression: every destructive / DB-touching route in `rooms.py` must be rate-limited.

Cycles 32 / 33 closed the public-IP rate-limit gap on agent routes. Cycle 40
finishes the equivalent gap in rooms: 5 of 11 routes were unprotected, including
DELETE /{slug} (destructive, 0 limits) and GET /discover / GET /my-rooms /
GET /{slug} / GET /{slug}/members / GET /{slug}/perspective-drift (read
amplification surfaces). The fix shipped in cycle 40 wires
`enforce_user_rate_limit` or `enforce_ip_rate_limit` into every route.

This test pins that surface so the next agent who adds a route to rooms.py
gets a red CI until they add the limiter too. The pattern mirrors cycle 39's
`test_settings_no_dead_fields.py` — same drift category (silent loss of
defense), same shape (an AST/regex walk over a single file).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest


ROOMS_PY = Path(__file__).resolve().parent.parent / "arena" / "routes" / "rooms.py"


# Regex matching `@router.<method>("<path>", ...)` line (continuation allowed
# via the open-paren). Multi-line decorators use `(` without closing it on the
# same line, so we capture from `@router.` up to the line that closes the
# decorator with `)`.
_DECORATOR_RE = re.compile(
    r"@router\.(get|post|patch|delete|put)\(\s*\n?\s*['\"]([^'\"]+)['\"]",
    re.MULTILINE,
)


def _iter_route_decorators() -> list[tuple[str, str, int]]:
    """Return (method, path, line_no) for every `@router.<method>("<path>")`."""
    source = ROOMS_PY.read_text()
    decorators: list[tuple[str, str, int]] = []
    line_no = 0
    pos = 0
    while True:
        m = _DECORATOR_RE.search(source, pos)
        if not m:
            break
        # Walk to the actual line number of the `@` character.
        prefix = source[: m.start()]
        line_no = prefix.count("\n") + 1
        decorators.append((m.group(1), m.group(2), line_no))
        pos = m.end()
    return decorators


def _function_has_rate_limit(method: str, path: str, start_line: int) -> bool:
    """Scan forward from the decorator to the end of the decorated function
    body. Return True if `enforce_user_rate_limit`, `enforce_ip_rate_limit`,
    or `@limiter.limit(...)` appears within that window.
    """
    source = ROOMS_PY.read_text()
    lines = source.split("\n")

    # Find the `async def` line that immediately follows the decorator.
    func_start = None
    for i in range(start_line, min(start_line + 6, len(lines))):
        if re.match(r"\s*async def ", lines[i]) or re.match(r"\s*def ", lines[i]):
            func_start = i
            break
    if func_start is None:
        return False

    # Walk until the function body ends (next non-empty, non-comment line at
    # column 0 — i.e. a sibling decorator or top-level def). For simplicity
    # we just take the next 60 lines — rooms.py handlers are short.
    body_slice = "\n".join(lines[func_start : func_start + 60])

    return bool(
        re.search(r"\benforce_user_rate_limit\b", body_slice)
        or re.search(r"\benforce_ip_rate_limit\b", body_slice)
        or re.search(r"@limiter\.limit\b", body_slice)
    )


def test_every_rooms_route_is_rate_limited():
    """No `@router.<method>` in rooms.py may go without a rate-limit call.

    Cycle 40 closed 5 gaps. If a future contributor adds a new route without
    wiring a limiter, this test fails loudly. Same drift category as cycles
    9/10 (missing ALTER TABLE) and 30 (silently-appended duplicate handler).
    """
    decorators = _iter_route_decorators()
    assert decorators, "AST walk failed to find any routes — test is broken"

    unprotected: list[tuple[str, str, int]] = []
    for method, path, line_no in decorators:
        if not _function_has_rate_limit(method, path, line_no):
            unprotected.append((method, path, line_no))

    assert not unprotected, (
        "rooms.py routes without a rate-limit call (cycle-40 class bug):\n"
        + "\n".join(
            f"  {method.upper():6} {path:40} @ line {line}"
            for method, path, line in unprotected
        )
        + "\n\nWire enforce_user_rate_limit / enforce_ip_rate_limit / "
        "@limiter.limit at the top of the handler body."
    )


@pytest.mark.parametrize(
    "method,path",
    [
        # Spot-check: confirm the regex/parser catches every route shape we
        # actually have in rooms.py. If you rename or split one of these,
        # update the parametrize set.
        ("post", "/create"),
        ("get", "/my-rooms"),
        ("get", "/discover"),
        ("get", "/{slug}/members"),
        ("get", "/{slug}/synthesis"),
        ("get", "/{slug}"),
        ("post", "/{slug}/join"),
        ("post", "/{slug}/add-task"),
        ("post", "/{slug}/remove-task/{task_id}"),
        ("delete", "/{slug}"),
        ("get", "/{slug}/perspective-drift"),
    ],
)
def test_rooms_route_parses(method: str, path: str):
    """Sanity check the parser recognizes every known route shape."""
    found = {(m, p) for m, p, _ in _iter_route_decorators()}
    assert (method, path) in found, (
        f"Parser did not find {method.upper()} {path!r} in rooms.py — "
        f"the decorator regex in _iter_route_decorators may be too narrow. "
        f"Found: {sorted(found)}"
    )