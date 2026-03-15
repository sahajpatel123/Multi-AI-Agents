"""Central model routing table for all LLM calls."""

from __future__ import annotations

import anthropic
import openai as openai_sdk

from arena.config import get_settings

settings = get_settings()

claude_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
grok_client = openai_sdk.AsyncOpenAI(
    api_key=settings.grok_api_key,
    base_url="https://api.x.ai/v1",
)

MODEL_REGISTRY = {
    "claude_haiku": {
        "model_id": "claude-haiku-4-5-20251001",
        "provider": "claude",
        "client": claude_client,
        "cost_per_1k_input": 0.00025,
        "cost_per_1k_output": 0.00125,
        "max_tokens": 1024,
        "strengths": ["fast", "cheap", "classification", "simple_tasks"],
    },
    "claude_sonnet": {
        "model_id": "claude-sonnet-4-6",
        "provider": "claude",
        "client": claude_client,
        "cost_per_1k_input": 0.003,
        "cost_per_1k_output": 0.015,
        "max_tokens": 1024,
        "strengths": ["balanced", "reasoning", "analysis", "default"],
    },
    "claude_opus": {
        "model_id": "claude-opus-4-6",
        "provider": "claude",
        "client": claude_client,
        "cost_per_1k_input": 0.015,
        "cost_per_1k_output": 0.075,
        "max_tokens": 1024,
        "strengths": ["deep_reasoning", "complex_tasks", "pro_tier_only"],
        "enabled": False,
        "reason_disabled": "Reserved for Pro tier. Enable when Pro launches.",
    },
    "grok": {
        "model_id": "grok-3-latest",
        "provider": "grok",
        "client": grok_client,
        "cost_per_1k_input": 0.005,
        "cost_per_1k_output": 0.015,
        "max_tokens": 1000,
        "strengths": ["contrarian", "real_time_awareness", "bold_opinions", "x_discourse"],
    },
}

TASK_ROUTES = {
    "toxicity_check": {"primary": "claude_haiku", "fallback": ["claude_sonnet"], "reason": "Fast binary classification. Haiku is sufficient and cheap."},
    "prompt_classification": {"primary": "claude_haiku", "fallback": ["claude_sonnet"], "reason": "Category detection is a simple task."},
    "intent_extraction": {"primary": "claude_haiku", "fallback": ["claude_sonnet"], "reason": "Surface to core ask mapping. Fast and simple."},
    "scoring": {"primary": "claude_sonnet", "fallback": ["claude_haiku"], "reason": "Requires balanced reasoning. Must evaluate all 4 responses fairly."},
    "persona_drift_check": {"primary": "claude_haiku", "fallback": ["claude_sonnet"], "reason": "Binary check. Does response match persona fingerprint?"},
    "contradiction_detection": {"primary": "claude_haiku", "fallback": ["claude_sonnet"], "reason": "Similarity check with LLM fallback for borderline cases."},
    "session_compression": {"primary": "claude_haiku", "fallback": ["claude_sonnet"], "reason": "Compression is a structured extraction task. Haiku handles well."},
    "planner": {"primary": "claude_sonnet", "fallback": ["claude_haiku"], "reason": "Task decomposition needs structured output. Sonnet is reliable here."},
    "researcher": {"primary": "claude_sonnet", "fallback": ["claude_haiku"], "reason": "Evidence gathering and synthesis. Balanced model needed."},
    "solver": {"primary": "claude_sonnet", "fallback": ["claude_haiku"], "reason": "Main answer generation. Most important stage in Agent mode."},
    "critic": {"primary": "claude_sonnet", "fallback": ["claude_haiku"], "reason": "Claim attacking needs precise reasoning. Haiku too shallow."},
    "verifier": {"primary": "claude_haiku", "fallback": ["claude_sonnet"], "reason": "Rule-based checks. Five binary verifications. Haiku is fast and cheap."},
    "synthesizer": {"primary": "claude_sonnet", "fallback": ["claude_haiku"], "reason": "Final answer assembly. Needs coherence and structure."},
    "judge": {"primary": "claude_sonnet", "fallback": ["claude_haiku"], "reason": "Independent evaluation of final answer. Must be architecturally separate from solver."},
}

PERSONA_ROUTES = {
    "analyst": "claude_sonnet",
    "philosopher": "claude_sonnet",
    "pragmatist": "claude_sonnet",
    "contrarian": "grok",
    "scientist": "claude_sonnet",
    "historian": "claude_sonnet",
    "economist": "claude_sonnet",
    "ethicist": "claude_sonnet",
    "stoic": "claude_sonnet",
    "futurist": "grok",
    "strategist": "claude_sonnet",
    "engineer": "claude_sonnet",
    "optimist": "claude_sonnet",
    "empath": "claude_sonnet",
    "firstprinciples": "claude_sonnet",
    "devilsadvocate": "grok",
}

GROK_PERSONAS = {"contrarian", "futurist", "devilsadvocate"}


def score_prompt_complexity(prompt: str, category: str | None = None, intent: str | None = None) -> str:
    score = 0
    word_count = len(prompt.split())
    if word_count < 10:
        score += 0
    elif word_count < 30:
        score += 1
    elif word_count < 60:
        score += 2
    else:
        score += 3

    complex_categories = {"debate", "strategy", "prediction", "technical"}
    simple_categories = {"factual", "definition"}
    if category in complex_categories:
        score += 2
    elif category in simple_categories:
        score -= 1

    complex_markers = ["why", "how", "explain", "analyze", "compare", "evaluate", "what are the", "should i", "pros and cons", "difference between"]
    prompt_lower = prompt.lower()
    for marker in complex_markers:
        if marker in prompt_lower:
            score += 1
            break

    if score <= 1:
        return "simple"
    if score <= 3:
        return "moderate"
    return "complex"


def _route_payload(model_key: str) -> dict:
    model = MODEL_REGISTRY[model_key]
    return {
        "model_key": model_key,
        "model_id": model["model_id"],
        "client": model["client"],
        "provider": model["provider"],
        "max_tokens": model["max_tokens"],
        "cost_per_1k_input": model["cost_per_1k_input"],
        "cost_per_1k_output": model["cost_per_1k_output"],
    }


def get_route_for_task(task: str) -> dict:
    if task not in TASK_ROUTES:
        raise ValueError(f"Unknown task: {task}. Add it to TASK_ROUTES in model_router.py")
    route = TASK_ROUTES[task]
    model_key = route["primary"]
    model = MODEL_REGISTRY[model_key]
    if not model.get("enabled", True):
        model_key = route["fallback"][0]
    return _route_payload(model_key)


def get_route_for_persona(persona_id: str) -> dict:
    model_key = PERSONA_ROUTES.get(persona_id, "claude_sonnet")
    payload = _route_payload(model_key)
    payload["is_grok"] = persona_id in GROK_PERSONAS
    return payload


def get_route_for_prompt(prompt: str, task: str, category: str | None = None) -> dict:
    complexity_aware_tasks = {"scoring", "intent_extraction", "prompt_classification", "session_compression"}
    if task not in complexity_aware_tasks:
        return get_route_for_task(task)

    complexity = score_prompt_complexity(prompt=prompt, category=category)
    if complexity == "simple":
        payload = _route_payload("claude_haiku")
        payload["complexity"] = complexity
        payload["routing_reason"] = "Simple prompt routed to Haiku for cost efficiency"
        return payload

    payload = get_route_for_task(task)
    payload["complexity"] = complexity
    payload["routing_reason"] = f"{complexity} prompt routed to primary model"
    return payload


def estimate_call_cost(model_key: str, input_tokens: int, output_tokens: int) -> float:
    model = MODEL_REGISTRY.get(model_key)
    if not model:
        return 0.0
    input_cost = (input_tokens / 1000) * model["cost_per_1k_input"]
    output_cost = (output_tokens / 1000) * model["cost_per_1k_output"]
    return round(input_cost + output_cost, 6)


def get_all_routes_summary() -> dict:
    return {
        "task_routes": {
            task: {
                "primary": route["primary"],
                "fallback": route["fallback"],
                "reason": route["reason"],
            }
            for task, route in TASK_ROUTES.items()
        },
        "persona_routes": PERSONA_ROUTES,
        "grok_personas": list(GROK_PERSONAS),
        "models_available": list(MODEL_REGISTRY.keys()),
        "models_disabled": [key for key, val in MODEL_REGISTRY.items() if not val.get("enabled", True)],
    }
