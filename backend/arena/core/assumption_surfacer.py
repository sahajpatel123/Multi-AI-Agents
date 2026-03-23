import json
import logging
import re

from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

logger = logging.getLogger("arena.assumptions")

ASSUMPTION_SURFACER_PROMPT = """
You surface hidden assumptions in AI-generated answers.

Every answer makes implicit assumptions about context, audience, conditions,
timeframe, and domain.

Your job: make them explicit.

For each assumption identify:
- What the assumption is
- How critical it is if wrong
- What changes if the assumption does not hold

Output valid JSON only. No preamble.

{
  "assumptions": [
    {
      "assumption": "clear statement of what is assumed",
      "category": "context|audience|timeframe|domain|condition|geography|regulation|technical",
      "criticality": "high|medium|low",
      "if_wrong": "what changes if this assumption is false",
      "flag": true|false
    }
  ],
  "most_critical": "index 0-based of the most critical assumption",
  "assumption_count": 3,
  "summary": "one sentence on the biggest hidden assumption in this answer"
}

Criticality guide:
high:   If wrong, the answer is largely or completely invalid
medium: If wrong, significant parts need revision
low:    If wrong, minor adjustments needed, core holds

flag=true means this assumption should be prominently shown to user.
Flag at most 3 assumptions.

Find 3-6 assumptions.
Be specific not generic.
"Western market context" is specific.
"Some assumptions may apply" is not.
"""


async def surface_assumptions(task: str, final_answer: str) -> dict:
    plain_answer = final_answer
    try:
        parsed = json.loads(final_answer)
        if parsed.get("sentences"):
            plain_answer = " ".join(
                s["text"] for s in parsed["sentences"] if isinstance(s, dict)
            )
    except Exception:
        pass

    try:
        model = MODEL_REGISTRY.get("gpt_4o", MODEL_REGISTRY["claude_sonnet"])

        user_prompt = f"""
Task: {task}

Answer to analyse:
{plain_answer[:2000]}

Surface all hidden assumptions.
"""

        response = await call_llm(
            client=model["client"],
            provider=model.get("provider", "openai"),
            model_id=model["model_id"],
            system_prompt=ASSUMPTION_SURFACER_PROMPT,
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=700,
        )

        match = re.search(r"\{.*\}", response, re.DOTALL)
        if match:
            result = json.loads(match.group())
            assumptions = result.get("assumptions", [])

            flag_count = 0
            for assumption in assumptions:
                if flag_count >= 3:
                    assumption["flag"] = False
                elif assumption.get("flag"):
                    flag_count += 1

            result["assumption_count"] = len(assumptions)

            logger.info(
                "[ASSUMPTIONS] Found %s assumptions, %s flagged",
                len(assumptions),
                flag_count,
            )
            return result

    except Exception as e:
        logger.warning("Assumption surfacing failed: %s", e)

    return {
        "assumptions": [
            {
                "assumption": "Current conditions and context apply",
                "category": "context",
                "criticality": "medium",
                "if_wrong": "Parts of this answer may not apply to your specific situation",
                "flag": True,
            }
        ],
        "most_critical": 0,
        "assumption_count": 1,
        "summary": "This answer makes context assumptions that may not apply universally.",
    }
