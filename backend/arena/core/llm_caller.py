"""Provider-aware LLM caller for Claude and OpenAI-compatible APIs."""

import logging
from typing import Any, List, Optional, Union

from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_random_exponential,
)


logger = logging.getLogger(__name__)


def _log_provider_fallback(
    provider: str,
    model_id: str,
    fallback_model_id: str,
    *,
    streaming: bool,
) -> None:
    """Record a fallback without logging prompts or exception details."""
    logger.warning(
        "LLM provider unavailable; using Claude fallback",
        extra={
            "provider": provider,
            "model_id": model_id,
            "fallback_model_id": fallback_model_id,
            "streaming": streaming,
        },
    )


def _log_provider_failure(
    provider: str,
    model_id: str,
    exc: Exception,
) -> None:
    """Record safe, low-cardinality diagnostics for a failed provider call."""
    logger.warning(
        "LLM provider call failed",
        extra={
            "provider": provider,
            "model_id": model_id,
            "error_type": type(exc).__name__,
        },
    )


def _get_claude_fallback() -> tuple[Any, str]:
    from arena.core.model_router import get_fallback_model

    fallback = get_fallback_model()
    return fallback["client"], str(fallback["model_id"])


def _claude_system_with_cache(system_prompt: str) -> Union[str, List[dict]]:
    """Wrap system_prompt with an Anthropic prompt-cache breakpoint.

    Anthropic prompt caching stores up to 4 cache breakpoints per request
    for 5 minutes by default. Cache reads cost ~10% of normal input tokens.
    For the Arena multi-agent fan-out (4 personas × repeated requests over
    a session), the persona system prompt is the prefix that stays identical
    across every call — so caching it cuts input token cost by an order of
    magnitude on cache hits.

    The Anthropic SDK accepts ``system`` as either a plain string or an array
    of content blocks; only the structured form supports ``cache_control``.
    For prompts shorter than the minimum cacheable length (1024 tokens /
    ~4096 chars), the SDK silently skips caching — no harm, just a slightly
    larger request envelope.
    """
    return [
        {
            "type": "text",
            "text": system_prompt,
            "cache_control": {"type": "ephemeral"},
        }
    ]


# Transient errors worth retrying: Anthropic / OpenAI surface these as
# specific exception classes. We don't retry on 4xx other than 429
# (rate limits), 401/403 (auth), or 400 (bad request) — those won't
# succeed on retry and just delay the user-facing error.
def _retryable_anthropic_errors():
    try:
        from anthropic import (
            APIConnectionError,
            APITimeoutError,
            InternalServerError,
            RateLimitError,
        )
        return (APIConnectionError, APITimeoutError, InternalServerError, RateLimitError)
    except ImportError:
        return ()


def _retryable_openai_errors():
    try:
        from openai import (
            APIConnectionError,
            APITimeoutError,
            InternalServerError,
            RateLimitError,
        )
        return (APIConnectionError, APITimeoutError, InternalServerError, RateLimitError)
    except ImportError:
        return ()


async def _retry_call(coro_factory, retryable_excs):
    """Run an awaitable factory with exponential-backoff retry on transient errors.

    ``coro_factory`` is a zero-arg callable that returns a fresh coroutine
    each invocation — required because Python coroutines cannot be awaited
    twice. ``retryable_excs`` is a tuple of exception types to retry on;
    anything else bubbles up immediately.
    """
    if not retryable_excs:
        return await coro_factory()
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(4),
        wait=wait_random_exponential(multiplier=0.5, max=8),
        retry=retry_if_exception_type(retryable_excs),
        reraise=True,
    ):
        with attempt:
            return await coro_factory()


async def call_llm(
    client: Any,
    provider: str,
    model_id: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int = 1000,
    claude_user_content: Optional[List[dict]] = None,
) -> tuple[str, int, int]:
    """
    Call LLM with provider-specific format. Retries transient provider errors
    (429/500/503/connection/timeout) with exponential backoff + jitter.

    If ``claude_user_content`` is set (Claude only), it replaces the string user
    message with a list of content blocks (text + images).

    Returns:
        (generated text, input_tokens, output_tokens). On failure, ("", 0, 0).
    """
    try:
        if provider == "claude":
            user_content: Union[str, List[dict]] = (
                claude_user_content if claude_user_content is not None else user_prompt
            )

            async def _do():
                return await client.messages.create(
                    model=model_id,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    system=_claude_system_with_cache(system_prompt),
                    messages=[{"role": "user", "content": user_content}],
                )

            response = await _retry_call(_do, _retryable_anthropic_errors())
            text = ""
            if response.content:
                text = response.content[0].text or ""
            u = getattr(response, "usage", None)
            inp = int(getattr(u, "input_tokens", 0) or 0) if u else 0
            out = int(getattr(u, "output_tokens", 0) or 0) if u else 0
            return text, inp, out

        if provider in {"grok", "openai", "deepseek"}:
            if client is None:
                fallback_client, fallback_model_id = _get_claude_fallback()
                _log_provider_fallback(
                    provider,
                    model_id,
                    fallback_model_id,
                    streaming=False,
                )
                return await call_llm(
                    client=fallback_client,
                    provider="claude",
                    model_id=fallback_model_id,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )

            request_options = (
                {"extra_body": {"thinking": {"type": "disabled"}}}
                if provider == "deepseek"
                else {}
            )

            async def _do_openai():
                return await client.chat.completions.create(
                    model=model_id,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    **request_options,
                )

            response = await _retry_call(_do_openai, _retryable_openai_errors())
            choice0 = response.choices[0] if response.choices else None
            msg = choice0.message if choice0 else None
            text = (msg.content or "") if msg else ""
            u = getattr(response, "usage", None)
            inp = int(getattr(u, "prompt_tokens", 0) or 0) if u else 0
            out = int(getattr(u, "completion_tokens", 0) or 0) if u else 0
            return text, inp, out

        raise ValueError(
            f"Unknown provider: {provider}. Must be claude, grok, openai, or deepseek."
        )
    except Exception as exc:
        logger.debug(
            "LLM provider failure traceback",
            extra={"provider": provider, "model_id": model_id},
            exc_info=True,
        )
        _log_provider_failure(provider, model_id, exc)
        return "", 0, 0


async def call_llm_streaming(
    client: Any,
    provider: str,
    model_id: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int = 1000,
):
    """
    Call LLM with streaming and provider-specific format. Retries on
    transient provider errors before opening the stream; mid-stream
    disconnects fall through to ``anthropic.APIError`` which the SSE
    handler converts to an error event for the client.

    Yields:
        Text chunks as they arrive
    """
    if provider == "claude":
        # Anthropic streaming format with prompt caching on the system
        # prefix (persona + scoring rubric + tool docs). Cache hits
        # return at ~10% of input-token cost and ~85% lower latency.
        async def _do():
            return client.messages.stream(
                model=model_id,
                max_tokens=max_tokens,
                temperature=temperature,
                system=_claude_system_with_cache(system_prompt),
                messages=[{"role": "user", "content": user_prompt}],
            )

        stream_cm = await _retry_call(_do, _retryable_anthropic_errors())
        async with stream_cm as stream:
            async for text in stream.text_stream:
                yield text

    elif provider in {"grok", "openai", "deepseek"}:
        if client is None:
            fallback_client, fallback_model_id = _get_claude_fallback()
            _log_provider_fallback(
                provider,
                model_id,
                fallback_model_id,
                streaming=True,
            )
            async for text in call_llm_streaming(
                client=fallback_client,
                provider="claude",
                model_id=fallback_model_id,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            ):
                yield text
            return
        # OpenAI-compatible streaming format. V4 Flash defaults to thinking,
        # which would ignore persona temperatures and emit separate reasoning
        # chunks, so Arena explicitly uses non-thinking mode for this path.
        request_options = (
            {"extra_body": {"thinking": {"type": "disabled"}}}
            if provider == "deepseek"
            else {}
        )

        async def _do_openai_stream():
            return await client.chat.completions.create(
                model=model_id,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                stream=True,
                **request_options,
            )

        stream = await _retry_call(_do_openai_stream, _retryable_openai_errors())
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    else:
        raise ValueError(
            f"Unknown provider: {provider}. Must be claude, grok, openai, or deepseek."
        )
