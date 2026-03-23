import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from dataclasses import dataclass, field


class AgentStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"
    NEEDS_REVISION = "needs_revision"


class StageStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETE = "complete"
    SKIPPED = "skipped"
    FAILED = "failed"


def _json_enum(v: Any) -> Any:
    if isinstance(v, Enum):
        return v.value
    return v


@dataclass
class StageResult:
    stage_name: str
    status: StageStatus = StageStatus.PENDING
    output: str = ""
    reasoning: str = ""
    confidence: float = 0.0
    tokens_used: int = 0
    duration_ms: int = 0
    model_used: str = ""
    error: Optional[str] = None


@dataclass
class Blackboard:
    task_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: int = 0
    task: str = ""
    status: AgentStatus = AgentStatus.PENDING
    current_stage: str = "planner"
    iterations: int = 0
    max_iterations: int = 2

    plan: StageResult = field(default_factory=lambda: StageResult("planner"))
    research: StageResult = field(default_factory=lambda: StageResult("researcher"))
    solution: StageResult = field(default_factory=lambda: StageResult("solver"))
    critique: StageResult = field(default_factory=lambda: StageResult("critic"))
    verification: StageResult = field(default_factory=lambda: StageResult("verifier"))
    synthesis: StageResult = field(default_factory=lambda: StageResult("synthesizer"))
    judgment: StageResult = field(default_factory=lambda: StageResult("judge"))

    final_answer: str = ""
    final_confidence: float = 0.0
    final_score: int = 0
    sources: list = field(default_factory=list)
    flags: list = field(default_factory=list)

    total_tokens: int = 0
    total_cost_usd: float = 0.0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "user_id": self.user_id,
            "task": self.task,
            "status": _json_enum(self.status),
            "current_stage": self.current_stage,
            "iterations": self.iterations,
            "stages": {
                "planner": {
                    "status": _json_enum(self.plan.status),
                    "output": self.plan.output,
                    "model": self.plan.model_used,
                    "duration_ms": self.plan.duration_ms,
                },
                "researcher": {
                    "status": _json_enum(self.research.status),
                    "output": self.research.output,
                    "model": self.research.model_used,
                    "duration_ms": self.research.duration_ms,
                },
                "solver": {
                    "status": _json_enum(self.solution.status),
                    "output": self.solution.output,
                    "model": self.solution.model_used,
                    "duration_ms": self.solution.duration_ms,
                },
                "critic": {
                    "status": _json_enum(self.critique.status),
                    "output": self.critique.output,
                    "model": self.critique.model_used,
                    "duration_ms": self.critique.duration_ms,
                },
                "verifier": {
                    "status": _json_enum(self.verification.status),
                    "output": self.verification.output,
                    "model": self.verification.model_used,
                    "duration_ms": self.verification.duration_ms,
                },
                "synthesizer": {
                    "status": _json_enum(self.synthesis.status),
                    "output": self.synthesis.output,
                    "model": self.synthesis.model_used,
                    "duration_ms": self.synthesis.duration_ms,
                },
                "judge": {
                    "status": _json_enum(self.judgment.status),
                    "output": self.judgment.output,
                    "model": self.judgment.model_used,
                    "duration_ms": self.judgment.duration_ms,
                },
            },
            "final_answer": self.final_answer,
            "final_confidence": self.final_confidence,
            "final_score": self.final_score,
            "sources": self.sources,
            "flags": self.flags,
            "total_tokens": self.total_tokens,
            "total_cost_usd": self.total_cost_usd,
            "error": self.error,
        }


active_tasks: dict[str, Blackboard] = {}


def create_blackboard(user_id: int, task: str) -> Blackboard:
    bb = Blackboard(
        user_id=user_id,
        task=task,
        started_at=datetime.now(timezone.utc),
    )
    active_tasks[bb.task_id] = bb
    return bb


def get_blackboard(task_id: str) -> Optional[Blackboard]:
    return active_tasks.get(task_id)


def remove_blackboard(task_id: str) -> None:
    active_tasks.pop(task_id, None)
