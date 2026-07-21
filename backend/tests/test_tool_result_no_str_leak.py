"""Regression: ToolResult.error must be a stable string literal, not a leaked exception.

Cycles 161 + 162 + 163 closed three instances of the same bug class:

  - web_search.py:135  — f"Search error: {str(e)}"
  - datetime_tool.py:64 — f"DateTime error: {str(e)}"
  - tool_router.py:62  — f"Tool execution failed: {str(result)}"

In each case the ToolResult.error field was being constructed from a raw
exception, leaking provider-internal details (model names, library version
strings, tzdata paths, etc.) into the agent's prompt context — and from
there into user-visible text.

This test walks every file under `backend/arena/core/tools/` listed in
COVERED_FILES (the tool surface — the only directory that constructs
ToolResult), finds every `ToolResult(...)` call, and asserts the
`error=` keyword value is a **string literal** — never an f-string,
never a `str(...)` call, never a concatenation that includes a captured
exception.

The fix shape (uniform across all three cycles):

    logger.exception("[TOOL] Tool %s execution failed", tool.name)
    return ToolResult(
        tool_name=tool.name,
        success=False,
        data=None,
        error="<stable_code>",  # literal, no f-string, no str(...)
    )

A future regression that reintroduces a dynamic error string fails here.

Note on `calculator.py`: it has the same bug class at lines 115 + 257 but
is currently in another sweep's working tree. Add it to COVERED_FILES in
the same commit that closes its two violations.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest


TOOLS_DIR = Path(__file__).resolve().parent.parent / "arena" / "core" / "tools"


# Files in arena/core/tools/ that the meta-test enforces. Mirrors the
# `COVERED_FILES` opt-in pattern from test_route_error_envelope.py.
COVERED_FILES: list[str] = [
    # Cycle 163 — first ToolResult producer explicitly listed. base.py
    # has no ToolResult calls so it's not enumerated, but the test
    # framework's parametrized ids render it as the first walk anyway.
    # No — base.py is excluded because it has no ToolResult CONSTRUCTION
    # calls. The dataclass is defined here, not constructed here.
    # Cycle 161 — web_search.py
    "web_search.py",
    # Cycle 162 — datetime_tool.py
    "datetime_tool.py",
    # Cycle 163 — tool_router.py
    "tool_router.py",
    # NOTE: calculator.py intentionally excluded while it has the
    # f"Calculation error: {str(e)}" violation at line 115. Add here when
    # that line is fixed (the fix is identical to cycles 161/162/163).
]


def _is_dynamic_error(value: ast.AST) -> bool:
    """True if the AST node would interpolate runtime data into the error string.

    Catches:
      - f-strings: `error=f"prefix {exc} suffix"` — ast.JoinedStr with .FormattedValue
      - direct str() calls: `error=str(exc)`, `error=str(e)`
      - string concat with str(): `error="prefix: " + str(exc)`
      - any JoinedStr / BinOp / Call — the safe shape is a Constant string literal
    """
    # String literals are the only acceptable shape.
    if isinstance(value, ast.Constant) and isinstance(value.value, str):
        return False
    # Everything else is dynamic — flag it.
    return True


def _tool_result_error_violations(source: str) -> list[tuple[int, str]]:
    """Return [(line_no, snippet)] for every ToolResult(...) call whose
    `error=` keyword is constructed dynamically (not a string literal).
    """
    tree = ast.parse(source)
    violations: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        # Match by name "ToolResult" only — there are several ToolResult
        # subclasses (WebSearchToolResult etc.) but they all call
        # `super().__init__(...)` or build their own dict; we only need to
        # pin the canonical ToolResult dataclass.
        func_name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
        if func_name != "ToolResult":
            continue
        for kw in node.keywords:
            if kw.arg != "error":
                continue
            if _is_dynamic_error(kw.value):
                violations.append((node.lineno, ast.unparse(kw.value)))
    return violations


@pytest.mark.parametrize(
    "tool_filename",
    COVERED_FILES,
)
def test_tool_result_error_is_string_literal(tool_filename: str):
    """Every ToolResult(...) call in a covered tool file must use a
    stable string literal for the `error=` keyword. Dynamic construction
    (f-strings, str() calls, concat with str()) leaks provider-internal
    details into the agent's prompt context — see cycle 161 + 162 + 163.
    """
    tool_file = TOOLS_DIR / tool_filename
    assert tool_file.exists(), f"{tool_filename} not found at {tool_file}"
    source = tool_file.read_text(encoding="utf-8")
    hits = _tool_result_error_violations(source)
    assert not hits, (
        f"{tool_filename} constructs ToolResult.error dynamically — provider "
        f"exception details can leak into the agent's prompt context. "
        f"Fix: log the exception internally with logger.exception(...) and "
        f"return ToolResult(error=\"<stable_code>\"). "
        f"Offending lines: {hits}"
    )


def test_detector_catches_dynamic_error_shapes():
    """Pin the detector against future narrowing that would let f-strings
    or str() calls slip past.
    """
    cases = [
        # Dynamic shapes — must be flagged.
        ('ToolResult(tool_name="x", success=False, error=f"failed: {e}")', True),
        ('ToolResult(tool_name="x", success=False, error=str(e))', True),
        ('ToolResult(tool_name="x", success=False, error="prefix: " + str(e))', True),
        ('ToolResult(tool_name="x", success=False, error=str(exc))', True),
        ('ToolResult(tool_name="x", success=False, error="x" + var)', True),
        # Acceptable shape — must NOT be flagged.
        ('ToolResult(tool_name="x", success=False, error="tool_unavailable")', False),
        ('ToolResult(tool_name="x", success=False, error="web_search_unavailable")', False),
        # No `error=` keyword at all (success=True path) — must NOT be flagged.
        ('ToolResult(tool_name="x", success=True, data={"k": "v"})', False),
    ]
    for snippet, expect_dynamic in cases:
        # Wrap in a module so ast.parse accepts it.
        tree = ast.parse(snippet)
        call = tree.body[0].value
        assert isinstance(call, ast.Call)
        error_kw = next((kw for kw in call.keywords if kw.arg == "error"), None)
        if error_kw is None:
            # No error kwarg — nothing to flag.
            assert expect_dynamic is False, (
                f"{snippet!r}: expected dynamic but no error= kwarg present"
            )
            continue
        is_dynamic = _is_dynamic_error(error_kw.value)
        assert is_dynamic == expect_dynamic, (
            f"{snippet!r}: expected dynamic={expect_dynamic}, got {is_dynamic}"
        )