"""Classify user follow-up intent for Agent collaborative refinement."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

logger = logging.getLogger("arena.refinement")

CLASSIFIER_PROMPT = """
You classify what kind of refinement a user is asking for on an AI answer.

Return JSON only. No preamble.

{
  "type": "deeper|challenge|rewrite|clarify|expand|summarise|followup|new_angle",
  "focus": "what specifically to focus on",
  "instruction": "clear instruction for the pipeline",
  "stages_needed": ["solver", "synthesizer"]
}

Type definitions:
deeper: go into more detail on a specific point
challenge: question or attack an assumption in the answer
rewrite: change format, audience, or style of the answer
clarify: explain something in simpler terms
expand: add more breadth to a section or topic
summarise: make the answer shorter and more concise
new_angle: approach from a completely different perspective
followup: a new question that builds on the existing context

stages_needed should be the minimum stages required to handle this:
- deeper/expand: ["researcher", "solver", "verifier", "synthesizer"]
- challenge: ["critic", "synthesizer"]
- rewrite/summarise: ["synthesizer"]
- clarify: ["synthesizer"]
- new_angle: ["researcher", "solver", "synthesizer"]
- followup: ["solver", "synthesizer"]
"""


def _normalize_stages(raw: Any) -> list[str]:
    allowed = {
        "researcher",
        "critic",
        "solver",
        "verifier",
        "synthesizer",
        "planner",
    }
    if not isinstance(raw, list):
        return ["solver", "synthesizer"]
    out: list[str] = []
    for x in raw:
        s = str(x).strip().lower()
        if s in allowed and s not in out:
            out.append(s)
    out = [s for s in out if s != "planner"]
    if "synthesizer" not in out:
        out.append("synthesizer")
    return out


async def classify_refinement(user_message: str, current_answer: str) -> dict[str, Any]:
    try:
        model = MODEL_REGISTRY.get("gpt_4o_mini", MODEL_REGISTRY["claude_sonnet"])
        provider = str(model.get("provider", "openai"))
        response = await call_llm(
            client=model["client"],
            provider=provider,
            model_id=model["model_id"],
            system_prompt=CLASSIFIER_PROMPT,
            user_prompt=(
                f"User message: {user_message}\n\n"
                f"Current answer summary: {current_answer[:500]}"
            ),
            temperature=0.1,
            max_tokens=250,
        )
        match = re.search(r"\{.*\}", response, re.DOTALL)
        if match:
            data = json.loads(match.group())
            if isinstance(data, dict):
                data["stages_needed"] = _normalize_stages(data.get("stages_needed"))
                return data
    except Exception as e:
        logger.warning("Classifier failed: %s", e)

    return {
        "type": "followup",
        "focus": user_message,
        "instruction": user_message,
        "stages_needed": ["solver", "synthesizer"],
    }
