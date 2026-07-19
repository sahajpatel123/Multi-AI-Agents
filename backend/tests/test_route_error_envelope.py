"""Route modules must return the standard {error, message} envelope.

Cycle 53 audited all `raise HTTPException(...)` calls in arena/routes/*.py
and found 124 uses of the legacy string-detail shape
(`detail="Some message"`), which serializes as `{"detail": "Some message"}`.
The frontend (web/frontend/src/api.ts) reads `detail.message` and
`detail.error`, so those responses show generic fallback strings instead
of the actual server message.

This regression test pins the invariant for any route file added to
COVERED_FILES. Each fix landed in a separate cycle:

  - cycle 53: auth.py   (6 raises)
  - cycle 54: rooms.py (19 raises)

Future conversions just add the module to the list. Contributors who
reach for the quick `detail="..."` form get a clear test failure
pointing at the new pattern.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest


COVERED_FILES = [
    "auth.py",
    "rooms.py",
    "debate.py",
    "discuss.py",
    "condura.py",
    "calibration.py",
    "prompt.py",
    "mcp.py",
    "session.py",
]


def _routes_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "arena" / "routes"


def _string_detail_httpexception_raises(source: str) -> list[tuple[int, str]]:
    """AST-walk `source` for `raise HTTPException(... detail="literal" ...)`."""
    tree = ast.parse(source)
    hits: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Raise) or not isinstance(node.exc, ast.Call):
            continue
        exc = node.exc
        fname = getattr(exc.func, "id", None) or (
            getattr(exc.func, "attr", None) if hasattr(exc.func, "attr") else None
        )
        if fname != "HTTPException":
            continue
        for kw in exc.keywords:
            if kw.arg != "detail":
                continue
            if isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str):
                hits.append((node.lineno, kw.value.value))
    return hits


@pytest.mark.parametrize("filename", COVERED_FILES)
def test_routes_no_string_detail_raises(filename: str) -> None:
    """All HTTPException raises in the covered files must use dict detail, not string."""
    path = _routes_dir() / filename
    assert path.exists(), f"{filename} not found at {path}"
    source = path.read_text(encoding="utf-8")
    hits = _string_detail_httpexception_raises(source)
    assert not hits, (
        f"{filename} has HTTPException raises with string detail, which produces "
        f"FastAPI's legacy envelope {{detail: 'string'}} instead of the standard "
        f"{{error, message}} shape. Frontend api.ts reads detail.message and "
        f"would show a fallback. Replace with:\n"
        f"    raise HTTPException(\n"
        f"        status_code=...,\n"
        f"        detail={{'error': ErrorCodes.X, 'message': '...'}},\n"
        f"    )\n"
        f"Offending lines: {hits}"
    )
