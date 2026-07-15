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
            description="Seven-stage research pipeline",
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
# High precision over recall: prefer missing ambiguous web research over
# false-positive 409s. Demo "On device" templates must always match.
# Matches ~/…, absolute-ish paths, and natural phrases like "my Documents folder".
_LOCAL_PATH_TOKEN = (
    r"(?:"
    r"~(?:/[\w.\-]+)+"  # ~/Documents/foo.md
    r"|~"
    r"|/home/\S+"
    r"|C:\\"
    r"|(?:my\s+|the\s+)?(?:disk|desktop|documents?|downloads?)\b"
    r")"
)

_CONDURA_PATTERNS: list[re.Pattern[str]] = [
    # Open / launch desktop apps
    re.compile(
        r"\b(?:open|launch)\s+(linear|notion(?:\.app)?|things|finder|terminal|"
        r"chrome|safari|vscode|slack|obsidian)\b",
        re.I,
    ),
    # Save / write / export to a local path (allows intervening words: "save it to ~/…")
    re.compile(
        rf"\b(?:save|export)\s+(?:(?:it|this|the|a|my|your)\s+)*(?:report|file|document|brief|"
        rf"markdown|pdf|docx|notes?)?\s*to\s+{_LOCAL_PATH_TOKEN}",
        re.I,
    ),
    re.compile(
        r"\b(?:save|export)\s+(?:(?:it|this|the|a|my)\s+)*(?:report|file|document|brief)?\s*"
        r"(?:locally|on\s+(?:my\s+)?(?:machine|computer|disk|desktop|laptop|mac))\b",
        re.I,
    ),
    re.compile(
        rf"\bwrite\s+(?:(?:it|this|the)\s+)*(?:report|file|document)?\s*"
        rf"to\s+{_LOCAL_PATH_TOKEN}",
        re.I,
    ),
    # Bare home-path / filesystem language
    re.compile(r"(?:^|[\s\"'(])~/[A-Za-z0-9_.\-]+", re.I),
    re.compile(r"\b(?:local\s+)?(?:file\s+system|hard\s+drive)\b", re.I),
    # Shell / terminal agency
    re.compile(r"\brun\s+(?:a\s+)?(?:shell|terminal|bash|zsh)\s+command\b", re.I),
    re.compile(r"\b(?:in|via|using)\s+(?:the\s+)?(?:terminal|shell|bash|zsh)\b", re.I),
    re.compile(r"\blaunch\s+terminal\b", re.I),
    # UI computer-use
    re.compile(r"\b(click|type|scroll)\s+(on|in)\s+(my\s+)?(screen|desktop|app)\b", re.I),
    # Linear / Notion local filing — do NOT match bare "project" (web research:
    # "file it under project governance" must stay web).
    re.compile(r"\bcreate\s+(a\s+)?ticket\s+in\s+linear\b", re.I),
    re.compile(r"\bfile\s+(?:it\s+)?(?:under|in)\s+linear\b", re.I),
    re.compile(r"\bcreate\s+(a\s+)?(?:page|note)\s+in\s+notion\b", re.I),
    # Explicit machine ownership
    re.compile(r"\bon\s+my\s+(mac|windows|linux|computer|machine|laptop|device)\b", re.I),
    re.compile(r"\buse\s+my\s+(computer|machine|laptop|mac|device)\b", re.I),
    re.compile(r"\bon\s+(?:your|the)\s+(?:user'?s\s+)?(?:machine|computer|laptop)\b", re.I),
]

# Long-running on-device loops. Always pair duration/loop language with machine
# or on-device signals so pure web research like "long-running analysis of SaaS"
# is never false-rejected when honesty is on.
_ON_DEVICE = (
    r"(?:on\s+my\s+(?:machine|computer|mac|laptop|device)|on[- ]device|"
    r"until\s+I\s+cancel)"
)
_HYBRID_DELEGATE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"\b(?:every|each)\s+\d+\s*(?:hour|hr|day|minute)s?\b"
        rf".{{0,100}}\b{_ON_DEVICE}\b",
        re.I | re.S,
    ),
    re.compile(
        rf"\b{_ON_DEVICE}\b"
        r".{0,100}\b(?:every|each)\s+\d+\s*(?:hour|hr|day|minute)s?\b",
        re.I | re.S,
    ),
    # "keep running" / "long-running" alone is NOT enough (web research theater).
    re.compile(
        r"\b(?:keep\s+running|long[- ]running)\b"
        rf".{{0,100}}\b{_ON_DEVICE}\b",
        re.I | re.S,
    ),
    re.compile(
        rf"\b{_ON_DEVICE}\b"
        r".{0,100}\b(?:keep\s+running|long[- ]running)\b",
        re.I | re.S,
    ),
    re.compile(r"\bschedule\s+(?:this|a)\s+(?:on\s+)?(?:my\s+)?(?:machine|computer)\b", re.I),
    re.compile(
        r"\bmonitor\s+(?:for|this)\b.{0,60}\bon\s+my\s+(?:machine|computer|mac|laptop)\b",
        re.I | re.S,
    ),
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
    When the explicit capability resolves to WEB, ALSO run the text heuristic
    as a safety net — a user can type a local-intent prompt ("open Linear")
    into a web-capability route (/run). If the heuristic detects local intent,
    the heuristic result takes precedence so the honest rejection gate fires.

    Explicit non-web capabilities (condura / hybrid_*) keep their registry env
    even when free-text is empty or ambiguous.
    """
    if capability_id:
        try:
            cap = resolve(capability_id)
            env = cap.execution
            if env == ExecutionEnvironment.WEB:
                text_env = classify_task_text(task_text or "")
                if requires_local_rejection(text_env):
                    return text_env, None
            return env, cap
        except KeyError:
            pass
    env = classify_task_text(task_text or "")
    return env, None


def requires_local_rejection(env: ExecutionEnvironment) -> bool:
    """True if this env must be rejected on web when the feature flag is on.

    hybrid_prep is intentionally excluded: Arena may still plan on web while
    Condura executes the machine step via browser handoff. Free-text that only
    implies "save/open on machine" is classified as CONDURA so /run rejects it.
    """
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


def evaluate_capability_gate(
    *,
    capability_id: str | None = None,
    task_text: str | None = None,
) -> dict[str, Any]:
    """Single honesty decision for HTTP routes and background runners.

    Returns a dict:
      decision: "allow" | "fallback" | "reject"
      env: ExecutionEnvironment
      capability: Capability | None
      capability_id: str
      error_body: dict | None  (only when decision == "reject")

    - allow: pure web work (or hybrid_prep explicit capability)
    - fallback: would need Condura, but CONDURA_HONEST_REJECTION_ENABLED is off
    - reject: need Condura and flag is on — do not start a web pipeline
    """
    env, cap = execution_for_request(capability_id=capability_id, task_text=task_text)
    cid = capability_id or (cap.id if cap else "inferred")
    if not requires_local_rejection(env):
        return {
            "decision": "allow",
            "env": env,
            "capability": cap,
            "capability_id": cid,
            "error_body": None,
        }
    if not honest_rejection_enabled():
        return {
            "decision": "fallback",
            "env": env,
            "capability": cap,
            "capability_id": cid,
            "error_body": None,
        }
    return {
        "decision": "reject",
        "env": env,
        "capability": cap,
        "capability_id": cid,
        "error_body": local_execution_error_body(env, cap),
    }


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
