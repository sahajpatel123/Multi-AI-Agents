"""Router uniqueness: no two routes on agent.router may share (method, path).

Cycle 30 found two handlers on (GET, /api/agent/feedback/recent). FastAPI
0.139 silently appends duplicate (method, path) pairs and Starlette's
Router.app dispatches on the FIRST match in registration order, so the
later handler was unreachable dead code that bypassed the rate-limit the
canonical handler had wired.

This regression test asserts the invariant at import time so the bug
class cannot recur silently.
"""

from __future__ import annotations

from collections import Counter

from arena.routes.agent import router as agent_router


def _pairs(router) -> list[tuple[str, str]]:
    pairs = []
    for r in router.routes:
        p = getattr(r, "path", "")
        if not p or not p.startswith("/"):
            continue
        for m in sorted(getattr(r, "methods", []) or []):
            pairs.append((m, p))
    return pairs


def test_agent_router_has_no_duplicate_method_path() -> None:
    pairs = _pairs(agent_router)
    counts = Counter(pairs)
    dups = {k: v for k, v in counts.items() if v > 1}
    assert not dups, (
        f"agent.router has duplicate (method, path) registrations: {dups}. "
        "Starlette dispatches on the first match, so later handlers are "
        "dead code that silently bypasses any decorator the canonical "
        "handler had wired (e.g. rate-limits). See loop cycle 30."
    )


def test_agent_router_pairs_are_unique_by_default() -> None:
    """Sanity check on the assertion logic itself: pairs must be unique on HEAD."""
    pairs = _pairs(agent_router)
    assert len(pairs) == len(set(pairs)), (
        f"agent.router has {len(pairs)} registrations but only {len(set(pairs))} "
        "unique (method, path) pairs."
    )