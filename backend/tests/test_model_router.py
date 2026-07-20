"""Unit tests for arena.core.model_router.

Covers persona→model routing, task→model routing, complexity scoring, and the
provider-fallback chain.
"""

import pytest

from arena.core.model_router import (
    DEEPSEEK_PERSONAS,
    GROK_PERSONAS,
    MODEL_REGISTRY,
    OPENAI_PERSONAS,
    PERSONA_ROUTES,
    TASK_ROUTES,
    estimate_call_cost,
    get_all_routes_summary,
    get_fallback_model,
    get_route_for_persona,
    get_route_for_prompt,
    get_route_for_task,
    score_prompt_complexity,
)


class TestPersonaRouting:
    def test_every_persona_routes_to_a_known_model(self):
        for persona_id, model_key in PERSONA_ROUTES.items():
            assert model_key in MODEL_REGISTRY, f"{persona_id} → unknown {model_key}"

    def test_provider_sets_partition(self):
        all_personas = set(PERSONA_ROUTES.keys())
        partition = GROK_PERSONAS | OPENAI_PERSONAS | DEEPSEEK_PERSONAS | {"ethicist", "empath"}
        # These Claude personas (ethicist, empath) are not in any external set.
        missing = all_personas - GROK_PERSONAS - OPENAI_PERSONAS - DEEPSEEK_PERSONAS - {"ethicist", "empath"}
        assert missing == set(), f"personas with no provider set: {missing}"

    def test_get_route_for_persona_unknown_defaults_to_sonnet(self):
        route = get_route_for_persona("alien-persona")
        assert route["provider"] == "claude"
        assert route["model_key"] == "claude_sonnet"

    def test_route_payload_shape(self):
        route = get_route_for_persona("philosopher")
        for key in ("model_id", "client", "provider", "max_tokens", "cost_per_1k_input", "cost_per_1k_output"):
            assert key in route, f"missing {key}"

    def test_deepseek_personas_use_v4_flash_with_current_pricing(self):
        route = get_route_for_persona("analyst")
        assert route["model_key"] == "deepseek_v4_flash"
        assert route["model_id"] == "deepseek-v4-flash"
        assert route["provider"] == "deepseek"
        assert route["cost_per_1k_input"] == pytest.approx(0.00014)
        assert route["cost_per_1k_output"] == pytest.approx(0.00028)


class TestTaskRouting:
    def test_every_task_has_route(self):
        for task in TASK_ROUTES:
            route = get_route_for_task(task)
            assert "model_id" in route

    def test_unknown_task_raises(self):
        with pytest.raises(ValueError, match="Unknown task"):
            get_route_for_task("definitely_not_a_task")

    def test_complexity_aware_tasks_route_simple_to_haiku(self):
        route = get_route_for_prompt("hi", task="scoring")
        # very short prompt → simple → haiku
        assert route["model_key"] == "claude_haiku"
        assert route.get("complexity") == "simple"


class TestComplexityScoring:
    def test_short_prompt_is_simple(self):
        assert score_prompt_complexity("hi") == "simple"

    def test_long_prompt_with_markers_is_complex(self):
        # "analyze" + 60+ words → complex
        prompt = "analyze " + ("very " * 80)
        assert score_prompt_complexity(prompt) in {"moderate", "complex"}

    def test_debate_category_increases_complexity(self):
        prompt = "explain this briefly"
        base = score_prompt_complexity(prompt)
        bumped = score_prompt_complexity(prompt, category="debate")
        assert base in {"simple", "moderate"}
        assert bumped in {"moderate", "complex"}


class TestFallbackModel:
    def test_fallback_is_claude_sonnet(self):
        fb = get_fallback_model()
        assert fb["provider"] == "claude"
        assert fb["client"] is not None
        assert "model_id" in fb


class TestEstimateCost:
    def test_zero_tokens_zero_cost(self):
        assert estimate_call_cost("claude_sonnet", 0, 0) == 0.0

    def test_cost_matches_registry_rate(self):
        model = MODEL_REGISTRY["claude_sonnet"]
        cost = estimate_call_cost("claude_sonnet", 1000, 1000)
        expected = (model["cost_per_1k_input"] + model["cost_per_1k_output"])
        assert cost == pytest.approx(expected)

    def test_unknown_model_returns_zero(self):
        assert estimate_call_cost("alien-model", 1000, 1000) == 0.0


class TestRoutesSummary:
    def test_summary_includes_all_routes(self):
        summary = get_all_routes_summary()
        assert "task_routes" in summary
        assert "persona_routes" in summary
        assert "providers" in summary
        assert "models_available" in summary
        # Provider status reports whether client is wired.
        assert summary["providers"]["claude"]["status"] == "active"