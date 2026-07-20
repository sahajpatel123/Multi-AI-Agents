"""Unit tests for arena.core.temporal_classifier parse + fallback paths."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from arena.core import temporal_classifier as tc


@pytest.mark.asyncio
async def test_fallback_on_api_failure(monkeypatch):
    client = MagicMock()
    client.chat.completions.create = AsyncMock(side_effect=RuntimeError("down"))

    import openai

    monkeypatch.setattr(openai, "AsyncOpenAI", lambda **kwargs: client)

    class _S:
        deepseek_api_key = "sk-test"

    monkeypatch.setattr("arena.config.get_settings", lambda: _S())

    out = await tc.classify_temporal("q", "answer")
    assert out["decay_class"] == "durable"
    assert out["half_life"] == "2–5 years"
    assert out["recheck_by"] is None
    assert out["time_sensitive_claims"] == []


@pytest.mark.asyncio
async def test_parses_decay_classes_and_half_life(monkeypatch):
    payload = {
        "decay_class": "perishable",
        "decay_reason": "Prices move daily.",
        "time_sensitive_claims": ["BTC is at $X", "ETF flows hot"],
    }
    response = MagicMock()
    response.choices = [
        MagicMock(message=MagicMock(content=__import__("json").dumps(payload)))
    ]
    client = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=response)

    import openai

    monkeypatch.setattr(openai, "AsyncOpenAI", lambda **kwargs: client)

    class _S:
        deepseek_api_key = "sk-test"

    monkeypatch.setattr("arena.config.get_settings", lambda: _S())

    out = await tc.classify_temporal("price now?", "answer")
    request = client.chat.completions.create.await_args.kwargs
    assert request["model"] == "deepseek-v4-flash"
    assert request["extra_body"] == {"thinking": {"type": "disabled"}}
    assert out["decay_class"] == "perishable"
    assert out["half_life"] == "Days to weeks"
    assert out["recheck_by"] is not None  # +14 days formatted
    assert out["decay_reason"] == "Prices move daily."
    assert len(out["time_sensitive_claims"]) == 2


@pytest.mark.asyncio
async def test_permanent_has_no_recheck(monkeypatch):
    payload = {
        "decay_class": "permanent",
        "decay_reason": "Math is timeless.",
        "time_sensitive_claims": [],
    }
    response = MagicMock()
    response.choices = [
        MagicMock(message=MagicMock(content=__import__("json").dumps(payload)))
    ]
    client = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=response)

    import openai

    monkeypatch.setattr(openai, "AsyncOpenAI", lambda **kwargs: client)

    class _S:
        deepseek_api_key = "sk-test"

    monkeypatch.setattr("arena.config.get_settings", lambda: _S())

    out = await tc.classify_temporal("2+2?", "4")
    assert out["decay_class"] == "permanent"
    assert out["half_life"] == "Timeless"
    assert out["recheck_by"] is None


@pytest.mark.asyncio
async def test_unknown_decay_class_defaults_half_life(monkeypatch):
    payload = {
        "decay_class": "mystery",
        "decay_reason": "?",
        "time_sensitive_claims": [],
    }
    response = MagicMock()
    response.choices = [
        MagicMock(message=MagicMock(content=__import__("json").dumps(payload)))
    ]
    client = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=response)

    import openai

    monkeypatch.setattr(openai, "AsyncOpenAI", lambda **kwargs: client)

    class _S:
        deepseek_api_key = "sk-test"

    monkeypatch.setattr("arena.config.get_settings", lambda: _S())

    out = await tc.classify_temporal("q", "a")
    assert out["decay_class"] == "mystery"
    assert out["half_life"] == "2–5 years"
    assert out["recheck_by"] is None
