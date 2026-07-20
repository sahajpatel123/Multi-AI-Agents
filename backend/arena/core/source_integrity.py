"""Cross-source agreement / contradiction analysis for Agent research output."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from arena.core.blackboard import Blackboard
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

logger = logging.getLogger("arena.source_integrity")

SOURCE_INTEGRITY_PROMPT = """
You are a Source Integrity Analyzer.

You receive research findings that may contain multiple sources on the same topic.

Your job:
1. Identify claims made by multiple sources
2. Check if sources agree or disagree
3. Calculate agreement-based confidence
4. Flag contradicting sources

Confidence calculation:
- All sources agree: 90-98%
- Most agree (1 dissent): 70-85%
- Split 50/50: 45-60%
- Most disagree: 25-40%
- Only 1 source, unverified: 55-65%
- Only 1 source, strong: 65-75%

Output JSON only. No preamble.

{
  "source_count": 3,
  "claims": [
    {
      "claim": "the claim text",
      "sources_confirming": 3,
      "sources_contradicting": 0,
      "sources_neutral": 0,
      "agreement_confidence": 94,
      "status": "confirmed|contested|uncertain|unverified"
    }
  ],
  "contradictions": [
    {
      "topic": "what is contested",
      "position_a": "one view",
      "position_b": "opposing view",
      "severity": "minor|moderate|major"
    }
  ],
  "overall_source_integrity": 87,
  "integrity_label": "high|moderate|low|contested",
  "summary": "one sentence on source reliability overall"
}
"""


def _fallback_result(message: str, integrity_label: str = "uncertain") -> dict[str, Any]:
    return {
        "source_count": 0,
        "claims": [],
        "contradictions": [],
        "overall_source_integrity": 60,
        "integrity_label": integrity_label,
        "summary": message,
    }


async def analyze_source_integrity(
    research_output: str,
    task: str,
    bb: Optional[Blackboard] = None,
) -> dict[str, Any]:
    if not research_output or not str(research_output).strip():
        return {
            **_fallback_result("No research data available"),
            "source_count": 0,
        }

    try:
        model = MODEL_REGISTRY.get("deepseek_v4_flash", MODEL_REGISTRY["claude_sonnet"])
        provider = str(model.get("provider", "deepseek"))

        user_prompt = f"""
Task: {task}

Research findings:
{research_output[:3000]}

Analyze source integrity.
"""

        response, inp, out = await call_llm(
            client=model["client"],
            provider=provider,
            model_id=model["model_id"],
            system_prompt=SOURCE_INTEGRITY_PROMPT,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=900,
        )
        if bb is not None:
            bb.total_input_tokens += inp
            bb.total_output_tokens += out

        match = re.search(r"\{.*\}", response, re.DOTALL)
        if match:
            result = json.loads(match.group())
            logger.info(
                "[SOURCE_INTEGRITY] integrity=%s contradictions=%s",
                result.get("overall_source_integrity"),
                len(result.get("contradictions") or []),
            )
            return result

        return {
            **_fallback_result("Could not analyze sources"),
            "source_count": 1,
        }

    except Exception as e:
        logger.warning("Source integrity analysis failed: %s", e)
        return _fallback_result("Source analysis unavailable")
