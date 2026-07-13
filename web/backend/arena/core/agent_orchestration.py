"""Cross-task synthesis after parallel Agent pipelines complete."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY
from arena.db_models import AgentTask

logger = logging.getLogger(__name__)

SYNTHESIS_SYSTEM = """
Given multiple research tasks, synthesise their findings into a unified report. Identify where
they converge, where they conflict, and what combined conclusion emerges.
Return ONLY valid JSON:
{
  "synthesis": "2-3 paragraph unified conclusion",
  "bullets": ["key point 1", "key point 2", "key point 3", "key point 4"],
  "conflicts": [
    {"task_a": 1, "task_b": 2, "conflict": "one sentence description"}
  ]
}
""".strip()


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


def _parse_synthesis_json(raw: str) -> dict[str, Any]:
    try:
        data = json.loads(_strip_json_fence(raw))
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            return {"synthesis": "", "bullets": [], "conflicts": []}
        try:
            data = json.loads(m.group())
        except json.JSONDecodeError:
            return {"synthesis": "", "bullets": [], "conflicts": []}
    if not isinstance(data, dict):
        return {"synthesis": "", "bullets": [], "conflicts": []}
    bullets = data.get("bullets") or []
    if not isinstance(bullets, list):
        bullets = []
    conflicts = data.get("conflicts") or []
    if not isinstance(conflicts, list):
        conflicts = []
    clean_conf = []
    for c in conflicts:
        if isinstance(c, dict):
            clean_conf.append(
                {
                    "task_a": c.get("task_a", 0),
                    "task_b": c.get("task_b", 0),
                    "conflict": str(c.get("conflict") or ""),
                }
            )
    return {
        "synthesis": str(data.get("synthesis") or "").strip(),
        "bullets": [str(b).strip() for b in bullets if str(b).strip()],
        "conflicts": clean_conf,
    }


def _plain_answer_snippet(task: AgentTask, max_len: int = 400) -> str:
    fa = task.final_answer or ""
    try:
        p = json.loads(fa)
        if isinstance(p, dict) and isinstance(p.get("sentences"), list):
            fa = " ".join(
                str(s.get("text", "")) for s in p["sentences"] if isinstance(s, dict)
            )
    except (json.JSONDecodeError, TypeError):
        pass
    fa = fa.strip()
    return fa[:max_len] + ("…" if len(fa) > max_len else "")


async def synthesise_tasks(tasks: list[AgentTask]) -> dict[str, Any]:
    """
    After all tasks complete, synthesise findings into a unified cross-task report.
    Model: Claude Sonnet, temp 0.4, timeout 30s.
    """
    if not tasks:
        return {"synthesis": "", "bullets": [], "conflicts": []}

    model = MODEL_REGISTRY.get("claude_sonnet")
    if not model:
        logger.warning("claude_sonnet not in MODEL_REGISTRY")
        return {"synthesis": "", "bullets": [], "conflicts": []}

    client = model["client"]
    provider = str(model.get("provider", "claude"))
    model_id = str(model["model_id"])

    parts = []
    for i, t in enumerate(tasks):
        q = (t.task_text or "").strip()
        ans = _plain_answer_snippet(t, 400)
        parts.append(f"Task {i + 1}: {q}\nAnswer: {ans}")
    user_prompt = "\n\n".join(parts)

    try:
        raw, _, _ = await asyncio.wait_for(
            call_llm(
                client=client,
                provider=provider,
                model_id=model_id,
                system_prompt=SYNTHESIS_SYSTEM,
                user_prompt=user_prompt,
                temperature=0.4,
                max_tokens=2000,
            ),
            timeout=30.0,
        )
        return _parse_synthesis_json(raw)
    except Exception as e:
        logger.warning("synthesise_tasks failed: %s", e)
        return {"synthesis": "", "bullets": [], "conflicts": []}
