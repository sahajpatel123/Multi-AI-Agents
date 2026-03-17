"""Input Pipeline — classifier, intent extractor, toxicity gate"""

import asyncio
import json
import re
import anthropic

from arena.core.model_router import get_route_for_prompt, get_route_for_task
from arena.models.schemas import (
    PromptCategory,
    PromptClassification,
    IntentExtraction,
    ToxicityResult,
    InputPipelineResult,
)


# ──────────────────────────────────────────────────────────────
# Toxicity — rules-based blocklist (runs first, no LLM cost)
# ──────────────────────────────────────────────────────────────

TOXIC_PATTERNS: list[re.Pattern] = [
    re.compile(r"\b(kill|murder|assassinate)\s+(yourself|himself|herself|themselves|someone|people)\b", re.I),
    re.compile(r"\b(how\s+to\s+)(make\s+a\s+bomb|build\s+a\s+weapon|synthesize\s+drugs)\b", re.I),
    re.compile(r"\b(child\s+(porn|exploitation|abuse))\b", re.I),
    re.compile(r"\b(ethnic\s+cleansing|genocide\s+is\s+good)\b", re.I),
    re.compile(r"\b(hack\s+into|steal\s+credentials|phish)\b", re.I),
]

TOXIC_EXACT_PHRASES: set[str] = {
    "i want to hurt someone",
    "help me harm",
    "instructions for violence",
}


def _rules_based_toxicity(prompt: str) -> ToxicityResult | None:
    """Fast rules-based check. Returns ToxicityResult if toxic, None if clean."""
    lower = prompt.lower().strip()

    for phrase in TOXIC_EXACT_PHRASES:
        if phrase in lower:
            return ToxicityResult(
                is_toxic=True,
                reason=f"Matched blocked phrase",
                confidence=1.0,
            )

    for pattern in TOXIC_PATTERNS:
        if pattern.search(prompt):
            return ToxicityResult(
                is_toxic=True,
                reason=f"Matched content policy pattern",
                confidence=0.95,
            )

    return None


# ──────────────────────────────────────────────────────────────
# LLM-backed components
# ──────────────────────────────────────────────────────────────

CLASSIFIER_SYSTEM_PROMPT = """You classify user prompts into exactly one category.

Categories:
- "question" — the user is asking something and expects an informational answer
- "task" — the user wants something done or built
- "statement" — the user is making a claim or sharing an opinion
- "debate" — the user is presenting a controversial or two-sided topic

Respond with ONLY valid JSON:
{"category": "<question|task|statement|debate>", "reasoning": "one sentence why"}"""


INTENT_SYSTEM_PROMPT = """You extract the user's intent from their prompt.

- surface_intent: what they literally asked, in one sentence
- deeper_intent: what they actually want beneath the surface, in one sentence
- key_entities: list of important nouns/concepts (max 5)

Respond with ONLY valid JSON:
{"surface_intent": "...", "deeper_intent": "...", "key_entities": ["...", "..."]}"""


TOXICITY_LLM_SYSTEM_PROMPT = """You are a content safety classifier. Evaluate whether this prompt contains:
- Requests for harmful, illegal, or dangerous content
- Targeted harassment, hate speech, or threats
- Attempts to manipulate AI into producing harmful output

Respond with ONLY valid JSON:
{"is_toxic": true/false, "reason": "null or explanation", "confidence": 0.0-1.0}

Be precise. Do NOT flag legitimate questions about sensitive topics (history, ethics, medicine).
Only flag prompts that are genuinely requesting harmful output."""


def _parse_json_from_llm(content: str) -> dict:
    """Extract JSON from LLM response, handling code blocks."""
    content = content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
        content = content.strip()
    return json.loads(content)


async def classify_prompt(
    client: anthropic.AsyncAnthropic, model: str, prompt: str
) -> PromptClassification:
    """Classify the prompt into one of four categories."""
    try:
        result = await client.messages.create(
            model=model,
            max_tokens=128,
            temperature=0.0,
            system=CLASSIFIER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        data = _parse_json_from_llm(result.content[0].text)
        return PromptClassification(
            category=PromptCategory(data.get("category", "question")),
            reasoning=data.get("reasoning", ""),
        )
    except Exception:
        return PromptClassification(
            category=PromptCategory.QUESTION,
            reasoning="Fallback: classification failed",
        )


async def extract_intent(
    client: anthropic.AsyncAnthropic, model: str, prompt: str
) -> IntentExtraction:
    """Extract surface and deeper intent from the prompt."""
    try:
        result = await client.messages.create(
            model=model,
            max_tokens=256,
            temperature=0.0,
            system=INTENT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        data = _parse_json_from_llm(result.content[0].text)
        return IntentExtraction(
            surface_intent=data.get("surface_intent", prompt),
            deeper_intent=data.get("deeper_intent", ""),
            key_entities=data.get("key_entities", [])[:5],
        )
    except Exception:
        return IntentExtraction(
            surface_intent=prompt,
            deeper_intent="",
            key_entities=[],
        )


async def check_toxicity_llm(
    client: anthropic.AsyncAnthropic, model: str, prompt: str
) -> ToxicityResult:
    """LLM-based toxicity check for edge cases."""
    try:
        result = await client.messages.create(
            model=model,
            max_tokens=128,
            temperature=0.0,
            system=TOXICITY_LLM_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        data = _parse_json_from_llm(result.content[0].text)
        return ToxicityResult(
            is_toxic=bool(data.get("is_toxic", False)),
            reason=data.get("reason"),
            confidence=float(data.get("confidence", 0.0)),
        )
    except Exception:
        return ToxicityResult(is_toxic=False, reason=None, confidence=0.0)


# ──────────────────────────────────────────────────────────────
# Main pipeline
# ──────────────────────────────────────────────────────────────

async def run_input_pipeline(prompt: str) -> InputPipelineResult:
    """
    Run the full input pipeline:
    1. Rules-based toxicity gate (instant, no LLM cost)
    2. LLM toxicity check (for edge cases)
    3. Classifier + intent extractor (in parallel)
    4. Build enriched prompt for agents
    """
    toxicity_route = get_route_for_task("toxicity_check")
    classifier_route = get_route_for_prompt(prompt, "prompt_classification")
    intent_route = get_route_for_prompt(prompt, "intent_extraction")

    # Step 1: Rules-based toxicity — instant rejection
    rules_result = _rules_based_toxicity(prompt)
    if rules_result and rules_result.is_toxic:
        return InputPipelineResult(
            classification=PromptClassification(category=PromptCategory.QUESTION, reasoning="N/A — blocked"),
            intent=IntentExtraction(surface_intent=prompt, deeper_intent="blocked"),
            toxicity=rules_result,
            enriched_prompt=prompt,
            passed=False,
            rejection_reason=rules_result.reason,
        )

    # Step 2: Run LLM toxicity + classifier + intent in parallel
    toxicity_task = check_toxicity_llm(toxicity_route["client"], toxicity_route["model_id"], prompt)
    classifier_task = classify_prompt(classifier_route["client"], classifier_route["model_id"], prompt)
    intent_task = extract_intent(intent_route["client"], intent_route["model_id"], prompt)

    toxicity, classification, intent = await asyncio.gather(
        toxicity_task, classifier_task, intent_task
    )

    # Step 3: Check LLM toxicity result
    if toxicity.is_toxic and toxicity.confidence >= 0.7:
        return InputPipelineResult(
            classification=classification,
            intent=intent,
            toxicity=toxicity,
            enriched_prompt=prompt,
            passed=False,
            rejection_reason=toxicity.reason,
        )

    # Step 4: Build enriched prompt
    enriched = _build_enriched_prompt(prompt, classification, intent)

    return InputPipelineResult(
        classification=classification,
        intent=intent,
        toxicity=toxicity,
        enriched_prompt=enriched,
        passed=True,
        rejection_reason=None,
    )


def _build_enriched_prompt(
    prompt: str,
    classification: PromptClassification,
    intent: IntentExtraction,
) -> str:
    """Build an enriched prompt that gives agents more context."""
    enriched = prompt

    # Add context hint for agents based on classification
    context_parts = []
    if classification.category == PromptCategory.DEBATE:
        context_parts.append("[This is a debate topic — present your strongest position]")
    elif classification.category == PromptCategory.TASK:
        context_parts.append("[This is a task request — focus on actionable steps]")

    if intent.deeper_intent and intent.deeper_intent != prompt:
        context_parts.append(f"[Underlying intent: {intent.deeper_intent}]")

    if context_parts:
        enriched = prompt + "\n\n" + "\n".join(context_parts)

    return enriched
