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
    ("routes", "analytics.py"),
    ("routes", "memory.py"),
    ("routes", "metrics.py"),
    ("routes", "panels.py"),
    ("routes", "personas.py"),
    ("routes", "saved.py"),
    ("core", "dependencies.py"),
    ("core", "input_validation.py"),
    # Cycle 154 — extend the core sweep to the remaining HTTPException-bearing
    # helpers. `errors.py` is the canonical ApiError / error_response helper
    # that builds the dict envelope shape; `admin_gate.py`, `login_limiter.py`,
    # `rate_limits.py`, and `input_pipeline.py` all already produce dict
    # details, so adding them here is purely additive regression coverage.
    # Verified clean via AST walk (zero string-detail raises across the 5).
    ("core", "errors.py"),
    ("core", "admin_gate.py"),
    ("core", "login_limiter.py"),
    ("core", "rate_limits.py"),
    ("core", "input_pipeline.py"),
]


def _arena_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "arena"


def _is_string_like_detail(value: ast.AST) -> bool:
    """True when the AST node is a string-like detail that would
    serialize as FastAPI's legacy {'detail': '...'} envelope instead
    of the standard {'error', 'message'} shape.

    Catches:
      - plain string literals: `detail="..."`
      - f-strings: `detail=f"...{var}..."`
      - implicit concatenations of any of the above
      - runtime coercions: `detail=str(e)`, `detail=repr(e)`,
        `detail=format(...)`, `detail="...".format(...)`

    Does NOT catch dict literals (`detail={"error": ..., "message": ...}`),
    which are the only acceptable shape.
    """
    if isinstance(value, ast.Constant) and isinstance(value.value, str):
        return True
    if isinstance(value, ast.JoinedStr):  # f-string
        return True
    if isinstance(value, ast.BinOp) and isinstance(value.op, ast.Add):
        # `"a" + var + f"b"` — string-concat operator on either side
        return _is_string_like_detail(value.left) or _is_string_like_detail(value.right)
    if isinstance(value, ast.Call):
        # str(...), repr(...), format(...), "...".format(...), Variable.format(...)
        fname = getattr(value.func, "id", None) or (
            getattr(value.func, "attr", None) if hasattr(value.func, "attr") else None
        )
        if fname in {"str", "repr", "format"}:
            return True
    return False


def _string_detail_httpexception_raises(source: str) -> list[tuple[int, str]]:
    """AST-walk `source` for `raise HTTPException(... detail=<string-like> ...)`.

    See `_is_string_like_detail` for the full set of shapes caught.
    Cycle 81 strengthened this from constant-strings-only to include
    f-strings, string-concat, and str()/repr()/format() coercions.
    """
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
            if _is_string_like_detail(kw.value):
                hits.append((node.lineno, ast.unparse(kw.value)))
    return hits


@pytest.mark.parametrize("subdir,filename", COVERED_FILES)
def test_routes_no_string_detail_raises(subdir: str, filename: str) -> None:
    """All HTTPException raises in the covered files must use dict detail, not string."""
    path = _arena_dir() / subdir / filename
    assert path.exists(), f"{filename} not found at {path}"
    source = path.read_text(encoding="utf-8")
    hits = _string_detail_httpexception_raises(source)
    assert not hits, (
        f"arena/{subdir}/{filename} has HTTPException raises with string-like detail "
        f"(plain string, f-string, str()/repr()/format(), or string concat), which "
        f"produces FastAPI's legacy envelope {{detail: 'string'}} instead of the standard "
        f"{{error, message}} shape. Frontend api.ts reads detail.message and would show a "
        f"fallback. Replace with:\n"
        f"    raise HTTPException(\n"
        f"        status_code=...,\n"
        f"        detail={{'error': ErrorCodes.X, 'message': '...'}},\n"
        f"    )\n"
        f"Offending lines: {hits}"
    )


def test_detector_catches_string_like_shapes():
    """Pins the AST detector itself. Cycle 81 widened it from
    `ast.Constant`-only to also catch f-strings, string-concat,
    and runtime coercions; this test guards against future
    narrowing that would re-open the gap."""
    cases = [
        # (code fragment, expected_hit)
        ('raise HTTPException(status_code=400, detail="plain string")', True),
        ('raise HTTPException(status_code=400, detail=f"f-string {x}")', True),
        ('raise HTTPException(status_code=400, detail=str(e))', True),
        ('raise HTTPException(status_code=400, detail=repr(e))', True),
        ('raise HTTPException(status_code=400, detail="x" + name)', True),
        ('raise HTTPException(status_code=400, detail=format(x))', True),
        ('raise HTTPException(status_code=400, detail="prefix: " + str(e))', True),
        # Acceptable shapes
        ('raise HTTPException(status_code=400, detail={"error": "x", "message": "m"})', False),
        ('raise HTTPException(status_code=400, detail=None)', False),
    ]
    for snippet, expect_hit in cases:
        hits = _string_detail_httpexception_raises(snippet)
        assert bool(hits) == expect_hit, (
            f"{snippet!r}: expected hit={expect_hit}, got {hits}"
        )