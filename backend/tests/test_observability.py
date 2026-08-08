"""Tests for the structured logging helpers.

observability.py configures JSON-formatted daily-rotating logs and
provides request-scoped helpers (new_request_id, log_request, etc.).
Drift here means either:
  - setup_logging adds duplicate handlers on every startup
  - new_request_id returns the wrong shape
  - log_* helpers crash on missing fields

The async log helpers (log_drift_result, log_scoring_result, log_ux_event)
are integration-tested elsewhere; here we pin the sync primitives.
"""
from __future__ import annotations

import json
import logging
from unittest.mock import MagicMock, patch

import pytest

from arena.core import observability
from arena.core.observability import (
    log_agent_timeout,
    log_rate_limit_hit,
    log_request,
    log_toxicity_rejection,
    log_unhandled_exception,
    new_request_id,
)


# ── new_request_id ─────────────────────────────────────────────


def test_new_request_id_returns_a_uuid_string() -> None:
    rid = new_request_id()
    assert isinstance(rid, str)
    # Standard UUID4 format: 36 chars with hyphens
    assert len(rid) == 36
    assert rid.count("-") == 4


def test_new_request_id_is_unique_per_call() -> None:
    a = new_request_id()
    b = new_request_id()
    assert a != b


def test_new_request_id_returns_valid_uuid_object() -> None:
    import uuid

    rid = new_request_id()
    # uuid.UUID() parses the string back — proves it's a real UUID
    uuid.UUID(rid)


# ── log_request ────────────────────────────────────────────────


@pytest.fixture
def arena_logger_with_buffer():
    """Wire a MemoryHandler onto the 'arena.requests' logger and yield it
    so tests can assert on captured log records without polluting the
    real handler stack."""
    logger = logging.getLogger("arena.requests")
    records: list[logging.LogRecord] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    cap = _Capture(level=logging.INFO)
    logger.addHandler(cap)
    original_propagate = logger.propagate
    logger.propagate = False
    try:
        yield logger, records
    finally:
        logger.removeHandler(cap)
        logger.propagate = original_propagate


def test_log_request_runs_without_crashing() -> None:
    # The structured payload is emitted via the arena.requests logger
    # with extra=… fields consumed by the JSON formatter. We pin that the
    # helper accepts the full documented argument set and does not raise.
    log_request(
        request_id="req-1",
        user_id="u-1",
        prompt_length=100,
        prompt_category="market",
        agent_timings_ms={"agent_1": 1000, "agent_2": 1500},
        total_processing_ms=2500,
        winner_agent_id="agent_1",
        input_tokens=200,
        output_tokens=300,
        estimated_cost_usd=0.005,
    )


def test_log_request_with_optional_errors_and_warnings_runs_without_crashing() -> None:
    log_request(
        request_id="req-1",
        user_id="u-1",
        prompt_length=100,
        prompt_category="market",
        agent_timings_ms={"agent_1": 1000},
        total_processing_ms=1000,
        winner_agent_id="agent_1",
        input_tokens=100,
        output_tokens=200,
        estimated_cost_usd=0.001,
        errors=["rate_limited", "timeout"],
        warnings=["slow_agent"],
    )


# ── log_toxicity_rejection ──────────────────────────────────────


def test_log_toxicity_rejection_runs_without_crashing(caplog) -> None:
    caplog.set_level(logging.WARNING, logger="arena.requests")
    log_toxicity_rejection(request_id="req-1", user_id="u-1", reason="test reason")
    # The helper runs without raising; whether it logs depends on the
    # surrounding logger config.
    # No assertion on log content — pin behavior at the no-crash level.


# ── log_rate_limit_hit ───────────────────────────────────────────


def test_log_rate_limit_hit_runs_without_crashing(caplog) -> None:
    caplog.set_level(logging.WARNING, logger="arena.requests")
    log_rate_limit_hit(
        request_id="req-1", user_id="u-1", tier="plus", used=15, limit=15
    )


# ── log_agent_timeout ───────────────────────────────────────────


def test_log_agent_timeout_runs_without_crashing(caplog) -> None:
    caplog.set_level(logging.WARNING, logger="arena.requests")
    log_agent_timeout(request_id="req-1", agent_id="agent_1", timeout_seconds=30)


# ── log_unhandled_exception ─────────────────────────────────────


def test_log_unhandled_exception_runs_without_crashing(caplog) -> None:
    caplog.set_level(logging.ERROR, logger="arena.requests")
    log_unhandled_exception(
        request_id="req-1", user_id="u-1", exc=RuntimeError("boom")
    )


# ── setup_logging idempotency ───────────────────────────────────


def test_setup_logging_does_not_duplicate_handlers(monkeypatch) -> None:
    # The arena logger must NOT accumulate handlers across repeated
    # startup calls — otherwise log volume doubles per restart.
    import arena.core.observability as obs_mod

    # Reset the arena logger to a clean state so we can count handlers
    # before + after.
    arena_logger = logging.getLogger("arena")
    # Snapshot the original handler list length + propagate flag so we can
    # restore both after the test. setup_logging() sets propagate=False,
    # which would otherwise leak into contract tests that rely on caplog
    # (e.g. test_rooms_touch_member_safe) — those run after this one in
    # alphabetical order and would lose log records to the root logger.
    original_handlers = list(arena_logger.handlers)
    original_propagate = arena_logger.propagate

    # Patch the file handler creation to fail-safe in this environment
    # (no writable log directory needed for the idempotency check).
    try:
        with patch.object(obs_mod, "_LOG_FILE", "/tmp/arena_observability_test.log"):
            obs_mod.setup_logging()
            after_first = list(arena_logger.handlers)
            obs_mod.setup_logging()
            after_second = list(arena_logger.handlers)

        # Calling setup_logging twice must NOT add new handlers
        assert len(after_second) == len(after_first)
    finally:
        # Restore the original logger state so subsequent tests that rely
        # on root-logger propagation (caplog) keep working.
        arena_logger.propagate = original_propagate
        # Trim any handlers the test added to keep the side-effects out of
        # the rest of the suite.
        for h in arena_logger.handlers:
            if h not in original_handlers:
                arena_logger.removeHandler(h)
