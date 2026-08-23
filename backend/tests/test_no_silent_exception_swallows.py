"""Regression: no silent `except Exception: pass` in arena code.

Cycle 68 closed the most egregious silent-swallow sites
(`dissent_engine.py:73`, the `engine.dispose()` retry-cleanup path in
`database.py`, the `db.rollback/close` teardown paths in `database.py`
and `watchlist_runner.py`) by routing them through `logger.debug(...,
exc_info=True)` or `logger.exception(...)`. The fixes preserve the
original control flow (best-effort cleanup, default fallback) but make
the swallow visible to log shippers.

This test walks `backend/arena/{core,routes}/` and flags any
`except Exception: pass` (or `except Exception: <one-liner that
doesn't log>`). The point isn't to ban all `except Exception:` — many
are legitimate and use `logger.exception` already — it's to ban the
specific silent form.

A finding means: the except block should `logger.exception(...,
exc_info=True)` (or `logger.debug` for cleanup paths) so the swallow is
at least observable in production logs.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest


# (subdir, filename) tuples that the test walks. Mirrors the pattern
# from \`test_routes_no_dead_imports.py\` / \`test_route_error_envelope.py\`
# so future additions in any subdir can opt in by adding to this list.
COVERED_DIRS: list[tuple[str, str]] = [
    ("core", "*.py"),
    ("routes", "*.py"),
]

# Sites that are tolerated as-is, each with a one-line reason. New
# entries require a reviewer sign-off; the goal is to shrink this list
# over time, not grow it. Format: (relpath, enclosing_function, reason).
#
# Entries are keyed by the ENCLOSING FUNCTION NAME, not the line number:
# line pins drifted twice (import hoists / logger moves re-flagged old
# sites as "new" swallows) before this table switched to function keys,
# which survive any amount of code moving around above a handler.
#
# Categories of tolerated sites:
#   * `default fallback` — input sanitization or LLM response parsing
#     that returns an empty/default value on bad input; the upstream
#     caller treats that as "no signal" rather than "error".
_TOLERATED: dict[tuple[str, str], str] = {
    ("arena/core/token_crypto.py", "try_decrypt_token"):
        "default fallback — token crypto returns null on decrypt failure",
    ("arena/routes/auth.py", "_payload_exp_seconds"):
        "default fallback — token decode returns null on malformed input",
    ("arena/routes/auth.py", "_owned_refresh_token"):
        "default fallback — refresh-token ownership check treats malformed "
        "input as not-owned rather than erroring",
}


_LOG_METHOD_NAMES = frozenset({
    "debug", "info", "warning", "error", "critical", "exception", "log",
})


def _is_log_call(node: ast.Call) -> bool:
    """True if `node` is a call to a logger method, e.g. `<anything>.error(...)`,
    `<anything>.exception(...)`, `logging.info(...)`, etc.

    Cycle 82 widened this from "must call `logger.<method>(...)`" to "must call
    any receiver's standard logging method." This catches:
      - logger.error(...), _logger.error(...), LOG.error(...)
      - LOGGER.error(...), _LOGGER.error(...)
      - self.logger.error(...)        (attribute chain — receiver is `self.logger`)
      - logging.getLogger(__name__).error(...)
      - logging.error(...), logging.exception(...)

    It still does NOT match `<anything>.print(...)` or arbitrary
    user-defined methods.
    """
    func = node.func
    if not isinstance(func, ast.Attribute):
        return False
    if func.attr not in _LOG_METHOD_NAMES:
        return False
    # Receiver can be anything — `logger`, `_logger`, `logging`, or a chain
    # like `self.logger` / `logging.getLogger(...)`. The method name alone
    # is the strongest signal that this is a logging call.
    return True


def _is_silent_swallow(handler: ast.stmt | list[ast.stmt]) -> bool:
    """Return True if the except handler is a silent swallow (no log call)."""
    body = handler if isinstance(handler, list) else [handler]
    if not body:
        return True  # bare `except: pass` (no body)
    for node in body:
        # Accept any handler that calls a logger method. Walk recursively
        # because the call may be wrapped in `if ...:`.
        for sub in ast.walk(node):
            if isinstance(sub, ast.Call) and _is_log_call(sub):
                return False
    return True


def _enclosing_function(tree: ast.AST, handler: ast.ExceptHandler) -> str:
    """Name of the function directly containing `handler`, or "<module>"."""
    parents: dict[ast.AST, ast.AST] = {}
    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            parents[child] = parent
    node: ast.AST = handler
    while node in parents:
        node = parents[node]
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return node.name
    return "<module>"


def _scan_file(path: Path) -> list[tuple[Path, int, str, str]]:
    """Return (path, line, enclosing_function, reason) for silent swallows."""
    try:
        source = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return []
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError:
        return []
    findings: list[tuple[Path, int, str, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ExceptHandler):
            continue
        func = _enclosing_function(tree, node)
        # The except type must be Exception (broad) — we don't flag
        # `except SomeSpecificError:` because those signal intent.
        if node.type is None:
            # bare `except:` — definitely silent unless the body logs.
            if _is_silent_swallow(node.body):
                findings.append(
                    (path, node.lineno, func, "bare `except:` is silent")
                )
            continue
        type_node = node.type
        type_name: str | None = None
        if isinstance(type_node, ast.Name):
            type_name = type_node.id
        elif isinstance(type_node, ast.Tuple):
            names = [elt.id for elt in type_node.elts if isinstance(elt, ast.Name)]
            if "Exception" in names:
                type_name = "Exception"
        if type_name != "Exception":
            continue
        if _is_silent_swallow(node.body):
            findings.append(
                (
                    path,
                    node.lineno,
                    func,
                    "`except Exception:` body has no logger call",
                )
            )
    return findings


def test_no_silent_exception_swallows() -> None:
    """No silent `except Exception:` swallow in arena/{core,routes}/.

    Every finding MUST either:
      1. Be in `_TOLERATED` with a written rationale (existing tolerated
         sites, with one-line reason for the audit trail), OR
      2. Be fixed by adding `logger.exception(..., exc_info=True)` (or
         `logger.debug(..., exc_info=True)` for best-effort cleanup paths)
         so the swallow is observable in production logs.

    Adding to `_TOLERATED` requires a reviewer to confirm the silent
    swallow is intentional (e.g., the upstream caller treats the result
    as 'no signal' rather than 'error'). The list is meant to shrink
    over time, not grow.
    """
    backend = Path(__file__).resolve().parent.parent
    findings: list[str] = []
    tolerated_but_absent = set(_TOLERATED)
    for subdir, pattern in COVERED_DIRS:
        target = backend / "arena" / subdir
        if not target.exists():
            continue
        for path in target.glob(pattern):
            if path.name == "__init__.py":
                continue
            for fp, line, func, reason in _scan_file(path):
                rel = fp.relative_to(backend).as_posix()
                key = (rel, func)
                tolerated_but_absent.discard(key)
                if key in _TOLERATED:
                    continue
                findings.append(f"{rel}:{line} ({func}): {reason}")
    if findings:
        message = "\n".join(findings)
        pytest.fail(
            f"Found {len(findings)} new silent `except Exception:` swallow(s). "
            f"Add `logger.exception(..., exc_info=True)` (or `logger.debug` "
            f"for cleanup paths) so the swallow is observable in production "
            f"logs. If the silent swallow is intentional, add the "
            f"(path, enclosing_function) to `_TOLERATED` in "
            f"tests/test_no_silent_exception_swallows.py with a one-line "
            f"rationale (and reviewer sign-off).\n{message}",
        )
    if tolerated_but_absent:
        # A tolerated site whose handler vanished (fixed, renamed, or made
        # observable) should be retired from the table by whoever notices —
        # keeping stale entries would let a NEW silent swallow hide behind
        # a dead function name in the same file.
        stale = "\n".join(f"  {rel} :: {fn}" for rel, fn in sorted(tolerated_but_absent))
        pytest.fail(
            f"{len(tolerated_but_absent)} `_TOLERATED` entr(ies) no longer "
            f"match any live silent swallow. Retire them so they cannot "
            f"mask future swallows under the same name:\n{stale}"
        )
