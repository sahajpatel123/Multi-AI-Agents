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


def _plain_answer_text(answer: str) -> str:
    if not answer:
        return ""
    try:
        parsed = json.loads(answer)
        if isinstance(parsed, dict) and parsed.get("sentences"):
            return " ".join(
                str(s.get("text", "")) for s in parsed["sentences"] if isinstance(s, dict)
            )
    except (json.JSONDecodeError, TypeError, KeyError):
        pass
    return answer


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

        if bb.status == AgentStatus.COMPLETE and not bb.conversation:
            bb.add_message("user", bb.original_task or bb.task)
            bb.add_message("agent", _plain_answer_text(bb.final_answer))

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


def _format_refinement_conversation(conversation: list) -> str:
    if not conversation:
        return "No prior messages"
    lines: list[str] = []
    for msg in conversation[-4:]:
        role = msg.get("role", "?")
        content = str(msg.get("content", ""))[:200]
        lines.append(f"{str(role).upper()}: {content}")
    return "\n".join(lines)


def _mark_stage_pending(bb: Blackboard, stage: str) -> None:
    mapping = {
        "planner": bb.plan,
        "researcher": bb.research,
        "critic": bb.critique,
        "solver": bb.solution,
        "verifier": bb.verification,
        "synthesizer": bb.synthesis,
        "judge": bb.judgment,
    }
    if stage in mapping:
        mapping[stage].status = StageStatus.PENDING


async def run_refinement_pipeline(
    existing_bb: Blackboard,
    user_message: str,
    user_id: int,
) -> Blackboard:
    """Refine an existing Agent answer in-place on the same blackboard."""
    from arena.core.refinement_classifier import classify_refinement

    _ = user_id

    logger.info(
        "[REFINEMENT] Starting refinement for task %s message=%r",
        existing_bb.task_id,
        user_message[:50],
    )

    existing_bb.add_message(role="user", content=user_message, refinement_type=None)

    current_answer = _plain_answer_text(existing_bb.final_answer or "")

    intent = await classify_refinement(
        user_message=user_message,
        current_answer=current_answer,
    )

    logger.info(
        "[REFINEMENT] Intent: %s stages: %s",
        intent.get("type"),
        intent.get("stages_needed"),
    )

    base_task = (existing_bb.original_task or existing_bb.task or "").strip()
    if not existing_bb.parent_task_id:
        existing_bb.parent_task_id = existing_bb.task_id

    refinement_context = f"""
REFINEMENT REQUEST:
Original task: {base_task}
User follow-up: {user_message}
Refinement type: {intent.get("type")}
Focus: {intent.get("focus")}
Instruction: {intent.get("instruction")}

Previous answer summary:
{current_answer[:1000]}

Conversation history:
{_format_refinement_conversation(existing_bb.conversation[:-1])}

IMPORTANT: This is a refinement of an existing answer.
Build on what already exists.
Do not start from scratch.
Address specifically: {intent.get("instruction")}
"""

    existing_bb.is_refinement = True
    existing_bb.refinement_count += 1
    existing_bb.status = AgentStatus.RUNNING
    existing_bb.current_stage = "refining"
    existing_bb.plan.reasoning = refinement_context

    stages_needed = list(intent.get("stages_needed") or ["solver", "synthesizer"])
    stages_set = set(stages_needed)
    if "synthesizer" not in stages_set:
        stages_set.add("synthesizer")

    execution_order = ["planner", "researcher", "critic", "solver", "verifier"]
    to_run = [s for s in execution_order if s in stages_set]

    try:
        saved_task = existing_bb.task

        for stage in to_run:
            _mark_stage_pending(existing_bb, stage)

        if "planner" in stages_set:
            existing_bb.plan.reasoning = refinement_context
            existing_bb = await run_planner(existing_bb)

        if "researcher" in stages_set:
            existing_bb.task = f"{base_task}\n\nFOCUS: {intent.get('focus')}"
            existing_bb = await run_researcher(existing_bb)
            existing_bb.task = saved_task

        if "critic" in stages_set:
            existing_bb.solution.output = current_answer
            existing_bb = await run_critic(existing_bb)

        if "solver" in stages_set:
            existing_bb.plan.reasoning = refinement_context
            existing_bb = await run_solver(existing_bb)

        if "verifier" in stages_set:
            existing_bb = await run_verifier(existing_bb)

        _mark_stage_pending(existing_bb, "synthesizer")
        existing_bb.plan.reasoning = refinement_context
        existing_bb = await run_synthesizer(existing_bb)

        _mark_stage_pending(existing_bb, "judge")
        existing_bb = await run_judge(existing_bb)
        if existing_bb.status == AgentStatus.NEEDS_REVISION:
            existing_bb.status = AgentStatus.COMPLETE
            existing_bb.completed_at = datetime.now(timezone.utc)

        existing_bb.add_message(
            role="agent",
            content=_plain_answer_text(existing_bb.final_answer or ""),
            refinement_type=str(intent.get("type") or "followup"),
        )

        logger.info(
            "[REFINEMENT] Complete task=%s refinement_count=%s",
            existing_bb.task_id,
            existing_bb.refinement_count,
        )

    except Exception as e:
        existing_bb.status = AgentStatus.FAILED
        existing_bb.error = str(e)
        logger.exception("[REFINEMENT] Failed: %s", e)

    return existing_bb


async def run_agent_pipeline(
    user_id: int,
    task: str,
    memory_context: dict | None = None,
) -> Blackboard:
    """Create a new blackboard and run the pipeline (blocking / tests)."""
    bb = create_blackboard(user_id=user_id, task=task)
    return await run_agent_pipeline_on_blackboard(bb, memory_context=memory_context)
