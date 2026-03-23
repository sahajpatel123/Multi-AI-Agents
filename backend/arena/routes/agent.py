import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from arena.core.agent_pipeline import run_agent_pipeline_on_blackboard
from arena.core.auth import get_current_user_required
from arena.core.blackboard import AgentStatus, Blackboard, create_blackboard, get_blackboard
from arena.core.tier_config import has_feature, normalize_tier
from arena.models.schemas import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter()


class AgentTaskRequest(BaseModel):
    task: str


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
    _ensure_agent_access(user)
    bb = get_blackboard(task_id)
    if not bb:
        raise HTTPException(status_code=404, detail="Task not found or expired")
    _ensure_task_owner(bb, user)

    return JSONResponse(content=bb.to_dict())
