"""Regression: validate_secrets must log warnings, not print to stdout.

Cycles 14/15 replaced `print()` calls in error handlers with
`logger.exception()`. Cycle 45 extends that to startup-time warnings:

  * `validate_secrets()` runs BEFORE `setup_logging()` is called in
    `main.create_app()` (lines 131-134). At that point Python's root
    logger has no handlers configured.
  * Python's logging module has a LastResort handler that emits
    WARNING+ records to stderr at the default WARNING level — so
    `logger.warning(...)` is visible to operators without `setup_logging()`.
  * `print(...)` writes to stdout, bypasses the structured log format,
    and cannot be filtered, captured, or routed by log shippers.

This test runs `validate_secrets()` with the optional-secret fields
deliberately empty (matching a fresh local checkout) and asserts:
  1. The warnings are emitted through the logging system, not stdout.
  2. The warning messages still appear (LastResort handler) so operators
     running the app still see them — preserving the visibility contract.

If a future contributor reverts these warnings back to `print(...)`,
this test fails.
"""

from __future__ import annotations

import io
import logging
import sys

import pytest


def _make_settings(**overrides):
    """Build a Settings instance with the production hard-fails disabled."""
    from arena.config import Settings

    base = {
        "anthropic_api_key": "sk-ant-test-key-not-real-but-valid-prefix",
        "secret_key": "a" * 40,
        "environment": "development",
        "allowed_origins": "http://localhost:5173",
        "database_url": "",
        "encryption_key": "",
        "frontend_public_url": "http://localhost:5173",
        "openai_api_key": "",
        "razorpay_api_key": "",
        "razorpay_key_secret": "",
        "razorpay_webhook_secret": "",
    }
    base.update(overrides)
    return Settings(**base)


def _capture_warnings(caplog) -> list[logging.LogRecord]:
    """Filter caplog records to WARNING+ emitted from `arena.config`."""
    return [
        r
        for r in caplog.records
        if r.name == "arena.config" and r.levelno >= logging.WARNING
    ]


def test_optional_secret_warnings_emit_via_logger_not_stdout(caplog):
    """With optional secrets empty, validate_secrets must surface each
    missing key through `logger.warning(...)` — not `print(...)`.

    Capturing caplog + redirecting stdout ensures both paths are tested.

    The test attaches an explicit handler to `arena.config` so prior tests
    that may have set `propagate=False` (via setup_logging()) cannot
    silently suppress the warnings from caplog's perspective.
    """
    from arena import config as arena_config

    settings = _make_settings()

    captured = []

    class _CaptureHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            captured.append(record)

    handler = _CaptureHandler(level=logging.WARNING)
    # Save and restore propagate so we don't leak into other tests.
    original_propagate = arena_config.logger.propagate
    arena_config.logger.addHandler(handler)
    arena_config.logger.propagate = True

    stdout_buf = io.StringIO()
    try:
        with caplog.at_level(logging.WARNING, logger="arena.config"):
            original_stdout = sys.stdout
            try:
                sys.stdout = stdout_buf
                settings.validate_secrets()  # must NOT SystemExit in development
            finally:
                sys.stdout = original_stdout
    finally:
        arena_config.logger.removeHandler(handler)
        arena_config.logger.propagate = original_propagate

    captured_stdout = stdout_buf.getvalue()
    captured_messages = " | ".join(r.getMessage() for r in captured)

    # All four optional-secret warnings must surface.
    for needle in (
        "OPENAI_API_KEY not set",
        "RAZORPAY_API_KEY not set",
        "RAZORPAY_KEY_SECRET not set",
        "RAZORPAY_WEBHOOK_SECRET not set",
    ):
        assert needle in captured_messages, (
            f"Expected startup warning {needle!r} via logger; got: {captured_messages!r}. "
            f"validate_secrets() likely regressed to print() — see cycle 14/15."
        )

    # And nothing landed on stdout. If a future contributor switches back
    # to print(), this assertion catches it immediately.
    assert captured_stdout == "", (
        f"validate_secrets() wrote {len(captured_stdout)} chars to stdout "
        f"(expected empty). Use logger.warning(...) so warnings route "
        f"through the logging system. Snippet: {captured_stdout[:200]!r}"
    )


def test_recover_frontend_url_warning_routes_through_logger(caplog):
    """Cycle 47 follow-up: `recover_frontend_public_url_from_cors()` was
    missed by the cycle-45 cleanup — it still called `print("[WARNING] ...")`
    when production started with a localhost FRONTEND_PUBLIC_URL but
    ALLOWED_ORIGINS had a public HTTPS entry to recover from. Same anti-pattern,
    same fix: route through `logger.warning(...)`.

    This test exercises the recovery path by building a Settings with
    is_production-style inputs and asserting the warning surfaces via the
    logger, not stdout.
    """
    from arena import config as arena_config

    captured = []

    class _CaptureHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            captured.append(record)

    handler = _CaptureHandler(level=logging.WARNING)
    original_propagate = arena_config.logger.propagate
    arena_config.logger.addHandler(handler)
    arena_config.logger.propagate = True

    stdout_buf = io.StringIO()
    try:
        with caplog.at_level(logging.WARNING, logger="arena.config"):
            original_stdout = sys.stdout
            try:
                sys.stdout = stdout_buf
                s = _make_settings(
                    environment="production",
                    secret_key="prod-secret-key-" + "x" * 24,
                    database_url="postgresql://user:pass@db/arena",
                    encryption_key="x" * 44,  # invalid Fernet — recovery runs first
                    allowed_origins="https://arena.example.com",
                    frontend_public_url="http://localhost:5173",
                )
                s.recover_frontend_public_url_from_cors()
            finally:
                sys.stdout = original_stdout
    finally:
        arena_config.logger.removeHandler(handler)
        arena_config.logger.propagate = original_propagate

    captured_stdout = stdout_buf.getvalue()
    captured_messages = " | ".join(r.getMessage() for r in captured)

    assert "FRONTEND_PUBLIC_URL was unset or localhost" in captured_messages, (
        f"Expected recovery warning via logger; got: {captured_messages!r}. "
        f"The model_validator regressed to print() — fix with logger.warning(...)."
    )
    assert captured_stdout == "", (
        f"recover_frontend_public_url_from_cors() wrote "
        f"{len(captured_stdout)} chars to stdout (expected empty). "
        f"Snippet: {captured_stdout[:200]!r}"
    )
    assert captured_stdout == "", (
        f"validate_secrets() wrote {len(captured_stdout)} chars to stdout "
        f"(expected empty). Use logger.warning(...) so warnings route "
        f"through the logging system. Snippet: {captured_stdout[:200]!r}"
    )


def test_logger_name_matches_module(monkeypatch):
    """The module logger name must be `arena.config` so tests / external
    tools can target it. This guards against an accidental rename that
    would silently break log filtering."""
    from arena import config

    assert config.logger.name == "arena.config"
    assert isinstance(config.logger, logging.Logger)