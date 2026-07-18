"""Provider failure and fallback observability contracts."""

from __future__ import annotations

import logging
from types import SimpleNamespace

import pytest

import arena.core.llm_caller as llm_caller


def _find_record(records, message: str):
    """Locate the first caplog record whose message matches.

    Uses a list-comprehension lookup (not ``next()`` over a generator)
    because the tests are declared ``async`` and PEP 479 promotes a
    leaked ``StopIteration`` from a generator inside a coroutine into a
    ``RuntimeError``, masking the real assertion failure.
    """
    matching = [r for r in records if r.message == message]
    assert matching, (
        f"expected a caplog record with message {message!r}; "
        f"got {[r.message for r in records]!r}"
    )
    return matching[0]


@pytest.mark.asyncio
async def test_provider_failure_is_logged_without_exception_details(caplog, capsys):
    class FailingCompletions:
        async def create(self, **kwargs):
            raise RuntimeError("provider response contains a secret detail")

    client = SimpleNamespace(chat=SimpleNamespace(completions=FailingCompletions()))
    caplog.set_level(logging.WARNING, logger="arena.core.llm_caller")

    result = await llm_caller.call_llm(
        client=client,
        provider="openai",
        model_id="gpt-test",
        system_prompt="system",
        user_prompt="user prompt",
        temperature=0.2,
    )

    assert result == ("", 0, 0)
    record = _find_record(caplog.records, "LLM provider call failed")
    assert record.provider == "openai"
    assert record.model_id == "gpt-test"
    assert record.error_type == "RuntimeError"
    assert "secret detail" not in caplog.text
    assert capsys.readouterr().out == ""


@pytest.mark.asyncio
async def test_provider_fallback_uses_structured_warning(caplog, capsys, monkeypatch):
    async def create(**kwargs):
        return SimpleNamespace(
            content=[SimpleNamespace(text="fallback response")],
            usage=SimpleNamespace(input_tokens=3, output_tokens=2),
        )

    fallback_client = SimpleNamespace(messages=SimpleNamespace(create=create))
    monkeypatch.setattr(
        llm_caller,
        "_get_claude_fallback",
        lambda: (fallback_client, "claude-test"),
    )
    caplog.set_level(logging.WARNING, logger="arena.core.llm_caller")

    result = await llm_caller.call_llm(
        client=None,
        provider="deepseek",
        model_id="deepseek-test",
        system_prompt="system",
        user_prompt="user prompt",
        temperature=0.2,
    )

    assert result == ("fallback response", 3, 2)
    record = _find_record(
        caplog.records, "LLM provider unavailable; using Claude fallback"
    )
    assert record.provider == "deepseek"
    assert record.model_id == "deepseek-test"
    assert record.fallback_model_id == "claude-test"
    assert record.streaming is False
    assert capsys.readouterr().out == ""


@pytest.mark.asyncio
async def test_streaming_provider_fallback_is_logged(caplog, capsys, monkeypatch):
    class FakeStream:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        @property
        def text_stream(self):
            async def chunks():
                yield "streamed fallback"

            return chunks()

    fallback_client = SimpleNamespace(
        messages=SimpleNamespace(stream=lambda **kwargs: FakeStream())
    )
    monkeypatch.setattr(
        llm_caller,
        "_get_claude_fallback",
        lambda: (fallback_client, "claude-stream-test"),
    )
    caplog.set_level(logging.WARNING, logger="arena.core.llm_caller")

    chunks = [
        chunk
        async for chunk in llm_caller.call_llm_streaming(
            client=None,
            provider="grok",
            model_id="grok-test",
            system_prompt="system",
            user_prompt="user prompt",
            temperature=0.2,
        )
    ]

    assert chunks == ["streamed fallback"]
    record = _find_record(
        caplog.records, "LLM provider unavailable; using Claude fallback"
    )
    assert record.provider == "grok"
    assert record.model_id == "grok-test"
    assert record.fallback_model_id == "claude-stream-test"
    assert record.streaming is True
    assert capsys.readouterr().out == ""
