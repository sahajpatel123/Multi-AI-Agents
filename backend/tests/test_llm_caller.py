"""Tests for the LLM caller's pure helpers.

llm_caller wraps Anthropic + OpenAI provider calls with prompt caching
+ retry. The async call paths are integration-tested elsewhere; here we
pin the deterministic helpers:
  - _claude_system_with_cache: prompt-cache breakpoint shape
  - _retryable_anthropic_errors / _retryable_openai_errors: the tuple
    of exception classes that trigger a retry
"""
from __future__ import annotations

import anthropic
import openai

from arena.core.llm_caller import (
    _claude_system_with_cache,
    _retryable_anthropic_errors,
    _retryable_openai_errors,
)


# ── _claude_system_with_cache ────────────────────────────────────


def test_claude_system_with_cache_returns_content_block_list() -> None:
    out = _claude_system_with_cache("You are a helpful assistant.")
    assert isinstance(out, list)
    assert len(out) == 1


def test_claude_system_with_cache_text_field_carries_input() -> None:
    out = _claude_system_with_cache("specific prompt text")
    assert out[0]["type"] == "text"
    assert out[0]["text"] == "specific prompt text"


def test_claude_system_with_cache_uses_ephemeral_cache_control() -> None:
    # Anthropic cache_control types are 'ephemeral' (5-min TTL) and
    # 'persistent' (1-hour TTL). The 5-min default is the right choice
    # for Arena's multi-agent fan-out (4 personas × repeated calls over
    # a short session).
    out = _claude_system_with_cache("x")
    assert out[0]["cache_control"] == {"type": "ephemeral"}


def test_claude_system_with_cache_preserves_long_prompts_verbatim() -> None:
    long_prompt = "X" * 5000  # well above the 4096-char cacheable threshold
    out = _claude_system_with_cache(long_prompt)
    assert out[0]["text"] == long_prompt


def test_claude_system_with_cache_preserves_short_prompts_verbatim() -> None:
    # Short prompts are not cached (below the 1024-token threshold) but
    # the function still wraps them in the structured form — the SDK
    # silently skips caching.
    short = "You are a helpful assistant."
    out = _claude_system_with_cache(short)
    assert out[0]["text"] == short


def test_claude_system_with_cache_top_level_shape_is_stable() -> None:
    # Lock the response shape — the Anthropic SDK requires {type, text,
    # cache_control}. Renaming any key breaks every call.
    out = _claude_system_with_cache("x")
    assert set(out[0].keys()) == {"type", "text", "cache_control"}


# ── _retryable_anthropic_errors ─────────────────────────────────


def test_retryable_anthropic_errors_is_a_tuple() -> None:
    errs = _retryable_anthropic_errors()
    assert isinstance(errs, tuple)


def test_retryable_anthropic_errors_includes_connection_error() -> None:
    errs = _retryable_anthropic_errors()
    assert anthropic.APIConnectionError in errs


def test_retryable_anthropic_errors_includes_rate_limit_error() -> None:
    # 429 RateLimitError must be retryable — too many requests is
    # transient and clears quickly.
    errs = _retryable_anthropic_errors()
    assert anthropic.RateLimitError in errs


def test_retryable_anthropic_errors_includes_internal_server_error() -> None:
    # 5xx server errors are retryable — they often recover on retry.
    errs = _retryable_anthropic_errors()
    assert anthropic.InternalServerError in errs


def test_retryable_anthropic_errors_includes_api_timeout_error() -> None:
    # Timeout is transient — retry with the same params usually succeeds.
    errs = _retryable_anthropic_errors()
    assert anthropic.APITimeoutError in errs


def test_retryable_anthropic_errors_does_not_include_auth_errors() -> None:
    # Auth errors (401, 403, 400) are explicitly NOT in the retry list —
    # they won't succeed on retry, and retrying just delays the user-facing
    # error.
    errs = _retryable_anthropic_errors()
    assert anthropic.AuthenticationError not in errs


# ── _retryable_openai_errors ────────────────────────────────────


def test_retryable_openai_errors_is_a_tuple() -> None:
    errs = _retryable_openai_errors()
    assert isinstance(errs, tuple)


def test_retryable_openai_errors_includes_connection_error() -> None:
    errs = _retryable_openai_errors()
    assert openai.APIConnectionError in errs


def test_retryable_openai_errors_includes_rate_limit_error() -> None:
    errs = _retryable_openai_errors()
    assert openai.RateLimitError in errs


def test_retryable_openai_errors_includes_internal_server_error() -> None:
    errs = _retryable_openai_errors()
    assert openai.InternalServerError in errs


def test_retryable_openai_errors_includes_api_timeout_error() -> None:
    errs = _retryable_openai_errors()
    assert openai.APITimeoutError in errs


def test_retryable_openai_errors_does_not_include_auth_errors() -> None:
    errs = _retryable_openai_errors()
    assert openai.AuthenticationError not in errs


def test_retryable_anthropic_and_openai_lists_have_same_shape() -> None:
    # Both providers should expose a Connection + RateLimit + Status
    # error class in their retry list — locking the symmetry prevents
    # drift between providers.
    a = _retryable_anthropic_errors()
    o = _retryable_openai_errors()
    assert type(a) is type(o) is tuple
    # Same number of entries (typically 3: Connection + RateLimit + Status)
    assert len(a) == len(o)
