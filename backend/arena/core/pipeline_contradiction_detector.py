"""Cross-task contradiction detection for Agent pipeline (current answer vs history)."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, TypedDict

from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

logger = logging.getLogger("arena.pipeline_contradiction_detector")

CONTRA_SYSTEM = """
You are a contradiction analyst. Compare the
current answer against the user's research
history. Find DIRECT or NUANCED contradictions
only — not mere differences in emphasis.

Direct: two claims cannot both be true.
Nuanced: claims are in tension but reconcilable.

Return ONLY valid JSON array:
[
  {
    "claim_new": "from current answer, <15 words",
    "claim_old": "from past task, <15 words",
    "task_id_old": "task id string",
    "task_title": "past task display title",
    "severity": "direct|nuanced",
    "resolution_hint": "one sentence"
  }
]
Return [] if no contradictions found.
""".strip()


class Contradiction(TypedDict):
    claim_new: str
    claim_old: str
    task_id_old: str
    task_title: str
    severity: str
    resolution_hint: str


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


def _normalize_contradictions(raw: str, past_ids: set[str]) -> List[Contradiction]:
    try:
        data = json.loads(_strip_json_fence(raw))
    except json.JSONDecodeError:
        m = re.search(r"\[[\s\S]*\]", raw)
        if not m:
            return []
        try:
            data = json.loads(m.group())
        except json.JSONDecodeError:
            return []
    if not isinstance(data, list):
        return []
    out: List[Contradiction] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        tid = str(item.get("task_id_old") or "").strip()
        if tid and past_ids and tid not in past_ids:
            continue
        sev = str(item.get("severity") or "").strip().lower()
        if sev not in ("direct", "nuanced"):
            sev = "nuanced"
        out.append(
            {
                "claim_new": str(item.get("claim_new") or "").strip(),
                "claim_old": str(item.get("claim_old") or "").strip(),
                "task_id_old": tid,
                "task_title": str(item.get("task_title") or "").strip(),
                "severity": sev,
                "resolution_hint": str(item.get("resolution_hint") or "").strip(),
            }
        )
    return [c for c in out if c.get("claim_new") and c.get("claim_old")]


async def detect_contradictions(
    current_answer: str,
    current_question: str,
    past_tasks: List[Dict[str, Any]],
) -> List[Contradiction]:
    if not past_tasks:
        return []

    model = MODEL_REGISTRY.get("gpt_4o") or MODEL_REGISTRY["claude_sonnet"]
    client = model["client"]
    provider = str(model.get("provider", "openai"))

    past_ids = {str(p.get("task_id") or "") for p in past_tasks if p.get("task_id")}

    hist_lines: List[str] = []
    for p in past_tasks[:10]:
        tid = str(p.get("task_id") or "")
        title = str(p.get("title") or "")[:120]
        ans = str(p.get("final_answer") or "")[:200]
        hist_lines.append(f"task_id: {tid}\ntitle: {title}\nfinal_answer: {ans}")

    user_prompt = (
        f"Current question:\n{current_question[:500]}\n\n"
        f"Current answer (truncated):\n{current_answer[:500]}\n\n"
        "Past tasks:\n"
        + "\n\n---\n\n".join(hist_lines)
    )

    try:
        raw = await asyncio.wait_for(
            call_llm(
                client=client,
                provider=provider,
                model_id=model["model_id"],
                system_prompt=CONTRA_SYSTEM,
                user_prompt=user_prompt,
                temperature=0.3,
                max_tokens=800,
            ),
            timeout=20.0,
        )
    except Exception as e:
        logger.warning("[PIPELINE_CONTRA] detect_contradictions failed: %s", e)
        return []

    return _normalize_contradictions(raw, past_ids)
