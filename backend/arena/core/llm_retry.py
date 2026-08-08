"""Retry with exponential backoff for LLM API calls.

Scope:
- Retry transient failures: 5xx, 408, 429 (rate-limited), timeouts, connection errors.
- Do NOT retry client errors (4xx other than 408/429) — they won't get better.
- Do NOT retry the scorer call (deterministic; failure → fallback path is fine).
- Maximum 3 attempts; total wall-clock cap respected via the caller.

Uses tenacity when available, falls back to a hand-rolled loop otherwise so we
don't pull in a hard dependency for tests.
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Any, Awaitable, Callable, TypeVar

logger = logging.getLogger("arena.llm_retry")

T = TypeVar("T")


# ─── Error classification ──────────────────────────────────────────────────

# Common transient failure modes across SDKs.
try:
    from anthropic import APIStatusError as _AnthropicAPIStatusError
    from anthropic import APIConnectionError as _AnthropicConnError
    from anthropic import APITimeoutError as _AnthropicTimeout
    from openai import APIStatusError as _OpenAIAPIStatusError
    from openai import APIConnectionError as _OpenAIConnError
    from openai import APITimeoutError as _OpenAITimeout
    TRANSIENT_EXCEPTIONS = (
        _AnthropicAPIStatusError,
        _AnthropicConnError,
        _AnthropicTimeout,
        _OpenAIAPIStatusError,
        _OpenAIConnError,
        _OpenAITimeout,
        ConnectionError,
        TimeoutError,
        asyncio.TimeoutError,
    )
except ImportError:
    TRANSIENT_EXCEPTIONS = (ConnectionError, TimeoutError, asyncio.TimeoutError)


def is_retryable(exc: BaseException) -> bool:
    """True if the exception looks like a transient failure worth retrying.

    Recognises both known SDK exception classes and duck-typed exceptions that
    expose ``status_code`` (handy for tests and any third-party SDK we haven't
    imported here).
    """
    # Known SDK exception types — retry regardless of status_code.
    if isinstance(exc, TRANSIENT_EXCEPTIONS):
        status = getattr(exc, "status_code", None)
        if status is not None:
            return status >= 500 or status in (408, 429)
        return True

    # Duck-typed: any exception with a status_code attribute in the retryable
    # range. This lets tests use lightweight fakes and covers future SDKs.
    status = getattr(exc, "status_code", None)
    if status is not None:
        return status >= 500 or status in (408, 429)

    return False


# ─── Retry loop ────────────────────────────────────────────────────────────

async def retry_async(
    fn: Callable[[], Awaitable[T]],
    *,
    max_attempts: int = 3,
    base_delay: float = 0.5,
    max_delay: float = 8.0,
    on_retry: Callable[[int, BaseException, float], None] | None = None,
) -> T:
    """Run an async callable with exponential backoff on transient errors.

    Args:
        fn: The async function to invoke. Should take no arguments; curry with
            functools.partial if needed.
        max_attempts: Total attempts before giving up.
        base_delay: Seconds for the first backoff. Doubles each attempt, capped.
        on_retry: Optional callback (attempt_number, exception, next_delay).

    Returns:
        Whatever `fn` returns on a successful attempt.

    Raises:
        The last exception if all attempts fail.
    """
    last_exc: BaseException | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await fn()
        except BaseException as exc:  # noqa: BLE001
            if attempt >= max_attempts or not is_retryable(exc):
                raise
            last_exc = exc
            delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
            # Jitter to avoid thundering herd.
            delay = delay * (0.75 + random.random() * 0.5)
            logger.warning(
                "[LLM_RETRY] attempt %d/%d failed (%s); retrying in %.2fs",
                attempt,
                max_attempts,
                type(exc).__name__,
                delay,
            )
            if on_retry:
                try:
                    on_retry(attempt, exc, delay)
                except Exception:  # noqa: BLE001
                    logger.warning("on_retry callback failed", exc_info=True)
            await asyncio.sleep(delay)

    # Unreachable, but keeps type checkers happy.
    assert last_exc is not None
    raise last_exc