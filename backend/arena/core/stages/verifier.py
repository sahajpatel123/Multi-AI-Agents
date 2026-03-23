import re
import time

from arena.core.blackboard import Blackboard, StageStatus
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

AGENT_MAX_TOKENS = 4096

VERIFIER_SYSTEM_PROMPT = """
You are the Verifier stage of an AI reasoning pipeline.

You receive a solution and a critique.
Your job is to check facts and assign confidence scores.

For each major claim in the solution:
- Check if it is supported by the research
- Assign a confidence score 0-100
- Flag anything that cannot be verified

Output format:
## Verified Claims
[claims with high confidence 80+]
Each: "Claim — Confidence: XX%"

## Uncertain Claims
[claims with medium confidence 50-79]
Each: "Claim — Confidence: XX% Reason: why uncertain"

## Unverifiable Claims
[claims below 50% confidence]
Each: "Claim — Confidence: XX% Recommendation: remove or flag"

## Overall Confidence Score
[single number 0-100]

## Recommended Flags
[specific items to flag in final output for the user]
"""


async def run_verifier(bb: Blackboard) -> Blackboard:
    if bb.verification.status == StageStatus.SKIPPED:
        return bb

    start = time.time()
    bb.current_stage = "verifier"
    bb.verification.status = StageStatus.RUNNING

    try:
        model = MODEL_REGISTRY["claude_sonnet"]

        user_prompt = f"""
Original Task: {bb.task}

Research Findings:
{bb.research.output or "None"}

Proposed Solution:
{bb.solution.output or "None"}

Critique Received:
{bb.critique.output or "None"}

Verify the solution and assign confidence scores to all claims.
"""

        response = await call_llm(
            client=model["client"],
            provider="claude",
            model_id=model["model_id"],
            system_prompt=VERIFIER_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=AGENT_MAX_TOKENS,
        )

        bb.verification.output = response
        bb.verification.model_used = model["model_id"]
        bb.verification.status = StageStatus.COMPLETE
        bb.verification.duration_ms = int((time.time() - start) * 1000)

        conf_match = re.search(
            r"Overall Confidence Score.*?(\d+)",
            response,
            re.DOTALL | re.IGNORECASE,
        )
        if conf_match:
            bb.final_confidence = float(conf_match.group(1))

    except Exception:
        bb.verification.output = "Verification failed. Confidence unverified."
        bb.verification.status = StageStatus.COMPLETE
        bb.final_confidence = 70.0

    return bb
