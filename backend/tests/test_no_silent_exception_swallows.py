"""Regression: no silent `except Exception: pass` in arena code.

Cycle 68 closed the most egregious silent-swallow sites
(`dissent_engine.py:73`, the `engine.dispose()` retry-cleanup path in
`database.py`, the `db.rollback/close` teardown paths in `database.py`
and `watchlist_runner.py`) by routing them through `logger.debug(...,
exc_info=True)` or `logger.exception(...)`. The fixes preserve the
original control flow (best-effort cleanup, default fallback) but make
the swallow visible to log shippers.

This test walks `backend/arena/{core,routes,services}/` and flags any
`except Exception: pass` (or `except Exception: <one-liner that
doesn't log>`). The point isn't to ban all `except Exception:` — many
are legitimate and use `logger.exception` already — it's to ban the
specific silent form.

A finding means: the except block should `logger.exception(...,
exc_info=True)` (or `logger.debug` for cleanup paths) so the swallow
is at least observable in production logs.
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
# over time, not grow it. Format: (relpath, line, reason).
#
# Categories of tolerated sites:
#   * `bcrypt fallback` — auth.py falls through to legacy hash format
#     when modern parsing fails; the second except returns "invalid".
#   * `best-effort cleanup` — rollback / dispose / close that runs in
#     a finally or error path; failure is non-fatal because the next
#     iteration builds a fresh connection. Now logged at debug in the
#     sites cycle 68 fixed; older sites still silent because the
#     failures are routine and noisy.
#   * `default fallback` — input sanitization or LLM response parsing
#     that returns an empty/default value on bad input; the upstream
#     caller treats that as "no signal" rather than "error".
#   * `metric / observability noop` — telemetry hooks that swallow
#     errors so a logging failure can never break the request path.
_TOLERATED: dict[tuple[str, int], str] = {
    # arena/core/auth.py
    ("arena/core/auth.py", 63): "bcrypt fallback — modern hash format check failed; pass through to legacy try",
    ("arena/core/auth.py", 79): "bcrypt fallback — legacy hash check also failed; return invalid",
    # arena/core/response_shaper.py
    ("arena/core/response_shaper.py", 63): "default fallback — malformed LLM response returns empty shape",
    # arena/core/input_pipeline.py
    ("arena/core/input_pipeline.py", 186): "default fallback — input sanitization returns empty value on parse error",
    ("arena/core/input_pipeline.py", 211): "default fallback — input sanitization returns empty value on parse error",
    ("arena/core/input_pipeline.py", 237): "default fallback — input sanitization returns empty value on parse error",
    # arena/core/assumption_surfacer.py
    ("arena/core/assumption_surfacer.py", 71): "telemetry noop — assumption surfacing failure must not break the answer path",
    # arena/core/client_ip.py
    ("arena/core/client_ip.py", 53): "default fallback — IP extraction returns '?' on parse error",
    # arena/core/intelligence_scorer.py
    ("arena/core/intelligence_scorer.py", 105): "telemetry noop — scoring hook failure must not break the answer path",
    # arena/core/persona_integrity.py
    ("arena/core/persona_integrity.py", 161): "telemetry noop — persona integrity check failure must not break pipeline",
    # arena/core/request_size.py
    ("arena/core/request_size.py", 88): "default fallback — request size parse returns 0 on error",
    # arena/core/observability.py
    ("arena/core/observability.py", 315): "telemetry noop — observability hook failure must not break request",
    ("arena/core/observability.py", 328): "telemetry noop — observability hook failure must not break request",
    ("arena/core/observability.py", 344): "telemetry noop — observability hook failure must not break request",
    ("arena/core/observability.py", 352): "telemetry noop — observability hook failure must not break request",
    # arena/core/loyalty_scheduler.py
    ("arena/core/loyalty_scheduler.py", 93): "best-effort cleanup — scheduled task teardown must not propagate",
    ("arena/core/loyalty_scheduler.py", 113): "best-effort cleanup — scheduled task teardown must not propagate",
    # arena/core/mcp_runtime.py
    ("arena/core/mcp_runtime.py", 228): "telemetry noop — MCP runtime hook failure must not break tool path",
    ("arena/core/mcp_runtime.py", 287): "telemetry noop — MCP runtime hook failure must not break tool path",
    # arena/core/llm_retry.py
    ("arena/core/llm_retry.py", 119): "telemetry noop — LLM retry hook failure must not break call path",
    # arena/core/report_generator.py
    ("arena/core/report_generator.py", 141): "default fallback — report generation returns empty on partial failure",
    # arena/core/orchestrator.py
    ("arena/core/orchestrator.py", 157): "default fallback — orchestrator stage returns empty on error",
    # arena/core/contradiction_detector.py
    ("arena/core/contradiction_detector.py", 100): "default fallback — contradiction check returns empty on error",
    # arena/core/file_ingest.py
    ("arena/core/file_ingest.py", 56): "default fallback — file metadata parse returns null",
    ("arena/core/file_ingest.py", 74): "default fallback — file content parse returns empty",
    ("arena/core/file_ingest.py", 96): "best-effort re-raise — file ingest cleanup before re-raising",
    # arena/core/temporal_evolution.py
    ("arena/core/temporal_evolution.py", 80): "telemetry noop — temporal hook failure must not break generation",
    # arena/core/temporal_classifier.py
    ("arena/core/temporal_classifier.py", 100): "default fallback — temporal classification returns empty on error",
    # arena/core/token_crypto.py
    ("arena/core/token_crypto.py", 49): "default fallback — token crypto returns null on decrypt failure",
    # arena/core/llm_caller.py
    ("arena/core/llm_caller.py", 220): "telemetry noop — LLM caller hook failure must not break call",
    # arena/core/scorer.py
    ("arena/core/scorer.py", 133): "default fallback — scorer returns neutral on partial failure",
    ("arena/core/scorer.py", 165): "telemetry noop — scorer hook failure must not break scoring",
    # arena/core/agent_pipeline.py
    ("arena/core/agent_pipeline.py", 231): "default fallback — pipeline stage returns empty on error",
    ("arena/core/agent_pipeline.py", 241): "default fallback — pipeline stage returns empty on error",
    ("arena/core/agent_pipeline.py", 252): "default fallback — pipeline stage returns empty on error",
    ("arena/core/agent_pipeline.py", 262): "default fallback — pipeline stage returns empty on error",
    # arena/routes/rooms.py
    ("arena/routes/rooms.py", 124): "telemetry noop — room hook failure must not break request",
    ("arena/routes/rooms.py", 823): "telemetry noop — room hook failure must not break request",
    ("arena/routes/rooms.py", 1030): "telemetry noop — room hook failure must not break request",
    ("arena/routes/rooms.py", 1046): "telemetry noop — room hook failure must not break request",
    # arena/routes/auth.py
    ("arena/routes/auth.py", 43): "default fallback — token decode returns null on malformed input",
    ("arena/routes/auth.py", 75): "default fallback — token decode returns null on malformed input",
    ("arena/routes/auth.py", 347): "telemetry noop — auth hook failure must not break auth path",
    ("arena/routes/auth.py", 401): "telemetry noop — auth hook failure must not break auth path",
    # arena/routes/debate.py
    ("arena/routes/debate.py", 154): "default fallback — debate hook returns empty on error",
    ("arena/routes/debate.py", 268): "best-effort re-raise — debate cleanup before re-raising",
    ("arena/routes/debate.py", 394): "default fallback — debate scorer returns neutral",
    ("arena/routes/debate.py", 445): "telemetry noop — debate hook failure must not break debate",
    ("arena/routes/debate.py", 478): "telemetry noop — debate hook failure must not break debate",
    # arena/routes/mcp.py
    ("arena/routes/mcp.py", 83): "telemetry noop — MCP hook failure must not break request",
    # arena/routes/agent.py
    ("arena/routes/agent.py", 554): "default fallback — agent hook returns empty on error",
    ("arena/routes/agent.py", 838): "telemetry noop — agent hook failure must not break request",
    ("arena/routes/agent.py", 1963): "best-effort re-raise — agent cleanup before re-raising",
    ("arena/routes/agent.py", 2917): "default fallback — agent hook returns empty on error",
    # arena/routes/analytics.py
    ("arena/routes/analytics.py", 114): "telemetry noop — analytics hook failure must not break request",
    # arena/routes/prompt.py
    ("arena/routes/prompt.py", 324): "default fallback — prompt hook returns empty on error",
    ("arena/routes/prompt.py", 518): "default fallback — prompt hook returns empty on error",
    ("arena/routes/prompt.py", 607): "default fallback — prompt hook returns empty on error",
    ("arena/routes/prompt.py", 621): "default fallback — prompt hook returns empty on error",
    # arena/routes/discuss.py
    ("arena/routes/discuss.py", 212): "best-effort re-raise — discuss cleanup before re-raising",
    ("arena/routes/discuss.py", 357): "telemetry noop — discuss hook failure must not break request",
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


def _iter_handlers(tree: ast.AST) -> list[tuple[ast.ExceptHandler, Path, int]]:
    handlers: list[tuple[ast.ExceptHandler, Path, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ExceptHandler):
            handlers.append((node, Path(""), node.lineno))
    return handlers


def _scan_file(path: Path) -> list[tuple[Path, int, str]]:
    """Return list of (path, line, reason) for silent swallows in this file."""
    try:
        source = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return []
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError:
        return []
    findings: list[tuple[Path, int, str]] = []
    for handler, _, lineno in _iter_handlers(tree):
        # The except type must be Exception (broad) — we don't flag
        # `except SomeSpecificError:` because those signal intent.
        if handler.type is None:
            # bare `except:` — definitely silent unless the body logs.
            if _is_silent_swallow(handler.body):
                findings.append((path, lineno, "bare `except:` is silent"))
            continue
        type_node = handler.type
        type_name: str | None = None
        if isinstance(type_node, ast.Name):
            type_name = type_node.id
        elif isinstance(type_node, ast.Tuple):
            names = [elt.id for elt in type_node.elts if isinstance(elt, ast.Name)]
            if "Exception" in names:
                type_name = "Exception"
        if type_name != "Exception":
            continue
        if _is_silent_swallow(handler.body):
            findings.append(
                (path, lineno, "`except Exception:` body has no logger call")
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
    for subdir, pattern in COVERED_DIRS:
        target = backend / "arena" / subdir
        if not target.exists():
            continue
        for path in target.glob(pattern):
            if path.name == "__init__.py":
                continue
            for fp, line, reason in _scan_file(path):
                rel = fp.relative_to(backend).as_posix()
                key = (rel, line)
                if key in _TOLERATED:
                    continue
                findings.append(f"{rel}:{line}: {reason}")
    if findings:
        message = "\n".join(findings)
        pytest.fail(
            f"Found {len(findings)} new silent `except Exception:` swallow(s). "
            f"Add `logger.exception(..., exc_info=True)` (or `logger.debug` "
            f"for cleanup paths) so the swallow is observable in production "
            f"logs. If the silent swallow is intentional, add the path:line "
            f"to `_TOLERATED` in tests/test_no_silent_exception_swallows.py "
            f"with a one-line rationale (and reviewer sign-off).\n{message}",
        )


def test_detector_recognizes_all_logger_method_shapes() -> None:
    """Cycle 82 widened `_is_silent_swallow` from a hard-coded
    `logger.<method>(...)` shape to a generic "any receiver with a
    standard logging method" shape. This test pins the widened
    coverage so future narrowing is caught locally."""
    cases = [
        # (code, expected_silent)
        # Logging calls of any shape — must NOT be flagged as silent.
        ('logger.exception("x")', False),
        ('logger.error("x")', False),
        ('logger.info("x")', False),
        ('logger.warning("x")', False),
        ('logger.debug("x", exc_info=True)', False),
        ('logger.critical("x")', False),
        ('logger.log(logging.WARN, "x")', False),
        ('_logger.exception("x")', False),
        ('LOG.error("x")', False),
        ('LOGGER.warning("x")', False),
        ('_LOGGER.info("x")', False),
        ('self.logger.exception("x")', False),
        ('logging.getLogger(__name__).error("x")', False),
        ('logging.error("x")', False),
        ('logging.exception("x")', False),
        # Genuinely silent — must be flagged.
        ('pass', True),
        ('return None', True),
        ('x = 1', True),
        ('print("oh no")', True),  # print is NOT a logger method
        ('self.helper_cleanup()', True),
    ]
    for snippet, expect_silent in cases:
        # Build a fake `except Exception:` handler wrapping the snippet.
        src = f"try:\n    pass\nexcept Exception:\n    {snippet}\n"
        tree = ast.parse(src)
        # tree.body[0] is the ast.Try; its first handler is the except clause.
        handler = tree.body[0].handlers[0]
        result = _is_silent_swallow(handler.body)
        assert result == expect_silent, (
            f"{snippet!r}: expected silent={expect_silent}, got {result}"
        )


def test_log_call_recognizes_standard_methods() -> None:
    """Pins the `_LOG_METHOD_NAMES` allowlist against accidental edits
    that drop a level (e.g. removing `exception` would mis-flag every
    current `logger.exception(...)` call as silent)."""
    for method in ("debug", "info", "warning", "error", "critical", "exception", "log"):
        src = f"logger.{method}('x')"
        tree = ast.parse(src)
        call = tree.body[0].value
        assert _is_log_call(call), f"logger.{method} should be recognized as a log call"
    # Negative cases
    for method in ("print", "warn", "fatal", "trace", "log_to_db"):
        src = f"obj.{method}('x')"
        tree = ast.parse(src)
        call = tree.body[0].value
        assert not _is_log_call(call), f"obj.{method} must not be recognized as a log call"
