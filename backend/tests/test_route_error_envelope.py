"""Route + core modules must return the standard {error, message} envelope.

Cycle 53 audited all `raise HTTPException(...)` calls in arena/routes/*.py
and found 124 uses of the legacy string-detail shape
(`detail="Some message"`), which serializes as `{"detail": "Some message"}`.
The frontend (web/frontend/src/api.ts) reads `detail.message` and
`detail.error`, so those responses show generic fallback strings instead
of the actual server message.

This regression test pins the invariant for any (subdir, file) added to
COVERED_FILES. Each fix landed in a separate cycle:

  - cycle 53: auth.py in routes/         (6 raises)
  - cycle 54: rooms.py in routes/        (19 raises)
  - cycle 55: debate.py in routes/       (6 raises)
  - cycle 56: discuss.py in routes/      (5 raises)
  - cycle 57: 5 small files in routes/   (13 raises)
  - cycle 58: payments.py in routes/     (26 raises)
  - cycle 59: agent.py in routes/        (42 raises) — sweep complete
  - cycle 60: dependencies.py in core/    (8 raises) — extends sweep into core

Future conversions just add the module to the list. Contributors who
reach for the quick `detail="..."` form get a clear test failure
pointing at the new pattern.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest


# (subdir under arena/, filename) tuples — each must be free of string-detail raises.
COVERED_FILES = [
    ("routes", "auth.py"),
    ("routes", "rooms.py"),
    ("routes", "debate.py"),
    ("routes", "discuss.py"),
    ("routes", "condura.py"),
    ("routes", "calibration.py"),
    ("routes", "prompt.py"),
    ("routes", "mcp.py"),
    ("routes", "session.py"),
    ("routes", "payments.py"),
    ("routes", "agent.py"),
    ("core", "dependencies.py"),
]


def _arena_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "arena"


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


@pytest.mark.parametrize("subdir,filename", COVERED_FILES)
def test_routes_no_string_detail_raises(subdir: str, filename: str) -> None:
    """All HTTPException raises in the covered files must use dict detail, not string."""
    path = _arena_dir() / subdir / filename
    assert path.exists(), f"{filename} not found at {path}"
    source = path.read_text(encoding="utf-8")
    hits = _string_detail_httpexception_raises(source)
    assert not hits, (
        f"arena/{subdir}/{filename} has HTTPException raises with string detail, which "
        f"produces FastAPI's legacy envelope {{detail: 'string'}} instead of the standard "
        f"{{error, message}} shape. Frontend api.ts reads detail.message and "
        f"would show a fallback. Replace with:\n"
        f"    raise HTTPException(\n"
        f"        status_code=...,\n"
        f"        detail={{'error': ErrorCodes.X, 'message': '...'}},\n"
        f"    )\n"
        f"Offending lines: {hits}"
    )