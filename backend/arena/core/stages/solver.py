import time

from arena.core.blackboard import Blackboard, StageStatus
from arena.core.expertise_calibrator import append_expertise_to_system
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

AGENT_MAX_TOKENS = 4096

SOLVER_SYSTEM_PROMPT = """
You are the Solver stage of an AI reasoning pipeline.

You receive a task, an execution plan, and research findings.

Your job: produce the best possible answer to the task using all available context.

Be direct and specific.
Use the research findings as evidence.
Structure your answer clearly.
Do not hedge unnecessarily.
If something is uncertain, say so.

Output a comprehensive answer that directly addresses the task.
"""


def _steelman_prompt_block(bb: Blackboard) -> str:
    sm = bb.steelman
    if not sm or not isinstance(sm, dict):
        return ""
    opp = str(sm.get("opposing_position") or "").strip()
    if not opp:
        return ""
    ev = str(sm.get("strongest_evidence") or "").strip()
    con = str(sm.get("concession") or "").strip()
    return f"""STEELMAN AWARENESS — engage before committing:
Strongest opposing view: {opp}
Most compelling evidence: {ev}
What it gets right (must acknowledge): {con}

Your answer must engage with this. Acknowledge where it is correct. Explain disagreement with evidence where you differ.""".strip()


async def run_solver(bb: Blackboard) -> Blackboard:
    start = time.time()
    bb.current_stage = "solver"
    bb.solution.status = StageStatus.RUNNING

    try:
        model = MODEL_REGISTRY["claude_sonnet"]

        revision = ""
        if bb.iterations > 0 and bb.judgment.output:
            revision = (
                "\n\nRevision feedback from the judge (address this in your answer):\n"
                f"{bb.judgment.output}\n"
            )

        user_prompt = f"""
Task: {bb.task}

Execution Plan:
{bb.plan.reasoning}

Research Findings:
{bb.research.output or "No research available."}
{revision}
Provide a comprehensive answer to this task.
"""

        steelman_block = _steelman_prompt_block(bb)
        solver_core = SOLVER_SYSTEM_PROMPT.rstrip()
        if steelman_block:
            solver_core = f"{solver_core}\n\n{steelman_block}"
        system_prompt = append_expertise_to_system(solver_core, bb.expertise_modifier)

        response = await call_llm(
            client=model["client"],
            provider="claude",
            model_id=model["model_id"],
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.5,
            max_tokens=AGENT_MAX_TOKENS,
        )

        bb.solution.output = response
        bb.solution.model_used = model["model_id"]
        bb.solution.status = StageStatus.COMPLETE
        bb.solution.duration_ms = int((time.time() - start) * 1000)

    except Exception as e:
        bb.solution.status = StageStatus.FAILED
        bb.solution.error = str(e)
        bb.solution.output = (
            f"Solver could not complete normally ({e}). "
            f"Best-effort: directly consider the task: {bb.task}"
        )
        bb.solution.status = StageStatus.COMPLETE

    return bb
