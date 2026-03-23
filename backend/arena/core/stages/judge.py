import json
import re
import time
from datetime import datetime, timezone

from arena.core.blackboard import AgentStatus, Blackboard, StageStatus
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

AGENT_MAX_TOKENS = 2048

JUDGE_SYSTEM_PROMPT = """
You are the Judge stage of an AI reasoning pipeline.

You receive the final synthesised answer to a task.

Your job: score it and decide if it passes the quality bar.

Scoring criteria:
- Completeness (0-25): Does it fully answer the task?
- Accuracy (0-25): Are claims supported and accurate?
- Clarity (0-25): Is it clear and well-structured?
- Usefulness (0-25): Is it genuinely useful to the user?

Output JSON only. No preamble.

{
  "completeness": 0-25,
  "accuracy": 0-25,
  "clarity": 0-25,
  "usefulness": 0-25,
  "total_score": 0-100,
  "verdict": "pass|needs_revision",
  "revision_reason": "only if needs_revision",
  "key_strengths": ["strength 1", "strength 2"],
  "summary": "one sentence verdict"
}

Pass threshold: 70+
"""


async def run_judge(bb: Blackboard) -> Blackboard:
    start = time.time()
    bb.current_stage = "judge"
    bb.judgment.status = StageStatus.RUNNING

    try:
        model = MODEL_REGISTRY.get("deepseek_v3", MODEL_REGISTRY["claude_sonnet"])
        provider = str(model.get("provider", "deepseek"))

        user_prompt = f"""
Original Task: {bb.task}

Final Answer to Judge:
{bb.final_answer}

Score this answer objectively.
"""

        response = await call_llm(
            client=model["client"],
            provider=provider,
            model_id=model["model_id"],
            system_prompt=JUDGE_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=AGENT_MAX_TOKENS,
        )

        json_match = re.search(r"\{.*\}", response, re.DOTALL)
        judgment_data: dict = {}
        if json_match:
            try:
                judgment_data = json.loads(json_match.group())
            except Exception:
                pass

        bb.judgment.output = response
        bb.judgment.model_used = model["model_id"]
        bb.judgment.status = StageStatus.COMPLETE
        bb.judgment.duration_ms = int((time.time() - start) * 1000)

        total_score = judgment_data.get("total_score", 75)
        try:
            bb.final_score = int(total_score)
        except (TypeError, ValueError):
            bb.final_score = 75

        verdict = str(judgment_data.get("verdict", "pass")).lower()

        if verdict == "needs_revision" and bb.iterations < bb.max_iterations:
            bb.status = AgentStatus.NEEDS_REVISION
            bb.iterations += 1
        else:
            bb.status = AgentStatus.COMPLETE
            bb.completed_at = datetime.now(timezone.utc)

    except Exception:
        bb.judgment.status = StageStatus.COMPLETE
        bb.judgment.output = "Judgment failed."
        bb.final_score = 75
        bb.status = AgentStatus.COMPLETE
        bb.completed_at = datetime.now(timezone.utc)

    return bb
