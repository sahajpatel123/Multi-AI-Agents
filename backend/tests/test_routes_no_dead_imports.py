"""Regression: no dead imports in arena/routes/.

Cycles 14/15 replaced `print()` with `logger.exception()`; cycle 16 closed
`datetime.utcnow()`; cycle 20-22 routed `utcnow_naive` through the shared
helper. Each of these cycles was a 'silent-drift' cleanup. Unused imports
are the same class: they linger after a refactor, slow down mypy/pyright,
and confuse readers about which dependencies a module actually uses.

This test AST-walks every module in `backend/arena/routes/`, collects
every imported name, and asserts each one is referenced in the module body
(reference counted via `ast.Name.id` and the root of `ast.Attribute`).

Filter list (whitelisted as allowed dead imports):
  * `logger`  — conventional name; always defined even if not used yet.
  * Anything imported via `from __future__ import annotations` — not a real
    runtime import.
  * `typing` re-exports like `Optional` / `Union` when used as generic
    parameters (rare in routes; the walker picks these up via `ast.Subscript`).

A finding means: the import should be removed.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest


ROUTES_DIR = Path(__file__).resolve().parent.parent / "arena" / "routes"

# Conventional names that every module is allowed to import without using.
_ALLOWED_DEAD = {"logger"}


def _collect_imports(tree: ast.Module) -> set[str]:
    """Return the set of imported names declared in `tree`.

    Captures both `import x` (and `import x as y`) and `from m import x`
    (and `from m import x as y`). Drops `from __future__ import annotations`
    because it's a compile-time directive, not a runtime import.
    """
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            if node.module == "__future__":
                continue
            for alias in node.names:
                names.add(alias.asname or alias.name)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                # `import a.b.c` → use the top-level name 'a'.
                top = (alias.asname or alias.name).split(".")[0]
                names.add(top)
    return names


def _collect_references(tree: ast.Module) -> set[str]:
    """Return the set of bare / root-attribute names referenced in `tree`.

    Also includes every `from <module> import ...` source module — even an
    inline `from datetime import timedelta` proves the module is used, so
    `import datetime` at the top is not dead.
    """
    refs: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            refs.add(node.id)
        elif isinstance(node, ast.Attribute):
            cur = node
            while isinstance(cur, ast.Attribute):
                cur = cur.value
            if isinstance(cur, ast.Name):
                refs.add(cur.id)
        elif isinstance(node, ast.ImportFrom) and node.module:
            # The source module of an inline `from X import Y` is itself
            # a reference (otherwise we couldn't have written it).
            refs.add(node.module.split(".")[0])
    return refs


def _find_dead_imports(py_file: Path) -> set[str]:
    """Return the set of imported names that are never referenced in the body."""
    source = py_file.read_text()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return set()  # let pytest collect errors surface the failure
    imports = _collect_imports(tree)
    refs = _collect_references(tree)
    return (imports - refs) - _ALLOWED_DEAD


def _route_files() -> list[Path]:
    return sorted(p for p in ROUTES_DIR.glob("*.py") if p.name != "__init__.py")


@pytest.mark.parametrize("py_file", _route_files(), ids=lambda p: p.name)
def test_route_module_has_no_dead_imports(py_file: Path):
    """Every `import x` / `from m import x` in a routes/ module must be
    referenced at least once in the module body. A finding means the
    import is dead — please remove it.
    """
    dead = _find_dead_imports(py_file)
    assert not dead, (
        f"{py_file.name} has dead imports: {sorted(dead)}. "
        f"Remove the unused `import` / `from ... import` line."
    )