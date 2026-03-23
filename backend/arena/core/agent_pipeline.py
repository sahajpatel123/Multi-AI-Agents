import json
import logging
from datetime import datetime, timezone

from arena.core.blackboard import AgentStatus, Blackboard, StageStatus, create_blackboard
from arena.core.stages.critic import run_critic
from arena.core.stages.judge import run_judge
from arena.core.stages.planner import run_planner
from arena.core.stages.researcher import run_researcher
from arena.core.stages.solver import run_solver
from arena.core.stages.synthesizer import run_synthesizer
from arena.core.stages.verifier import run_verifier

logger = logging.getLogger("arena.agent_pipeline")


async def run_agent_pipeline_on_blackboard(
    bb: Blackboard,
    memory_context: dict | None = None,
) -> Blackboard:
    """Run the full agent pipeline on an existing blackboard (already in active_tasks)."""
    bb.status = AgentStatus.RUNNING

    logger.info(
        "[AGENT] Starting pipeline task_id=%s user_id=%s",
        bb.task_id,
        bb.user_id,
    )

    try:
        bb = await run_planner(bb, memory_context=memory_context)
        bb = await run_researcher(bb)

        if bb.research.status == StageStatus.COMPLETE and bb.research.output:
            try:
                from arena.core.source_integrity import analyze_source_integrity

                integrity_result = await analyze_source_integrity(
                    research_output=bb.research.output,
                    task=bb.task,
                )
                bb.source_integrity = integrity_result
                bb.research.reasoning = json.dumps(integrity_result)
                for contradiction in integrity_result.get("contradictions") or []:
                    if contradiction.get("severity") in ("moderate", "major"):
                        topic = contradiction.get("topic") or "a key point"
                        pa = contradiction.get("position_a") or ""
                        pb = contradiction.get("position_b") or ""
                        bb.flags.append(
                            f"Sources disagree on: {topic} — {pa} vs {pb}"
                        )
            except Exception as e:
                logger.warning("[AGENT] Source integrity skipped: %s", e)

        bb = await run_solver(bb)
        bb = await run_critic(bb)
        bb = await run_verifier(bb)
        bb = await run_synthesizer(bb)
        bb = await run_judge(bb)

        while bb.status == AgentStatus.NEEDS_REVISION:
            bb = await run_solver(bb)
            bb = await run_synthesizer(bb)
            bb = await run_judge(bb)

        if bb.status == AgentStatus.NEEDS_REVISION:
            bb.status = AgentStatus.COMPLETE

        if bb.status == AgentStatus.COMPLETE and bb.completed_at is None:
            bb.completed_at = datetime.now(timezone.utc)

        logger.info(
            "[AGENT] Pipeline complete task_id=%s score=%s confidence=%s",
            bb.task_id,
            bb.final_score,
            bb.final_confidence,
        )

    except Exception as e:
        bb.status = AgentStatus.FAILED
        bb.error = str(e)
        if not bb.final_answer:
            bb.final_answer = bb.synthesis.output or bb.solution.output or ""
        logger.exception(
            "[AGENT] Pipeline failed task_id=%s error=%s",
            bb.task_id,
            e,
        )

    return bb


async def run_agent_pipeline(
    user_id: int,
    task: str,
    memory_context: dict | None = None,
) -> Blackboard:
    """Create a new blackboard and run the pipeline (blocking / tests)."""
    bb = create_blackboard(user_id=user_id, task=task)
    return await run_agent_pipeline_on_blackboard(bb, memory_context=memory_context)
