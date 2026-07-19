"""Auth routes must return the standard {error, message} envelope.

Cycle 53 audited all `raise HTTPException(...)` calls in arena/routes/*.py
and found 124 uses of the legacy string-detail shape
(`detail="Some message"`), which serializes as `{"detail": "Some message"}`.
The frontend (web/frontend/src/api.ts) reads `detail.message` and
`detail.error`, so those responses show generic fallback strings instead
of the actual server message.

This regression test pins that auth.py — the most-trafficked auth module,
hit on every login / refresh / password reset / registration attempt —
no longer ships any new string-detail raises. The fix landed in cycle 53
by replacing 6 string-detail raises with the standard envelope. Future
contributors who reach for the quick `detail="..."` form get a clear
test failure pointing at the new pattern.

Scope: auth.py only. Other route files (rooms.py has 20+ string-detail
raises) are deferred to follow-up cycles; the global envelope
consistency is a long-tail cleanup, not a one-shot.
"""

from __future__ import annotations

import ast
import os
from pathlib import Path

import pytest


_AUTH_PY = Path(__file__).resolve().parent.parent / "arena" / "routes" / "auth.py"


def _string_detail_httpexception_raises(source: str) -> list[tuple[int, str]]:
    """AST-walk `source` for `raise HTTPException(... detail="literal" ...)`."""
    tree = ast.parse(source)
    hits: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Raise) or not isinstance(node.exc, ast.Call):
            continue
        exc = node.exc
        # Skip if it's not an HTTPException constructor
        fname = getattr(exc.func, "id", None) or (
            getattr(exc.func, "attr", None) if hasattr(exc.func, "attr") else None
        )
        if fname != "HTTPException":
            continue
        # Look at every kwarg for `detail` and check if it's a string constant.
        for kw in exc.keywords:
            if kw.arg != "detail":
                continue
            if isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str):
                hits.append((node.lineno, kw.value.value))
    return hits


def test_auth_routes_no_string_detail_raises() -> None:
    """All auth.py HTTPException raises must use dict detail, not string."""
    assert _AUTH_PY.exists(), f"auth.py not found at {_AUTH_PY}"
    source = _AUTH_PY.read_text(encoding="utf-8")
    hits = _string_detail_httpexception_raises(source)
    assert not hits, (
        "auth.py has HTTPException raises with string detail, which produces "
        "FastAPI's legacy envelope {detail: 'string'} instead of the standard "
        "{error, message} shape. Frontend api.ts reads detail.message and "
        "would show a fallback. Replace with:\n"
        "    raise HTTPException(\n"
        "        status_code=...,\n"
        "        detail={'error': ErrorCodes.X, 'message': '...'},\n"
        "    )\n"
        f"Offending lines: {hits}"
    )
