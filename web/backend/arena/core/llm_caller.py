"""Provider-aware LLM caller for Claude and OpenAI-compatible APIs."""

from typing import Any, List, Optional, Union


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
    claude_user_content: Optional[List[dict]] = None,
) -> tuple[str, int, int]:
    """
    Call LLM with provider-specific format.

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
            response = await client.messages.create(
                model=model_id,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_prompt,
                messages=[{"role": "user", "content": user_content}],
            )
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
            response = await client.chat.completions.create(
                model=model_id,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
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
    except Exception:
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
    Call LLM with streaming and provider-specific format.

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
