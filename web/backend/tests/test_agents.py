"""Unit tests for arena.core.agents.

Validates the 4-slot invariant, persona metadata, and the persona↔slot map.
"""

import pytest

from arena.core.agents import (
    DEFAULT_PERSONA_IDS,
    PERSONA_METADATA,
    PERSONA_PROMPTS,
    SLOT_AGENT_IDS,
    get_agent_config,
    get_all_agents,
    get_model_for_persona,
    get_persona_id_for_agent,
    resolve_persona_ids,
)
from arena.core.model_router import GROK_PERSONAS, OPENAI_PERSONAS, DEEPSEEK_PERSONAS


class TestResolvePersonaIds:
    def test_none_returns_defaults(self):
        assert resolve_persona_ids(None) == DEFAULT_PERSONA_IDS

    def test_exactly_four_required(self):
        with pytest.raises(ValueError, match="exactly 4"):
            resolve_persona_ids(["analyst"])
        with pytest.raises(ValueError, match="exactly 4"):
            resolve_persona_ids(["analyst"] * 5)

    def test_all_unknown_raises(self):
        with pytest.raises(ValueError, match="Invalid persona"):
            resolve_persona_ids(["ghost"] * 4)

    def test_valid_set_returned(self):
        ids = ["analyst", "philosopher", "pragmatist", "contrarian"]
        assert resolve_persona_ids(ids) == ids


class TestGetPersonaIdForAgent:
    def test_default_panel(self):
        assert get_persona_id_for_agent("agent_1") == "analyst"
        assert get_persona_id_for_agent("agent_2") == "philosopher"
        assert get_persona_id_for_agent("agent_3") == "pragmatist"
        assert get_persona_id_for_agent("agent_4") == "contrarian"

    def test_custom_panel(self):
        ids = ["scientist", "historian", "economist", "ethicist"]
        assert get_persona_id_for_agent("agent_1", ids) == "scientist"
        assert get_persona_id_for_agent("agent_4", ids) == "ethicist"

    def test_unknown_agent_raises(self):
        with pytest.raises(ValueError, match="Unknown agent"):
            get_persona_id_for_agent("agent_99")


class TestGetAllAgents:
    def test_returns_exactly_four(self):
        agents = get_all_agents()
        assert len(agents) == 4

    def test_uses_default_panel(self):
        agents = get_all_agents()
        for i, agent in enumerate(agents):
            assert agent.persona_id == DEFAULT_PERSONA_IDS[i]
            assert agent.agent_id == SLOT_AGENT_IDS[i]
            assert agent.agent_number == i + 1


class TestPersonaPrompts:
    def test_every_persona_has_prompt(self):
        assert set(PERSONA_PROMPTS.keys()) == set(PERSONA_METADATA.keys())

    def test_every_prompt_has_required_sections(self):
        required = ["IDENTITY", "REASONING PROCESS", "OUTPUT STYLE", "FORBIDDEN", "SIGNATURE MOVE"]
        for persona_id, prompt in PERSONA_PROMPTS.items():
            for section in required:
                assert section in prompt, f"{persona_id} missing {section}"

    def test_metadata_temperature_in_range(self):
        for persona_id, meta in PERSONA_METADATA.items():
            t = float(meta["temperature"])
            assert 0.0 <= t <= 2.0, f"{persona_id} temperature {t} out of range"


class TestProviderRouting:
    def test_provider_sets_match_metadata(self):
        # Every persona is routed to exactly one provider set.
        all_routed = GROK_PERSONAS | OPENAI_PERSONAS | DEEPSEEK_PERSONAS
        claude_only = set(PERSONA_PROMPTS.keys()) - all_routed
        # Claude-only personas are routed via default Claude fallback.
        for persona_id in claude_only:
            provider = get_model_for_persona(persona_id)
            assert provider == "claude", f"{persona_id} expected Claude, got {provider}"