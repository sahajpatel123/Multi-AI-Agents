import time

from arena.core.blackboard import Blackboard, StageStatus
from arena.core.expertise_calibrator import append_expertise_to_system
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

AGENT_MAX_TOKENS = 4096

CRITIC_SYSTEM_PROMPT = """
You are the Critic stage of an AI reasoning pipeline.

You receive a proposed solution to a task. Your job is to find weaknesses, gaps, and errors.

Be ruthlessly honest.
Find logical flaws.
Identify unsupported claims.
Point out missing perspectives.
Flag potential errors.

Do NOT suggest improvements here.
Only identify problems.

Output format:
## Critical Weaknesses
[major problems with the solution]

## Unsupported Claims
[statements made without evidence]

## Missing Perspectives
[important angles not considered]

## Logic Gaps
[reasoning errors or leaps]

## Overall Assessment
[brief summary of how much the solution needs revision:
minor_revision|major_revision|acceptable]
"""


async def run_critic(bb: Blackboard) -> Blackboard:
    if bb.critique.status == StageStatus.SKIPPED:
        return bb

    start = time.time()
    bb.current_stage = "critic"
    bb.critique.status = StageStatus.RUNNING

    try:
        model = MODEL_REGISTRY.get("deepseek_v4_flash", MODEL_REGISTRY["claude_sonnet"])
        provider = str(model.get("provider", "deepseek"))

        user_prompt = f"""
Original Task: {bb.task}

Proposed Solution:
{bb.solution.output or "(empty)"}

Critically analyse this solution.
Find every weakness and gap.
"""

        response, inp, out = await call_llm(
            client=model["client"],
            provider=provider,
            model_id=model["model_id"],
            system_prompt=append_expertise_to_system(CRITIC_SYSTEM_PROMPT, bb.expertise_modifier),
            user_prompt=user_prompt,
            temperature=0.4,
            max_tokens=AGENT_MAX_TOKENS,
        )
        bb.total_input_tokens += inp
        bb.total_output_tokens += out

        bb.critique.output = response
        bb.critique.model_used = model["model_id"]
        bb.critique.status = StageStatus.COMPLETE
        bb.critique.duration_ms = int((time.time() - start) * 1000)

    except Exception:
        bb.critique.status = StageStatus.FAILED
        bb.critique.output = "Critic stage failed. Proceeding without critique."
        bb.critique.status = StageStatus.COMPLETE

    return bb
