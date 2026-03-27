"""Steelman generator — strongest opposing view before solver."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import List, TypedDict

from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

logger = logging.getLogger(__name__)


class SteelmanOutput(TypedDict):
    opposing_position: str
    key_arguments: List[str]
    strongest_evidence: str
    concession: str


def _empty_steelman() -> SteelmanOutput:
    return {
        "opposing_position": "",
        "key_arguments": [],
        "strongest_evidence": "",
        "concession": "",
    }


_STEELMAN_SYSTEM_TEMPLATE = """
You are a steelman architect. Construct the most intellectually honest, strongest possible version of the view opposing the most likely answer to this question.

This is not devil's advocacy. Find the BEST VERSION a thoughtful informed expert who disagrees would actually make.

Return ONLY valid JSON, no markdown:
{{
  "opposing_position": "2-3 sentences at strongest",
  "key_arguments": ["arg1","arg2","arg3"],
  "strongest_evidence": "1-2 sentences",
  "concession": "what the opposing view genuinely gets right"
}}
{expertise_append}
"""


async def generate_steelman(
    question: str,
    research_summary: str,
    expertise_modifier: str = "",
) -> SteelmanOutput:
    model = MODEL_REGISTRY["claude_sonnet"]
    expertise_append = ""
    em = (expertise_modifier or "").strip()
    if em:
        expertise_append = f"\n{em}"

    system_prompt = _STEELMAN_SYSTEM_TEMPLATE.format(expertise_append=expertise_append)

    user_prompt = f"""
Question: {question}

Research gathered: {research_summary}

Build the strongest opposing view to the most likely answer this research points toward.
"""

    try:
        response = await asyncio.wait_for(
            call_llm(
                client=model["client"],
                provider="claude",
                model_id=model["model_id"],
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.5,
                max_tokens=2048,
            ),
            timeout=25.0,
        )
    except Exception as e:
        logger.warning("[STEELMAN] generation failed: %s", e)
        return _empty_steelman()

    text = (response or "").strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return _empty_steelman()
    try:
        data = json.loads(match.group())
    except json.JSONDecodeError:
        return _empty_steelman()

    if not isinstance(data, dict):
        return _empty_steelman()

    opp = str(data.get("opposing_position", "") or "").strip()
    raw_args = data.get("key_arguments")
    args: List[str] = []
    if isinstance(raw_args, list):
        for a in raw_args:
            if isinstance(a, str) and a.strip():
                args.append(a.strip())
            if len(args) >= 3:
                break

    out: SteelmanOutput = {
        "opposing_position": opp,
        "key_arguments": args[:3],
        "strongest_evidence": str(data.get("strongest_evidence", "") or "").strip(),
        "concession": str(data.get("concession", "") or "").strip(),
    }
    return out
