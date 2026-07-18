import asyncio
import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

logger = logging.getLogger(__name__)

from arena.core.assumption_surfacer import surface_assumptions
from arena.core.blackboard import AgentStatus, Blackboard, StageStatus, create_blackboard
from arena.core.dissent_engine import generate_dissent_report
from arena.core.intelligence_scorer import calculate_intelligence_score
from arena.core.temporal_classifier import classify_temporal
from arena.core.stages.critic import run_critic
from arena.core.stages.judge import run_judge
from arena.core.stages.planner import run_planner
from arena.core.stages.researcher import run_researcher
from arena.core.stages.solver import run_solver
from arena.core.stages.synthesizer import run_synthesizer
from arena.core.stages.verifier import run_verifier

logger = logging.getLogger("arena.agent_pipeline")


async def _safe_insight_synthesis(bb: Blackboard) -> dict | None:
    if not bb.user_id:
        return None
    from arena.database import SessionLocal
    from arena.db_models import AgentTask
    from arena.core.insight_synthesizer import synthesize_insights

    db = SessionLocal()
    try:
        recent = (
            db.query(AgentTask)
            .filter(
                AgentTask.user_id == bb.user_id,
                AgentTask.task_id != bb.task_id,
            )
            .order_by(AgentTask.created_at.desc())
            .limit(10)
            .all()
        )
        if len(recent) < 3:
            return None
        return await synthesize_insights(
            [t.to_dict_summary() for t in recent],
            bb.task,
            bb=bb,
        )
    except Exception as e:
        logger.warning("[PIPELINE] insight synthesis skipped: %s", e)
        return None
    finally:
        db.close()


async def _safe_pipeline_contradictions(bb: Blackboard) -> list:
    if not bb.user_id:
        return []
    from arena.database import SessionLocal
    from arena.db_models import AgentTask
    from arena.core.pipeline_contradiction_detector import detect_contradictions

    db = SessionLocal()
    try:
        past = (
            db.query(AgentTask)
            .filter(
                AgentTask.user_id == bb.user_id,
                AgentTask.task_id != bb.task_id,
            )
            .order_by(AgentTask.created_at.desc())
            .limit(10)
            .all()
        )
        if not past:
            return []
        plain = _plain_answer_text(bb.final_answer or "")
        return await detect_contradictions(
            plain,
            bb.task,
            [t.to_dict_summary() for t in past],
            bb=bb,
        )
    except Exception as e:
        logger.warning("[PIPELINE] contradiction detector skipped: %s", e)
        return []
    finally:
        db.close()


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


def record_agent_task_usage(bb: Blackboard) -> None:
    """Persist one UsageRecord for a completed agent run (real token totals on blackboard)."""
    if not bb.user_id or bb.status != AgentStatus.COMPLETE:
        return
    from arena.database import SessionLocal
    from arena.db_models import UsageRecord

    db = SessionLocal()
    try:
        usage = UsageRecord(
            user_id=bb.user_id,
            session_id=bb.task_id,
            request_id=str(uuid4()),
            input_tokens=bb.total_input_tokens,
            output_tokens=bb.total_output_tokens,
            mode="agent",
            prompt_category="agent_task",
            timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        db.add(usage)
        db.commit()
    except Exception:
        # Use logger.exception so the traceback lands in the same stream
        # as the rest of the structured logs; a print() here would be
        # the only thing on stdout in a process otherwise wired to
        # the JSON logger.
        logger.exception("Usage tracking failed for task_id=%s", bb.task_id)
        db.rollback()
    finally:
        db.close()


async def _run_steelman_step(bb: Blackboard) -> None:
    from arena.core.steelman_generator import generate_steelman

    try:
        bb.steelman = await generate_steelman(
            question=bb.task,
            research_summary=(bb.research.output or "").strip(),
            expertise_modifier=bb.expertise_modifier or "",
            bb=bb,
        )
    except Exception as e:
        logger.warning("[AGENT] Steelman step failed: %s", e)
        bb.steelman = {
            "opposing_position": "",
            "key_arguments": [],
            "strongest_evidence": "",
            "concession": "",
        }


async def run_agent_pipeline_on_blackboard(
    bb: Blackboard,
    memory_context: dict | None = None,
    expertise_level: str | None = None,
    expertise_domain: str | None = None,
) -> Blackboard:
    """Run the full agent pipeline on an existing blackboard (already in active_tasks)."""
    from arena.core.expertise_calibrator import get_expertise_modifier

    bb.status = AgentStatus.RUNNING

    if expertise_level is not None:
        bb.expertise_level = str(expertise_level).strip().lower() or "curious"
    if expertise_domain is not None:
        bb.expertise_domain = str(expertise_domain).strip()
    bb.expertise_modifier = get_expertise_modifier(bb.expertise_level, bb.expertise_domain)

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
                    bb=bb,
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

        await _run_steelman_step(bb)

        bb = await run_solver(bb)
        bb = await run_critic(bb)
        bb = await run_verifier(bb)
        bb = await run_synthesizer(bb)
        bb = await run_judge(bb)

        while bb.status == AgentStatus.NEEDS_REVISION:
            bb = await run_solver(bb)
            bb = await run_synthesizer(bb)
            bb = await run_judge(bb)

        if bb.status != AgentStatus.FAILED and bb.final_answer:
            async def safe_score(bb):
                try:
                    return await calculate_intelligence_score(
                        task=bb.task,
                        final_answer=bb.final_answer,
                        research_output=bb.research.output or "",
                        judgment_output=bb.judgment.output or "",
                        bb=bb,
                    )
                except Exception:
                    return {}

            async def safe_assume(bb):
                try:
                    return await surface_assumptions(
                        task=bb.task,
                        final_answer=bb.final_answer,
                        bb=bb,
                    )
                except Exception:
                    return {}

            async def safe_dissent(bb):
                try:
                    return await wait_for(
                        generate_dissent_report(
                            question=bb.task,
                            final_answer=bb.final_answer,
                            critique_output=getattr(bb.critique, 'output', '') or ''
                        ), timeout=25)
                except Exception:
                    return {"positions": [], "minority_view_summary": ""}

            async def safe_temporal(bb):
                try:
                    return await wait_for(
                        classify_temporal(
                            question=bb.task,
                            final_answer=bb.final_answer
                        ), timeout=25)
                except Exception:
                    return {"decay_class": "durable", "half_life": "2–5 years", "recheck_by": None, "decay_reason": "", "time_sensitive_claims": []}

            try:
                results = await asyncio.gather(
                    safe_score(bb),
                    safe_assume(bb),
                    safe_dissent(bb),
                    safe_temporal(bb),
                    return_exceptions=True
                )

                bb.intelligence_score = results[0] if not isinstance(results[0], Exception) else {}
                bb.assumptions = results[1] if not isinstance(results[1], Exception) else {}
                bb.dissent_report = results[2] if not isinstance(results[2], Exception) else None
                bb.temporal_profile = results[3] if not isinstance(results[3], Exception) else None

                for assumption in bb.assumptions.get("assumptions", []):
                    if assumption.get("criticality") == "high" and assumption.get("flag"):
                        bb.flags.append(f"Assumption: {assumption['assumption']}")

                logger.info(
                    "[PIPELINE] Intelligence=%s/100 Assumptions=%s",
                    bb.intelligence_score.get("total_score"),
                    bb.assumptions.get("assumption_count", 0),
                )
            except Exception as e:
                logger.warning("Post-processing failed, continuing: %s", e)
                bb.intelligence_score = {}
                bb.assumptions = {}
                bb.dissent_report = None
                bb.temporal_profile = None

            ins_raw, con_raw = await asyncio.gather(
                _safe_insight_synthesis(bb),
                _safe_pipeline_contradictions(bb),
                return_exceptions=True,
            )
            bb.insight_report = None if isinstance(ins_raw, Exception) else ins_raw
            bb.cross_task_contradictions = (
                [] if isinstance(con_raw, Exception) else list(con_raw or [])
            )

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
        bb=existing_bb,
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

    from arena.core.expertise_calibrator import get_expertise_modifier

    existing_bb.is_refinement = True
    existing_bb.refinement_count += 1
    existing_bb.status = AgentStatus.RUNNING
    existing_bb.current_stage = "refining"
    existing_bb.plan.reasoning = refinement_context
    existing_bb.expertise_modifier = get_expertise_modifier(
        getattr(existing_bb, "expertise_level", "curious") or "curious",
        getattr(existing_bb, "expertise_domain", "") or "",
    )

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
            await _run_steelman_step(existing_bb)

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
    expertise_level: str = "curious",
    expertise_domain: str = "",
) -> Blackboard:
    """Create a new blackboard and run the pipeline (blocking / tests)."""
    bb = create_blackboard(user_id=user_id, task=task)
    return await run_agent_pipeline_on_blackboard(
        bb,
        memory_context=memory_context,
        expertise_level=expertise_level,
        expertise_domain=expertise_domain,
    )
