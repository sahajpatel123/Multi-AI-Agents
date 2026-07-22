"""Regression test: debate `_get_reaction` failure path does not leak `str(e)`.

Pins the contract from the HOT-PATH-ANALYSIS HIGH finding
"LLM error details leaked to client" (debate.py:154-160). When the LLM
provider raises (rate limit, network blip, schema mismatch), the reaction
returned to the caller MUST be the safe placeholder string. The actual
exception traceback is sent to logs via ``logger.exception`` for operators.
"""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_get_reaction_returns_safe_placeholder_on_llm_failure(monkeypatch):
    """A raising LLM client must produce a `[Failed to generate reaction]`
    placeholder, NOT a string that contains the exception message (which
    leaks model names, token counts, internal infra details)."""
    from arena.routes import debate
    from arena.models.schemas import DebateRequest

    # Bypass the persona-library lookup so the test does not depend on seed data.
    class _StubAgent:
        name = "Stub Agent"
        temperature = 0.5
        agent_number = 1

    monkeypatch.setattr(debate, "get_agent_config", lambda *a, **kw: _StubAgent())
    monkeypatch.setattr(debate, "get_persona_id_for_agent", lambda *a, **kw: "stub-persona")
    monkeypatch.setattr(debate, "_get_persona_excerpt", lambda *a, **kw: "")

    async def _raise(*args, **kwargs):
        raise RuntimeError(
            "anthropic API error: model=claude-3-7-sonnet-20250219 "
            "tokens=4096 upstream_status=500"
        )

    monkeypatch.setattr(debate, "call_persona", _raise)

    req = DebateRequest(
        original_prompt="Test the leak.",
        challenged_agent_id="claude-sonnet",
        challenged_verdict="The challenged agent said X.",
        reacting_agent_ids=["claude-sonnet"],
        persona_ids=None,
        previous_reactions=None,
    )

    reaction = await debate._get_reaction("claude-sonnet", req)

    # The placeholder is the only thing the client sees.
    assert reaction.content == "[Failed to generate reaction]"
    assert reaction.stance == "disagree"
    # And the original exception message MUST NOT appear in the response.
    assert "anthropic API error" not in reaction.content
    assert "claude-3-7-sonnet" not in reaction.content
    assert "tokens=4096" not in reaction.content


@pytest.mark.asyncio
async def test_get_reaction_returns_parsed_payload_on_success(monkeypatch):
    """Sanity: the happy path still returns the LLM-parsed payload —
    the safe-fallback branch above does not accidentally swallow real
    reactions."""
    import json
    from arena.routes import debate
    from arena.models.schemas import DebateRequest

    class _StubAgent:
        name = "Stub Agent"
        temperature = 0.5
        agent_number = 1

    monkeypatch.setattr(debate, "get_agent_config", lambda *a, **kw: _StubAgent())
    monkeypatch.setattr(debate, "get_persona_id_for_agent", lambda *a, **kw: "stub-persona")
    monkeypatch.setattr(debate, "_get_persona_excerpt", lambda *a, **kw: "")

    async def _ok(*args, **kwargs):
        return json.dumps({"content": "Live reaction.", "stance": "agree"}), None, None

    monkeypatch.setattr(debate, "call_persona", _ok)

    req = DebateRequest(
        original_prompt="Test the happy path.",
        challenged_agent_id="claude-sonnet",
        challenged_verdict="The challenged agent said X.",
        reacting_agent_ids=["claude-sonnet"],
        persona_ids=None,
        previous_reactions=None,
    )

    reaction = await debate._get_reaction("claude-sonnet", req)

    assert reaction.content == "Live reaction."
    assert reaction.stance == "agree"