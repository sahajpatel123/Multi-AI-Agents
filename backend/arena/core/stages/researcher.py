import json
import time

from arena.core.blackboard import Blackboard, StageStatus
from arena.core.expertise_calibrator import append_expertise_to_system
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

AGENT_MAX_TOKENS = 4096

RESEARCHER_SYSTEM_PROMPT = """
You are the Researcher stage of an AI reasoning pipeline.

You receive a task and an execution plan. Your job is to gather all
relevant information needed to solve the task.

Be thorough and specific.
Cite what you found and where.
Flag anything uncertain.
Organise findings clearly.

Output format:
## Key Findings
[bullet points of most important facts]

## Context
[background information relevant to task]

## Data Points
[specific numbers, dates, names if relevant]

## Sources & Confidence
[what you found and how confident you are in each piece]

## Gaps
[what you could not find or verify]

## Sources Found
For each piece of information found, label sources clearly:
SOURCE_1: [what this source says]
SOURCE_2: [what this source says]
SOURCE_3: [what this source says]

If sources AGREE on a point:
AGREEMENT: [the agreed point]
AGREEMENT_COUNT: [number]

If sources DISAGREE on a point:
DISAGREEMENT: [the contested point]
SOURCE_A_SAYS: [position A]
SOURCE_B_SAYS: [position B]
"""


async def run_researcher(bb: Blackboard) -> Blackboard:
    if bb.research.status == StageStatus.SKIPPED:
        return bb

    start = time.time()
    bb.current_stage = "researcher"
    bb.research.status = StageStatus.RUNNING

    try:
        plan_data: dict = {}
        if bb.plan.output:
            try:
                plan_data = json.loads(bb.plan.output)
            except Exception:
                pass

        search_queries = plan_data.get("search_queries", [bb.task])
        if not isinstance(search_queries, list):
            search_queries = [bb.task]

        search_context = ""
        try:
            from arena.core.tools.web_search import WebSearchTool

            search_tool = WebSearchTool()
            search_results: list[str] = []
            for query in search_queries[:3]:
                q = str(query).strip() if query else bb.task
                result = await search_tool.execute(q)
                if result.success:
                    search_results.append(
                        f"Query: {q}\n{result.to_context_string()}"
                    )
                else:
                    search_results.append(f"Query: {q}\n[search failed: {result.error}]")
            search_context = "\n\n".join(search_results)
        except Exception as search_err:
            search_context = (
                f"Web search unavailable: {search_err}. Using training knowledge."
            )

        grok_model = MODEL_REGISTRY.get("grok_3", MODEL_REGISTRY["claude_sonnet"])
        provider = str(grok_model.get("provider", "grok"))

        user_prompt = f"""
Task: {bb.task}

Execution Plan: {bb.plan.reasoning}

Search Results:
{search_context}

Please research this task thoroughly and provide all relevant findings.
"""

        response, inp, out = await call_llm(
            client=grok_model["client"],
            provider=provider,
            model_id=grok_model["model_id"],
            system_prompt=append_expertise_to_system(RESEARCHER_SYSTEM_PROMPT, bb.expertise_modifier),
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=AGENT_MAX_TOKENS,
        )
        bb.total_input_tokens += inp
        bb.total_output_tokens += out

        bb.research.output = response
        bb.research.model_used = grok_model["model_id"]
        bb.research.status = StageStatus.COMPLETE
        bb.research.duration_ms = int((time.time() - start) * 1000)

    except Exception as e:
        bb.research.status = StageStatus.FAILED
        bb.research.error = str(e)
        bb.research.output = (
            f"Research failed: {e}. Proceeding with available knowledge."
        )
        bb.research.status = StageStatus.COMPLETE

    return bb
