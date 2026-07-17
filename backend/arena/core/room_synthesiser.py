"""Cross-member synthesis for shared research rooms."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional

from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY
from arena.db_models import AgentTask, Room, User

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are analysing research from multiple people working on a shared topic. Identify:
1. Direct contradictions between members' findings
2. Shared patterns that appear across multiple tasks
3. Collective blind spots — angles nobody explored
4. A unified synthesis of what the group knows

Return ONLY valid JSON:
{
  "contradictions": [
    {
      "member_a": "name",
      "member_b": "name",
      "claim_a": "under 15 words",
      "claim_b": "under 15 words",
      "resolution_hint": "one sentence"
    }
  ],
  "patterns": ["pattern 1", "pattern 2"],
  "blind_spots": ["gap 1", "gap 2"],
  "synthesis": "2-3 sentence group conclusion"
}
""".strip()


def _empty_result() -> Dict[str, Any]:
    return {
        "contradictions": [],
        "patterns": [],
        "blind_spots": [],
        "synthesis": "",
    }


def _parse_json_object(text: str) -> Optional[Dict[str, Any]]:
    raw = (text or "").strip()
    if not raw:
        return None
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if fence:
        raw = fence.group(1).strip()
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, TypeError):
        return None


async def synthesise_room(
    room: Room,
    tasks: List[AgentTask],
    members: List[User],
) -> Optional[Dict[str, Any]]:
    """
    Runs cross-member synthesis across all tasks in the room.
    Returns None if fewer than 2 tasks (no synthesis).
    On failure returns empty-shaped dict per product contract.
    """
    _ = room
    if len(tasks) < 2:
        return None

    member_by_id = {m.id: m for m in members}

    def _member_name(uid: int) -> str:
        u = member_by_id.get(uid)
        if not u:
            return "Unknown"
        n = (getattr(u, "name", None) or "").strip()
        return n or (getattr(u, "email", None) or "Unknown").split("@")[0]

    task_summaries = "\n\n".join(
        [
            f"Member: {_member_name(t.user_id)}\n"
            f"Question: {(t.task_text or '')[:500]}\n"
            f"Answer summary: {(t.final_answer or '')[:300]}"
            for t in tasks
        ]
    )

    model = MODEL_REGISTRY["claude_sonnet"]
    client = model["client"]
    model_id = str(model["model_id"])
    provider = str(model.get("provider", "claude"))

    try:
        text, _, _ = await asyncio.wait_for(
            call_llm(
                client,
                provider,
                model_id,
                SYSTEM_PROMPT,
                task_summaries,
                temperature=0.4,
                max_tokens=2048,
            ),
            timeout=40.0,
        )
    except asyncio.TimeoutError:
        logger.warning("room synthesis timed out")
        return _empty_result()
    except Exception as exc:
        logger.warning("room synthesis failed: %s", exc)
        return _empty_result()

    parsed = _parse_json_object(text)
    if not parsed:
        logger.warning("room synthesis returned non-JSON")
        return _empty_result()

    out = _empty_result()
    if isinstance(parsed.get("contradictions"), list):
        out["contradictions"] = parsed["contradictions"]
    if isinstance(parsed.get("patterns"), list):
        out["patterns"] = [str(x) for x in parsed["patterns"]]
    if isinstance(parsed.get("blind_spots"), list):
        out["blind_spots"] = [str(x) for x in parsed["blind_spots"]]
    if parsed.get("synthesis") is not None:
        out["synthesis"] = str(parsed.get("synthesis") or "")

    return out
