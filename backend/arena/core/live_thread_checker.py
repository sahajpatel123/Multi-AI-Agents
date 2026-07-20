"""Periodic live research refresh for Agent tasks (researcher-only re-run)."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from arena.core.blackboard import Blackboard, StageStatus
from arena.core.capabilities import evaluate_capability_gate
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY
from arena.core.stages.researcher import run_researcher
from arena.core.telemetry import record_guard_decision
from arena.db_models import AgentTask

logger = logging.getLogger("arena.live_thread_checker")




def _gate_live_task_text(task_text: str) -> dict:
    """Shared honesty decision for live re-runs (testable without LLM)."""
    return evaluate_capability_gate(
        capability_id="agent.research",
        task_text=task_text,
    )


def _reschedule_hours(task: AgentTask) -> int:
    """Resolve the next-check window for a live task.

    Reads ``task.live_reschedule_hours`` and clamps to a sane range
    (1h–7d) so a misconfigured value cannot starve or burn the budget.
    Defaults to 24h when the column is unset (None on freshly-built
    ORM instances), preserving the prior contract for tasks written
    before this column shipped.
    """
    raw = getattr(task, "live_reschedule_hours", None)
    if raw is None:
        return 24
    try:
        raw_int = int(raw)
    except (TypeError, ValueError):
        return 24
    return max(1, min(raw_int, 24 * 7))


async def check_if_update_meaningful(
    original: str,
    new_research: str,
    question: str,
) -> bool:
    model = MODEL_REGISTRY.get("deepseek_v4_flash") or MODEL_REGISTRY.get("gpt_4o")
    client = model["client"]
    provider = str(model.get("provider", "deepseek"))
    user_prompt = (
        f"Question: {question[:400]}\n\n"
        f"Original answer summary: {original[:400]}\n\n"
        f"New research: {new_research[:400]}\n\n"
        "Does new research contain meaningfully new information not in the original answer? "
        "Reply with only yes or no."
    )
    try:
        raw, _, _ = await asyncio.wait_for(
            call_llm(
                client=client,
                provider=provider,
                model_id=model["model_id"],
                system_prompt="Return only 'yes' or 'no'.",
                user_prompt=user_prompt,
                temperature=0.1,
                max_tokens=8,
            ),
            timeout=10.0,
        )
    except Exception as e:
        logger.warning("[LIVE] meaningful check failed: %s", e)
        return False
    t = (raw or "").strip().lower()
    return t.startswith("y")


async def run_researcher_for_live_task(task: AgentTask) -> str:
    """Run researcher stage only (minimal planner stub). Does not register blackboard globally."""
    bb = Blackboard(
        user_id=int(task.user_id),
        task=task.task_text,
        original_task=task.task_text,
    )
    bb.task_id = f"live-{uuid4()}"
    bb.plan.status = StageStatus.COMPLETE
    bb.plan.output = json.dumps({"search_queries": [task.task_text]})
    bb.plan.reasoning = "Live thread: re-research the original question only."
    bb.expertise_modifier = ""
    await run_researcher(bb)
    return (bb.research.output or "").strip()


async def check_live_task(task: AgentTask, db: Session) -> bool:
    """
    Re-run researcher on the stored question; if findings are meaningfully new vs final answer,
    append to live_updates. Always advances last_checked and next_check.

    When honest rejection is on and the stored question needs the user's machine,
    skip the web researcher re-run (no theater) and still advance the schedule.
    """
    now = utcnow_naive()
    if task.live_next_check and task.live_next_check > now:
        return False

    db.refresh(task)
    interval_hours = _reschedule_hours(task)

    gate = _gate_live_task_text(task.task_text or "")
    record_guard_decision(gate["capability_id"], f"live_{gate['decision']}")
    if gate["decision"] == "reject":
        logger.warning(
            "[LIVE] skip local-intent task_id=%s env=%s (needs Condura; honesty on)",
            task.task_id,
            gate["env"].value,
        )
        task.live_last_checked = now
        task.live_next_check = now + timedelta(hours=interval_hours)
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            logger.warning("[LIVE] commit failed task_id=%s: %s", task.task_id, e)
            raise
        return False
    if gate["decision"] == "fallback":
        logger.info(
            "[LIVE] local-intent task_id=%s env=%s (flag off — web fallback)",
            task.task_id,
            gate["env"].value,
        )

    new_research = ""
    try:
        new_research = await run_researcher_for_live_task(task)
    except Exception as e:
        logger.exception("[LIVE] researcher failed task_id=%s: %s", task.task_id, e)

    is_new = False
    if new_research:
        is_new = await check_if_update_meaningful(
            original=task.final_answer or "",
            new_research=new_research,
            question=task.task_text,
        )

    if is_new:
        updates = list(task.live_updates or [])
        if not isinstance(updates, list):
            updates = []
        updates.append(
            {
                "id": str(uuid4()),
                "summary": new_research[:300],
                "found_at": utcnow_naive().isoformat(),
                "status": "unread",
            }
        )
        task.live_updates = updates

    task.live_last_checked = now
    task.live_next_check = now + timedelta(hours=interval_hours)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning("[LIVE] commit failed task_id=%s: %s", task.task_id, e)
        raise
    return is_new
