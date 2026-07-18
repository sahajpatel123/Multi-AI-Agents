"""Unit tests for arena.core.dissent_engine fallback contract."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from arena.core import dissent_engine as de


@pytest.mark.asyncio
async def test_generate_dissent_report_fallback_on_error(monkeypatch):
    client = MagicMock()
    client.chat.completions.create = AsyncMock(side_effect=RuntimeError("api down"))

    class _Settings:
        openai_api_key = "sk-test"

    monkeypatch.setattr(de, "AsyncOpenAI", lambda api_key: client, raising=False)
    # Module imports AsyncOpenAI inside the function — patch openai module path.
    import openai

    monkeypatch.setattr(openai, "AsyncOpenAI", lambda api_key: client)
    monkeypatch.setattr(
        "arena.config.get_settings",
        lambda: _Settings(),
    )

    out = await de.generate_dissent_report("q", "answer", "critique")
    assert out == {"positions": [], "minority_view_summary": ""}


@pytest.mark.asyncio
async def test_generate_dissent_report_parses_valid_json(monkeypatch):
    payload = {
        "positions": [
            {
                "claim": "Rates stay high",
                "strength": "moderate",
                "why_excluded": "base case assumed cuts",
                "confidence_impact": -8,
            }
        ],
        "minority_view_summary": "Hawkish minority remains plausible.",
    }
    response = MagicMock()
    response.choices = [MagicMock(message=MagicMock(content=__import__("json").dumps(payload)))]
    client = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=response)

    import openai

    monkeypatch.setattr(openai, "AsyncOpenAI", lambda api_key: client)

    class _Settings:
        openai_api_key = "sk-test"

    monkeypatch.setattr("arena.config.get_settings", lambda: _Settings())

    out = await de.generate_dissent_report("q", "answer", "critique")
    assert out["minority_view_summary"].startswith("Hawkish")
    assert out["positions"][0]["claim"] == "Rates stay high"


@pytest.mark.asyncio
async def test_generate_dissent_report_rejects_missing_fields(monkeypatch):
    response = MagicMock()
    response.choices = [MagicMock(message=MagicMock(content='{"positions": []}'))]
    client = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=response)

    import openai

    monkeypatch.setattr(openai, "AsyncOpenAI", lambda api_key: client)

    class _Settings:
        openai_api_key = "sk-test"

    monkeypatch.setattr("arena.config.get_settings", lambda: _Settings())

    out = await de.generate_dissent_report("q", "a", "c")
    assert out["positions"] == []
    assert out["minority_view_summary"] == ""
