import time

from arena.core.blackboard import Blackboard, StageStatus
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

AGENT_MAX_TOKENS = 4096

SYNTHESIZER_SYSTEM_PROMPT = """
You are the Synthesizer stage of an AI reasoning pipeline.

You receive the full pipeline output:
original solution, critique, and verification results.

Your job: produce the final clean answer.

Rules:
- Remove or flag low-confidence claims
- Address the valid criticisms
- Keep only what is supported
- Be direct and well-structured
- Do not add new information
- Do not hedge excessively
- The user should feel this answer is definitive and trustworthy

This is the answer the user will see.
Make it exceptional.
"""


async def run_synthesizer(bb: Blackboard) -> Blackboard:
    start = time.time()
    bb.current_stage = "synthesizer"
    bb.synthesis.status = StageStatus.RUNNING

    try:
        model = MODEL_REGISTRY["claude_sonnet"]

        user_prompt = f"""
Original Task: {bb.task}

Initial Solution:
{bb.solution.output or "None"}

Critique:
{bb.critique.output or "None"}

Verification Results:
{bb.verification.output or "None"}

Synthesise the final answer.
Address all valid criticisms.
Remove unverifiable claims.
Produce the definitive response.
"""

        response = await call_llm(
            client=model["client"],
            provider="claude",
            model_id=model["model_id"],
            system_prompt=SYNTHESIZER_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.4,
            max_tokens=AGENT_MAX_TOKENS,
        )

        bb.synthesis.output = response
        bb.synthesis.model_used = model["model_id"]
        bb.synthesis.status = StageStatus.COMPLETE
        bb.synthesis.duration_ms = int((time.time() - start) * 1000)
        bb.final_answer = response

    except Exception as e:
        bb.synthesis.status = StageStatus.FAILED
        bb.error = f"Synthesizer failed: {e}"
        bb.final_answer = bb.solution.output or f"Unable to synthesize. Task: {bb.task}"
        bb.synthesis.status = StageStatus.COMPLETE

    return bb
