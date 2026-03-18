"""Provider-aware LLM caller for Claude and OpenAI-compatible APIs."""

from typing import Any


def _get_claude_fallback() -> tuple[Any, str]:
    from arena.core.model_router import get_fallback_model

    fallback = get_fallback_model()
    return fallback["client"], str(fallback["model_id"])


async def call_llm(
    client: Any,
    provider: str,
    model_id: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int = 1000,
) -> str:
    """
    Call LLM with provider-specific format.
    
    Args:
        client: Either AsyncAnthropic or AsyncOpenAI client
        provider: "claude", "grok", "openai", or "deepseek"
        model_id: Model identifier
        system_prompt: System prompt text
        user_prompt: User prompt text
        temperature: Temperature for generation
        max_tokens: Max tokens to generate
    
    Returns:
        Generated text response
    """
    if provider == "claude":
        # Anthropic format
        response = await client.messages.create(
            model=model_id,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return response.content[0].text
    
    elif provider in {"grok", "openai", "deepseek"}:
        if client is None:
            fallback_client, fallback_model_id = _get_claude_fallback()
            print(f"[FALLBACK] {provider} client not initialized, using Claude")
            return await call_llm(
                client=fallback_client,
                provider="claude",
                model_id=fallback_model_id,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        # OpenAI-compatible chat completions format
        response = await client.chat.completions.create(
            model=model_id,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        return response.choices[0].message.content
    
    else:
        raise ValueError(
            f"Unknown provider: {provider}. Must be claude, grok, openai, or deepseek."
        )


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
    Call LLM with streaming and provider-specific format.
    
    Args:
        client: Either AsyncAnthropic or AsyncOpenAI client
        provider: "claude", "grok", "openai", or "deepseek"
        model_id: Model identifier
        system_prompt: System prompt text
        user_prompt: User prompt text
        temperature: Temperature for generation
        max_tokens: Max tokens to generate
    
    Yields:
        Text chunks as they arrive
    """
    if provider == "claude":
        # Anthropic streaming format
        async with client.messages.stream(
            model=model_id,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        ) as stream:
            async for text in stream.text_stream:
                yield text
    
    elif provider in {"grok", "openai", "deepseek"}:
        if client is None:
            fallback_client, fallback_model_id = _get_claude_fallback()
            print(f"[FALLBACK] {provider} client not initialized, using Claude streaming fallback")
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
        # OpenAI-compatible streaming format
        stream = await client.chat.completions.create(
            model=model_id,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    
    else:
        raise ValueError(
            f"Unknown provider: {provider}. Must be claude, grok, openai, or deepseek."
        )
