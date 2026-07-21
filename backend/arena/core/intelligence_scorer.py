import json
import logging
import re
from typing import TYPE_CHECKING, Optional

from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

if TYPE_CHECKING:
    from arena.core.blackboard import Blackboard

logger = logging.getLogger("arena.intelligence_scorer")

INTELLIGENCE_SCORE_PROMPT = """
You are an Intelligence Score evaluator for AI-generated answers.

You score answers across four dimensions. Be calibrated and honest.
Do not inflate scores.

DIMENSION 1 — Research Depth (0-25):
0-6:   No research, pure opinion
7-12:  Some claims, minimal evidence
13-18: Good research, cited examples
19-22: Strong research, multiple sources
23-25: Exceptional — comprehensive, specific, well-evidenced

DIMENSION 2 — Logical Soundness (0-25):
0-6:   Logical fallacies, gaps
7-12:  Basic reasoning, some leaps
13-18: Sound logic, minor gaps
19-22: Strong reasoning chain
23-25: Airtight — every conclusion follows from premises

DIMENSION 3 — Consensus Level (0-25):
This measures how SETTLED the topic is.
High score = strong expert consensus.
Low score = highly contested topic.
0-6:   Experts strongly disagree
7-12:  Active debate, no consensus
13-18: Leaning consensus, some debate
19-22: Strong consensus with caveats
23-25: Near-universal agreement

DIMENSION 4 — Answer Durability (0-25):
This measures how LONG this answer will stay accurate.
High score = durable over time.
Low score = expires quickly.
0-6:   Based on breaking news, expires within days
7-12:  Current conditions dependent, expires within months
13-18: Moderately stable, 1-2 years
19-22: Mostly stable, 3-5 years
23-25: Fundamental truth, durable for a decade or more

Output valid JSON only. No preamble.

{
  "research_depth": {
    "score": 0-25,
    "label": "one word label",
    "reason": "one sentence why"
  },
  "logical_soundness": {
    "score": 0-25,
    "label": "one word label",
    "reason": "one sentence why"
  },
  "consensus_level": {
    "score": 0-25,
    "label": "Settled|Debated|Contested|Disputed",
    "reason": "one sentence why"
  },
  "answer_durability": {
    "score": 0-25,
    "label": "Durable|Stable|Volatile|Breaking",
    "reason": "one sentence why"
  },
  "total_score": 0-100,
  "score_label": "Exceptional|Strong|Solid|Mixed|Weak",
  "one_line_verdict": "one sentence summarising the overall quality"
}

score_label thresholds:
90-100: Exceptional
75-89:  Strong
60-74:  Solid
45-59:  Mixed
0-44:   Weak
"""


async def calculate_intelligence_score(
    task: str,
    final_answer: str,
    research_output: str = "",
    judgment_output: str = "",
    bb: Optional["Blackboard"] = None,
) -> dict:
    plain_answer = final_answer
    try:
        parsed = json.loads(final_answer)
        if parsed.get("sentences"):
            plain_answer = " ".join(
                s["text"] for s in parsed["sentences"] if isinstance(s, dict)
            )
    except Exception:
        logger.warning("Failed to parse final_answer JSON in intelligence_scorer", exc_info=True)

    try:
        model = MODEL_REGISTRY.get("deepseek_v4_flash", MODEL_REGISTRY["claude_sonnet"])

        user_prompt = f"""
Task: {task}

Answer to evaluate:
{plain_answer[:2000]}

Research context available:
{research_output[:500] if research_output else "None"}

Judge assessment:
{judgment_output[:300] if judgment_output else "None"}

Calculate the Intelligence Score.
"""

        response, inp, out = await call_llm(
            client=model["client"],
            provider=model.get("provider", "deepseek"),
            model_id=model["model_id"],
            system_prompt=INTELLIGENCE_SCORE_PROMPT,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=600,
        )
        if bb is not None:
            bb.total_input_tokens += inp
            bb.total_output_tokens += out

        match = re.search(r"\{.*\}", response, re.DOTALL)
        if match:
            result = json.loads(match.group())
            for dim in [
                "research_depth",
                "logical_soundness",
                "consensus_level",
                "answer_durability",
            ]:
                if dim in result:
                    score = result[dim].get("score", 15)
                    result[dim]["score"] = max(0, min(25, int(score)))

            total = sum(
                result.get(dim, {}).get("score", 0)
                for dim in [
                    "research_depth",
                    "logical_soundness",
                    "consensus_level",
                    "answer_durability",
                ]
            )
            result["total_score"] = total

            if total >= 90:
                result["score_label"] = "Exceptional"
            elif total >= 75:
                result["score_label"] = "Strong"
            elif total >= 60:
                result["score_label"] = "Solid"
            elif total >= 45:
                result["score_label"] = "Mixed"
            else:
                result["score_label"] = "Weak"

            logger.info(
                "[INTELLIGENCE_SCORE] total=%s label=%s",
                total,
                result["score_label"],
            )
            return result

    except Exception as e:
        logger.warning("Intelligence scoring failed: %s", e)

    return {
        "research_depth": {
            "score": 15,
            "label": "Moderate",
            "reason": "Score unavailable",
        },
        "logical_soundness": {
            "score": 15,
            "label": "Sound",
            "reason": "Score unavailable",
        },
        "consensus_level": {
            "score": 15,
            "label": "Debated",
            "reason": "Score unavailable",
        },
        "answer_durability": {
            "score": 15,
            "label": "Stable",
            "reason": "Score unavailable",
        },
        "total_score": 60,
        "score_label": "Solid",
        "one_line_verdict": "Score could not be calculated for this answer.",
    }
