import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from arena.core.agent_pipeline import run_agent_pipeline_on_blackboard
from arena.core.auth import get_current_user_required
from arena.core.blackboard import AgentStatus, Blackboard, create_blackboard, get_blackboard
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY
from arena.core.tier_config import has_feature, normalize_tier
from arena.models.schemas import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter()


class AgentTaskRequest(BaseModel):
    task: str


class AgentChallengeRequest(BaseModel):
    task_id: str = ""
    answer: str = ""
    task: str = ""


class AgentRebuttalRequest(BaseModel):
    task: str = ""
    answer: str = ""
    challenge: str = ""


ANALYST_CHALLENGE_PROMPT = """
You are The Analyst challenging an AI-generated answer.

Your job: Find every logical flaw, weak assumption, and missing data
point in this answer.

Be ruthless. Be specific.
Do not suggest improvements.
Only attack weaknesses.

Format your challenge as:
## The Core Flaw
[the single most important problem]

## Weak Assumptions
[assumptions that may not hold]

## Missing Evidence
[what data is absent]

## Verdict
[one sentence on how much this weakens the answer]

Keep response under 200 words.
Be punchy not verbose.
"""

CONTRARIAN_CHALLENGE_PROMPT = """
You are The Contrarian.
You argue the opposite of whatever you are shown.

You have been given an answer.
Your job: Make the strongest possible case that this answer is wrong.

Not nuanced. Not balanced.
The most forceful counterargument that exists.

Format:
## The Opposite Case
[argue the complete opposite]

## Why This Answer Is Wrong
[most powerful objection]

## What Was Missed
[the perspective this ignores]

Keep under 150 words.
Be provocative and direct.
"""

PHILOSOPHER_CHALLENGE_PROMPT = """
You are The Philosopher.
You question premises.

You have been given an answer to a question. Your job: challenge
whether the question itself was right, and whether the answer's
foundational assumptions hold.

Format:
## The Flawed Premise
[what assumption underlies this]

## The Better Question
[what should have been asked]

## The Deeper Issue
[what this answer misses entirely]

Keep under 150 words.
Be intellectually sharp.
"""

REBUTTAL_SYSTEM_PROMPT = """
You are defending an AI-generated answer against a specific challenge.

You have:
1. The original task
2. Your original answer
3. A challenge to your answer

Your job:
Either defend your answer with stronger evidence, OR acknowledge
the valid point and refine your answer to address it.

Be honest. If the challenge reveals a real weakness, admit it and fix it.
If the challenge is wrong, explain why.

Format:
## Response to Challenge
[direct response to the objection]

## Refined Answer (if needed)
[updated answer incorporating valid criticism, or original answer if challenge is invalid]

## What This Changes
[one sentence on what if anything you updated and why]
"""


async def run_challenge(
    task: str,
    answer: str,
    challenger_name: str,
    system_prompt: str,
    model_key: str,
    temperature: float,
) -> dict:
    model = MODEL_REGISTRY.get(model_key, MODEL_REGISTRY["claude_sonnet"])
    provider = str(model.get("provider", "claude"))
    user_prompt = f"""
Original Task: {task}

Agent's Answer:
{answer}

Challenge this answer now.
"""
    try:
        response = await call_llm(
            client=model["client"],
            provider=provider,
            model_id=model["model_id"],
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=500,
        )
        return {
            "challenger": challenger_name,
            "challenge": response,
            "model": model["model_id"],
            "status": "complete",
        }
    except Exception as e:
        return {
            "challenger": challenger_name,
            "challenge": f"Challenge failed: {e}",
            "model": model_key,
            "status": "failed",
        }


def _stage_status_value(status) -> str:
    return status.value if hasattr(status, "value") else str(status)


def _ensure_agent_access(user: UserResponse) -> None:
    tier = normalize_tier(user.tier)
    if not has_feature(tier, "agent_mode"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "agent_not_available",
                "message": "Agent Mode requires a Pro subscription.",
                "upgrade_required": "pro",
            },
        )


def _ensure_task_owner(bb: Blackboard, user: UserResponse) -> None:
    if bb.user_id != user.id:
        raise HTTPException(status_code=404, detail="Task not found")


async def run_agent_pipeline_background(task_id: str, user_id: int, task: str) -> None:
    """Run pipeline for an existing blackboard (same task_id as POST /run)."""
    bb = get_blackboard(task_id)
    if not bb:
        logger.error("[AGENT] Background: no blackboard for task_id=%s", task_id)
        return
    if bb.user_id != user_id or bb.task != task:
        logger.error("[AGENT] Background: blackboard mismatch task_id=%s", task_id)
        return
    try:
        await run_agent_pipeline_on_blackboard(bb)
    except Exception as e:
        bb2 = get_blackboard(task_id)
        if bb2:
            bb2.status = AgentStatus.FAILED
            bb2.error = str(e)
        logger.exception("[AGENT] Background pipeline error task_id=%s", task_id)


@router.post("/run")
async def run_agent_task(
    body: AgentTaskRequest,
    background_tasks: BackgroundTasks,
    user: UserResponse = Depends(get_current_user_required),
):
    _ensure_agent_access(user)

    task = body.task.strip()
    if not task:
        raise HTTPException(status_code=400, detail="Task cannot be empty")
    if len(task) > 2000:
        raise HTTPException(
            status_code=400,
            detail="Task too long. Maximum 2000 characters.",
        )

    bb = create_blackboard(user_id=user.id, task=task)
    bb.status = AgentStatus.RUNNING

    background_tasks.add_task(
        run_agent_pipeline_background,
        bb.task_id,
        user.id,
        task,
    )

    return JSONResponse(
        content={
            "task_id": bb.task_id,
            "status": "running",
            "message": "Pipeline started",
        }
    )


@router.get("/status/{task_id}")
async def get_agent_status(
    task_id: str,
    user: UserResponse = Depends(get_current_user_required),
):
    _ensure_agent_access(user)
    bb = get_blackboard(task_id)
    if not bb:
        raise HTTPException(status_code=404, detail="Task not found")
    _ensure_task_owner(bb, user)

    return JSONResponse(
        content={
            "task_id": bb.task_id,
            "status": _stage_status_value(bb.status),
            "current_stage": bb.current_stage,
            "stages": {
                "planner": {"status": _stage_status_value(bb.plan.status)},
                "researcher": {"status": _stage_status_value(bb.research.status)},
                "solver": {"status": _stage_status_value(bb.solution.status)},
                "critic": {"status": _stage_status_value(bb.critique.status)},
                "verifier": {"status": _stage_status_value(bb.verification.status)},
                "synthesizer": {"status": _stage_status_value(bb.synthesis.status)},
                "judge": {"status": _stage_status_value(bb.judgment.status)},
            },
        }
    )


@router.get("/result/{task_id}")
async def get_agent_result(
    task_id: str,
    user: UserResponse = Depends(get_current_user_required),
):
    """Returns full blackboard including per-stage output, model, and duration_ms for revision trace."""
    _ensure_agent_access(user)
    bb = get_blackboard(task_id)
    if not bb:
        raise HTTPException(status_code=404, detail="Task not found or expired")
    _ensure_task_owner(bb, user)

    return JSONResponse(content=bb.to_dict())


@router.post("/challenge")
async def challenge_agent_answer(
    body: AgentChallengeRequest,
    user: UserResponse = Depends(get_current_user_required),
):
    _ensure_agent_access(user)
    answer = body.answer.strip()
    if not answer:
        raise HTTPException(status_code=400, detail="Answer required")

    task_text = body.task.strip()
    tid = body.task_id.strip()
    if tid:
        bb = get_blackboard(tid)
        if not bb:
            raise HTTPException(status_code=404, detail="Task not found")
        _ensure_task_owner(bb, user)
        task_text = bb.task
    if not task_text:
        raise HTTPException(
            status_code=400,
            detail="Original task required (provide task_id or task)",
        )

    challenges = await asyncio.gather(
        run_challenge(
            task_text,
            answer,
            "The Analyst",
            ANALYST_CHALLENGE_PROMPT,
            "deepseek_v3",
            0.2,
        ),
        run_challenge(
            task_text,
            answer,
            "The Contrarian",
            CONTRARIAN_CHALLENGE_PROMPT,
            "grok_3_mini",
            1.0,
        ),
        run_challenge(
            task_text,
            answer,
            "The Philosopher",
            PHILOSOPHER_CHALLENGE_PROMPT,
            "gpt_4o",
            0.7,
        ),
    )

    return JSONResponse(
        content={
            "task_id": tid,
            "challenges": list(challenges),
            "challenger_count": 3,
        }
    )


@router.post("/rebuttal")
async def agent_rebuttal(
    body: AgentRebuttalRequest,
    user: UserResponse = Depends(get_current_user_required),
):
    _ensure_agent_access(user)
    task = body.task.strip() or "(context not provided)"
    answer = body.answer.strip()
    challenge = body.challenge.strip()
    if not answer or not challenge:
        raise HTTPException(status_code=400, detail="Answer and challenge required")

    model = MODEL_REGISTRY["claude_sonnet"]
    user_prompt = f"""
Original Task: {task}

My Original Answer:
{answer}

Challenge Received:
{challenge}

Respond to this challenge now.
"""
    try:
        response = await call_llm(
            client=model["client"],
            provider="claude",
            model_id=model["model_id"],
            system_prompt=REBUTTAL_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.4,
            max_tokens=600,
        )
        return JSONResponse(content={"rebuttal": response, "status": "complete"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
