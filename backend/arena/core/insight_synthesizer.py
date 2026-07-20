"""Cross-task insight synthesis for Agent pipeline (research history meta-analysis)."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional, TypedDict

from arena.core.blackboard import Blackboard
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

logger = logging.getLogger("arena.insight_synthesizer")

INSIGHT_SYSTEM = """
You are a meta-analyst. Given a user's research
history, identify cross-task patterns, recurring
themes, and blind spots. Be specific and terse.
Return ONLY valid JSON:
{
  "patterns": ["pattern1", "pattern2"],
  "evolution": "one sentence",
  "blind_spots": ["gap1", "gap2"],
  "synthesis": "two sentence conclusion"
}
""".strip()


class InsightReport(TypedDict):
    patterns: List[str]
    evolution: str
    blind_spots: List[str]
    synthesis: str


def _strip_json_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        lines = t.split("\n")
        if lines[-1].strip() == "```":
            lines = lines[1:-1]
        else:
            lines = lines[1:]
        t = "\n".join(lines).strip()
    return t


def _parse_insight_report(raw: str) -> Optional[InsightReport]:
    try:
        data = json.loads(_strip_json_fence(raw))
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            return None
        try:
            data = json.loads(m.group())
        except json.JSONDecodeError:
            return None
    if not isinstance(data, dict):
        return None
    patterns = data.get("patterns") or []
    blind = data.get("blind_spots") or []
    if not isinstance(patterns, list):
        patterns = []
    if not isinstance(blind, list):
        blind = []
    return {
        "patterns": [str(p).strip() for p in patterns if str(p).strip()],
        "evolution": str(data.get("evolution") or "").strip(),
        "blind_spots": [str(b).strip() for b in blind if str(b).strip()],
        "synthesis": str(data.get("synthesis") or "").strip(),
    }


async def synthesize_insights(
    tasks: List[Dict[str, Any]],
    current_question: str,
    bb: Optional[Blackboard] = None,
) -> Optional[InsightReport]:
    if len(tasks) < 3:
        return None

    model = MODEL_REGISTRY.get("deepseek_v4_flash") or MODEL_REGISTRY.get("gpt_4o")
    client = model["client"]
    provider = str(model.get("provider", "deepseek"))

    lines: List[str] = []
    for t in tasks[:10]:
        q = str(t.get("question") or t.get("task_text") or "")[:300]
        ans = str(t.get("final_answer") or "")[:300]
        lines.append(f"Q: {q}\nA: {ans}")

    user_prompt = (
        "Past tasks (most recent first):\n\n"
        + "\n\n---\n\n".join(lines)
        + f"\n\n---\n\nCurrent question:\n{current_question[:500]}"
    )

    try:
        raw, inp, out = await asyncio.wait_for(
            call_llm(
                client=client,
                provider=provider,
                model_id=model["model_id"],
                system_prompt=INSIGHT_SYSTEM,
                user_prompt=user_prompt,
                temperature=0.4,
                max_tokens=600,
            ),
            timeout=20.0,
        )
        if bb is not None:
            bb.total_input_tokens += inp
            bb.total_output_tokens += out
    except Exception as e:
        logger.warning("[INSIGHT] synthesize_insights failed: %s", e)
        return None

    parsed = _parse_insight_report(raw)
    if not parsed:
        return None
    return parsed
