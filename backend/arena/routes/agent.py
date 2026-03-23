from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from arena.core.agent_pipeline import run_agent_pipeline
from arena.core.auth import get_current_user_required
from arena.core.blackboard import Blackboard, get_blackboard
from arena.core.tier_config import has_feature, normalize_tier
from arena.models.schemas import UserResponse

router = APIRouter()


class AgentTaskRequest(BaseModel):
    task: str


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


@router.post("/run")
async def run_agent_task(
    body: AgentTaskRequest,
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

    bb = await run_agent_pipeline(user_id=user.id, task=task)
    return JSONResponse(content=bb.to_dict())


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
            "status": bb.status.value if hasattr(bb.status, "value") else bb.status,
            "current_stage": bb.current_stage,
            "stages": {
                "planner": {"status": bb.plan.status.value},
                "researcher": {"status": bb.research.status.value},
                "solver": {"status": bb.solution.status.value},
                "critic": {"status": bb.critique.status.value},
                "verifier": {"status": bb.verification.status.value},
                "synthesizer": {"status": bb.synthesis.status.value},
                "judge": {"status": bb.judgment.status.value},
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
