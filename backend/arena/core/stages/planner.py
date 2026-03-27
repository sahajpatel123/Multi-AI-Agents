import json
import re
import time

from arena.core.blackboard import Blackboard, StageStatus
from arena.core.expertise_calibrator import append_expertise_to_system
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

AGENT_MAX_TOKENS = 4096

PLANNER_SYSTEM_PROMPT = """
You are the Planner stage of an AI reasoning pipeline.

Your job:
1. Analyse the user's task carefully
2. Decide which pipeline stages are needed
3. Create a clear execution plan

Available stages:
- researcher: needed if task requires current information, facts, news, or data from the web
- solver: always needed
- critic: needed for complex tasks, opinions, or multi-step reasoning
- verifier: needed when facts and accuracy are important
- synthesizer: always needed
- judge: always runs

You may also receive context about the user's research history.
Use this to:
1. Avoid repeating conclusions already established
2. Build on prior research
3. Note if this task relates to past topics

Output your plan as JSON only.
No preamble. No explanation.
Just valid JSON.

Format:
{
  "task_type": "research|analysis|writing|planning|coding|general",
  "complexity": "simple|moderate|complex",
  "needs_research": true|false,
  "needs_critic": true|false,
  "needs_verifier": true|false,
  "execution_plan": "2-3 sentence description of how to approach this task",
  "key_questions": ["question 1 to answer", "question 2 to answer"],
  "search_queries": ["search query 1", "search query 2"],
  "expected_output_format": "paragraph|list|report|code|mixed"
}
"""


async def run_planner(bb: Blackboard, memory_context: dict | None = None) -> Blackboard:
    start = time.time()
    bb.current_stage = "planner"
    bb.plan.status = StageStatus.RUNNING

    try:
        model = MODEL_REGISTRY["claude_sonnet"]

        user_prompt = f"Task: {bb.task}"
        if memory_context and memory_context.get("task_count", 0) > 0:
            top = memory_context.get("top_topics") or []
            topics_str = ", ".join(str(t) for t in top) if top else "(none listed)"
            memory_str = f"""
User research history context:
- Past tasks completed: {memory_context.get("task_count", 0)}
- Top research topics: {topics_str}
"""
            user_prompt = f"Task: {bb.task}\n\n{memory_str}"

        response = await call_llm(
            client=model["client"],
            provider="claude",
            model_id=model["model_id"],
            system_prompt=append_expertise_to_system(PLANNER_SYSTEM_PROMPT, bb.expertise_modifier),
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=AGENT_MAX_TOKENS,
        )

        json_match = re.search(r"\{.*\}", response, re.DOTALL)
        if json_match:
            plan_data = json.loads(json_match.group())
        else:
            plan_data = json.loads(response)

        bb.plan.output = json.dumps(plan_data, indent=2)
        bb.plan.model_used = model["model_id"]
        bb.plan.status = StageStatus.COMPLETE
        bb.plan.duration_ms = int((time.time() - start) * 1000)
        bb.plan.reasoning = plan_data.get("execution_plan", "")

        if not plan_data.get("needs_research", True):
            bb.research.status = StageStatus.SKIPPED
        if not plan_data.get("needs_critic", True):
            bb.critique.status = StageStatus.SKIPPED
        if not plan_data.get("needs_verifier", True):
            bb.verification.status = StageStatus.SKIPPED

    except Exception as e:
        bb.plan.status = StageStatus.FAILED
        bb.plan.error = str(e)
        bb.plan.output = json.dumps(
            {
                "needs_research": True,
                "needs_critic": True,
                "needs_verifier": True,
                "execution_plan": "Research and analyse the task thoroughly.",
                "search_queries": [bb.task],
            }
        )
        try:
            plan_data = json.loads(bb.plan.output)
            bb.plan.reasoning = plan_data.get("execution_plan", "")
        except Exception:
            bb.plan.reasoning = ""

    return bb
