"""Capability taxonomy for Arena Agent × Condura integration.

See docs/adr/0001-condura-integration.md and docs/condura/CAPABILITY-REGISTRY.md.
"""

from __future__ import annotations

import os
import re
from enum import Enum
from typing import Any, Optional, Type

from pydantic import BaseModel, Field, model_validator


class ExecutionEnvironment(str, Enum):
    WEB = "web"
    CONDURA = "condura"
    HYBRID_PREP = "hybrid_prep"
    HYBRID_DELEGATE = "hybrid_delegate"


class FallbackMessage(BaseModel):
    title: str
    body: str
    install_url: str = "https://condura.app"


class _NonWebCapability(BaseModel):
    """Mixin: non-Web capabilities must declare an args schema."""

    args_schema: Optional[Type[BaseModel]] = None

    @model_validator(mode="after")
    def _args_schema_required(self) -> "_NonWebCapability":
        if self.args_schema is None:
            raise ValueError(
                f"{type(self).__name__}.args_schema is required for non-Web capabilities."
            )
        return self


class WebCapability(BaseModel):
    id: str
    description: str
    requires: tuple[str, ...] = ()
    args_schema: Optional[Type[BaseModel]] = None

    @property
    def execution(self) -> ExecutionEnvironment:
        return ExecutionEnvironment.WEB


class ConduraCapability(_NonWebCapability):
    id: str
    description: str
    condura_method: str
    fallback: FallbackMessage

    @property
    def execution(self) -> ExecutionEnvironment:
        return ExecutionEnvironment.CONDURA


class HybridPrepCapability(_NonWebCapability):
    id: str
    description: str
    condura_method: str
    fallback: FallbackMessage
    estimated_seconds: int = 30
    stream_heartbeat_seconds: int = 60

    @property
    def execution(self) -> ExecutionEnvironment:
        return ExecutionEnvironment.HYBRID_PREP


class HybridDelegateCapability(_NonWebCapability):
    id: str
    description: str
    condura_method: str
    fallback: FallbackMessage
    estimated_duration_hours: int = 4
    stream_heartbeat_seconds: int = 600

    @property
    def execution(self) -> ExecutionEnvironment:
        return ExecutionEnvironment.HYBRID_DELEGATE


Capability = WebCapability | ConduraCapability | HybridPrepCapability | HybridDelegateCapability


# ── Args schemas for non-Web capabilities ─────────────────────


class LinearTicketArgs(BaseModel):
    action: str = "create_ticket"
    ticket: dict[str, Any] = Field(default_factory=dict)
    source_prompt: str = ""


class ReportSaveArgs(BaseModel):
    report_format: str = "md"
    suggested_dir: str = "~/Documents"
    suggested_filename: str = "arena-report.md"
    report_text: str = ""


class LongResearchArgs(BaseModel):
    task: str
    stop_conditions: list[str] = Field(default_factory=list)
    deliver_every: str = "4h"


class VerifyArenaLocalArgs(BaseModel):
    arena_answer: str
    original_question: str
    persona_name: str = ""
    score: int = 0


_DEFAULT_FALLBACK = FallbackMessage(
    title="This needs your machine",
    body="Powered by Condura — free, local-first agent for on-device actions.",
    install_url="https://condura.app",
)


def _build_registry() -> dict[str, Capability]:
    return {
        "arena.respond": WebCapability(
            id="arena.respond",
            description="Four-agent panel response",
        ),
        "arena.debate": WebCapability(
            id="arena.debate",
            description="Debate mode",
        ),
        "arena.discuss": WebCapability(
            id="arena.discuss",
            description="One-on-one focused chat",
        ),
        "agent.research": WebCapability(
            id="agent.research",
            description="Eight-stage research pipeline",
        ),
        "agent.orchestrate": WebCapability(
            id="agent.orchestrate",
            description="Multi-task orchestration",
        ),
        "agent.refine": WebCapability(
            id="agent.refine",
            description="Refinement loop",
        ),
        "agent.feedback": WebCapability(
            id="agent.feedback",
            description="Answer feedback",
        ),
        "agent.challenge": WebCapability(
            id="agent.challenge",
            description="Challenge an answer",
        ),
        "agent.rebuttal": WebCapability(
            id="agent.rebuttal",
            description="Rebuttal generation",
        ),
        "watchlist.create": WebCapability(
            id="watchlist.create",
            description="Create server-side watchlist item",
        ),
        "watchlist.toggle": WebCapability(
            id="watchlist.toggle",
            description="Toggle watchlist item",
        ),
        "agent.verify_arena_answer": WebCapability(
            id="agent.verify_arena_answer",
            description="Verify Arena winner answer on web",
        ),
        "app.open_in_linear": ConduraCapability(
            id="app.open_in_linear",
            description="Create a Linear ticket from research",
            args_schema=LinearTicketArgs,
            condura_method="arena.app.linear",
            fallback=_DEFAULT_FALLBACK,
        ),
        "report.save_to_local": HybridPrepCapability(
            id="report.save_to_local",
            description="Save report text to a local path",
            args_schema=ReportSaveArgs,
            condura_method="arena.report.save",
            fallback=_DEFAULT_FALLBACK,
            estimated_seconds=15,
        ),
        "agent.long_research": HybridDelegateCapability(
            id="agent.long_research",
            description="Long-running research loop on device",
            args_schema=LongResearchArgs,
            condura_method="arena.agent.research.delegate",
            fallback=_DEFAULT_FALLBACK,
            estimated_duration_hours=4,
            stream_heartbeat_seconds=600,
        ),
        "agent.verify_arena_answer_local": HybridPrepCapability(
            id="agent.verify_arena_answer_local",
            description="Verify Arena answer using local Condura context",
            args_schema=VerifyArenaLocalArgs,
            condura_method="arena.agent.verify",
            fallback=_DEFAULT_FALLBACK,
        ),
    }


REGISTRY: dict[str, Capability] = _build_registry()


def resolve(capability_id: str) -> Capability:
    cap = REGISTRY.get(capability_id)
    if cap is None:
        raise KeyError(f"Unknown capability: {capability_id}")
    return cap


def honest_rejection_enabled() -> bool:
    """Feature flag for Condura 409 path. Default off for staged rollout."""
    return (os.getenv("CONDURA_HONEST_REJECTION_ENABLED") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


# Patterns that strongly imply local / machine-only intent in free-text tasks.
_CONDURA_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bopen\s+(linear|notion\.app|things|finder|terminal|chrome|safari)\b", re.I),
    re.compile(r"\bsave\s+(this|the|report|file)\s+to\s+(~|/|disk|desktop|documents)\b", re.I),
    re.compile(r"\b(my\s+)?(local\s+)?(file\s+system|hard\s+drive|~/)\b", re.I),
    re.compile(r"\brun\s+(a\s+)?(shell|terminal|bash|zsh)\s+command\b", re.I),
    re.compile(r"\b(click|type|scroll)\s+(on|in)\s+(my\s+)?(screen|desktop|app)\b", re.I),
    re.compile(r"\bcreate\s+(a\s+)?ticket\s+in\s+linear\b", re.I),
    re.compile(r"\bon\s+my\s+(mac|windows|linux|computer|machine|laptop)\b", re.I),
]

_HYBRID_DELEGATE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(every|each)\s+\d+\s*(hour|hr|day|minute)s?\b", re.I),
    re.compile(r"\b(keep\s+running|long[- ]running|watch\s+this|monitor\s+for)\b", re.I),
    re.compile(r"\bschedule\s+(this|a)\s+(on\s+)?(my\s+)?(machine|computer)\b", re.I),
]


def classify_task_text(task: str) -> ExecutionEnvironment:
    """Heuristic classifier for free-text agent tasks.

    Defaults to WEB. Strong local-action language → CONDURA.
    Long-running on-device language → HYBRID_DELEGATE.
    """
    text = (task or "").strip()
    if not text:
        return ExecutionEnvironment.WEB
    for pat in _HYBRID_DELEGATE_PATTERNS:
        if pat.search(text):
            return ExecutionEnvironment.HYBRID_DELEGATE
    for pat in _CONDURA_PATTERNS:
        if pat.search(text):
            return ExecutionEnvironment.CONDURA
    return ExecutionEnvironment.WEB


def execution_for_request(
    *,
    capability_id: str | None = None,
    task_text: str | None = None,
) -> tuple[ExecutionEnvironment, Capability | None]:
    """Resolve execution environment for an Agent request.

    Prefer explicit capability_id; fall back to task text heuristics.
    """
    if capability_id:
        try:
            cap = resolve(capability_id)
            return cap.execution, cap
        except KeyError:
            pass
    env = classify_task_text(task_text or "")
    return env, None


def requires_local_rejection(env: ExecutionEnvironment) -> bool:
    """True if this env must be rejected on web when the feature flag is on."""
    return env in {
        ExecutionEnvironment.CONDURA,
        ExecutionEnvironment.HYBRID_DELEGATE,
    }


def local_execution_error_body(
    env: ExecutionEnvironment,
    cap: Capability | None = None,
) -> dict[str, Any]:
    fallback = _DEFAULT_FALLBACK
    if cap is not None and isinstance(
        cap, (ConduraCapability, HybridPrepCapability, HybridDelegateCapability)
    ):
        fallback = cap.fallback
    return {
        "error": "requires_local_execution",
        "execution_environment": env.value,
        "message": fallback.body,
        "title": fallback.title,
        "install_url": fallback.install_url,
        "handoff_spec": "arena.handoff.v1",
    }


def tier_supports_env(tier: Any, env: ExecutionEnvironment) -> bool:
    """Condura/hybrid_delegate are never tier-gated (runtime requirements).

    Web and hybrid_prep still require agent_mode (or related) features —
    callers enforce those separately via has_feature.
    """
    if env in {
        ExecutionEnvironment.CONDURA,
        ExecutionEnvironment.HYBRID_DELEGATE,
    }:
        return True
    return True


def list_capabilities() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for cap in REGISTRY.values():
        item: dict[str, Any] = {
            "id": cap.id,
            "description": cap.description,
            "execution": cap.execution.value,
        }
        if isinstance(cap, ConduraCapability):
            item["condura_method"] = cap.condura_method
        if isinstance(cap, (HybridPrepCapability, HybridDelegateCapability)):
            item["condura_method"] = cap.condura_method
            item["stream_heartbeat_seconds"] = cap.stream_heartbeat_seconds
        out.append(item)
    return out
