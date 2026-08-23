"""Pydantic models for request/response data contracts"""

from typing import Optional, Literal
from datetime import datetime
from arena.core.datetime_utils import utcnow_naive


from enum import Enum
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from arena.core.input_validation import (
    sanitize_model_optional_html,
    sanitize_model_optional_text,
    sanitize_model_text,
)
from arena.core.followup import (
    FOLLOW_UP_MAX_ITEMS,
    FOLLOW_UP_MAX_ITEM_CHARS,
    FOLLOW_UP_MAX_TOTAL_CHARS,
)


class PromptCategory(str, Enum):
    """Categories a prompt can be classified as"""
    QUESTION = "question"
    TASK = "task"
    STATEMENT = "statement"
    DEBATE = "debate"


class PromptClassification(BaseModel):
    """Result of prompt classification"""
    category: PromptCategory
    reasoning: str = Field("", description="Why this category was chosen")


class IntentExtraction(BaseModel):
    """Extracted intent from a prompt"""
    surface_intent: str = Field(..., description="What the user literally asked")
    deeper_intent: str = Field(..., description="What the user actually wants beneath the surface")
    key_entities: list[str] = Field(default_factory=list, description="Important entities in the prompt")


class ToxicityResult(BaseModel):
    """Result of toxicity check"""
    is_toxic: bool = Field(False, description="Whether the prompt is toxic")
    reason: str | None = Field(None, description="Why the prompt was flagged")
    confidence: float = Field(0.0, ge=0.0, le=1.0, description="Confidence of toxicity detection")


class InputPipelineResult(BaseModel):
    """Combined result of the full input pipeline"""
    classification: PromptClassification
    intent: IntentExtraction
    toxicity: ToxicityResult
    enriched_prompt: str = Field(..., description="Original prompt enriched with context for agents")
    passed: bool = Field(True, description="Whether the prompt passed all gates")
    rejection_reason: str | None = Field(None, description="Why the prompt was rejected")


class AgentConfig(BaseModel):
    """Configuration for a single agent"""

    agent_id: str = Field(..., description="Unique identifier (e.g., 'agent_1')")
    agent_number: int = Field(..., ge=1, le=4, description="Agent number 1-4")
    persona_id: str | None = Field(None, description="Frontend persona identity for this slot")
    name: str = Field(..., description="Display name for the agent")
    color: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$", description="Hex color code")
    temperature: float = Field(..., ge=0.0, le=2.0, description="LLM temperature")
    system_prompt: str = Field(..., description="System prompt defining personality")


class AgentResponse(BaseModel):
    """Response from a single agent - the core data contract"""

    agent_id: str = Field(..., description="Which agent produced this response")
    agent_number: int = Field(..., ge=1, le=4, description="Agent number 1-4")
    verdict: str = Field(..., description="Full response text")
    one_liner: str = Field(..., description="Single sentence summary")
    confidence: int = Field(..., ge=0, le=100, description="Confidence score 0-100")
    key_assumption: str = Field(..., description="The biggest assumption this answer rests on")
    timestamp: datetime = Field(default_factory=utcnow_naive, description="ISO datetime")


class PromptRequest(BaseModel):
    """Request to submit a prompt to all agents"""

    prompt: str = Field(..., min_length=1, max_length=2000, description="User's prompt")
    session_id: str | None = Field(None, description="Optional session ID for continuity")
    # Follow-up context is bounded at the Pydantic level: at most 8 prior
    # round messages, each capped at 1800 chars, with a 12k total budget so a
    # single follow-up cannot blow up the per-agent context window. The
    # formatter in core/followup.py re-truncates defensively anyway.
    context: list["PromptContextItem"] | None = Field(
        None,
        max_length=FOLLOW_UP_MAX_ITEMS,
        description="Optional prior-round messages giving the panel continuity",
    )
    # persona_ids is bounded at the Pydantic level: the list has
    # max 4 entries (matching the 4-slot agent design) and each
    # string is max 50 chars (persona ids are short slugs like
    # "philosopher" or "claude_opus"). The downstream
    # validate_persona_access call rejects unknown ids, but a
    # user could submit 1000 unknown 10K-char strings to amplify
    # the validation cost and the DB write cost before
    # _enforce_persona_access returns. The Pydantic cap closes
    # the gap at parse time.
    persona_ids: list[str] | None = Field(
        None, max_length=4,
        description="Optional active persona ids for slots 1-4 (max 4 entries)",
    )

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        return sanitize_model_text(v, max_length=2000, field_name="prompt")

    @field_validator("persona_ids")
    @classmethod
    def validate_persona_ids(cls, v: list[str] | None) -> list[str] | None:
        # Per-element cap: persona_ids are short slugs (e.g.
        # "philosopher", "claude_opus"). 50 chars is generous.
        # The list-length cap is enforced by the Field(max_length=4)
        # above. Both caps together prevent a 1000 * 10K DoS.
        if v is None:
            return v
        return [s[:50] for s in v]

    @field_validator("context")
    @classmethod
    def validate_context(
        cls, v: list["PromptContextItem"] | None
    ) -> list["PromptContextItem"] | None:
        if not v:
            return v
        total = sum(len(item.content) for item in v)
        if total > FOLLOW_UP_MAX_TOTAL_CHARS:
            raise ValueError(
                f"context content is too long ({total} chars; "
                f"max {FOLLOW_UP_MAX_TOTAL_CHARS})"
            )
        return v


class PromptContextItem(BaseModel):
    """One prior-round message included as context for a follow-up round.

    ``role`` distinguishes the user's original question from each persona's
    answer. Assistant items may carry ``agent_id``/``name`` so the formatted
    transcript is readable by the models.
    """

    role: Literal["user", "assistant"] = Field(
        ..., description="Speaker role: the user's question or a persona's answer"
    )
    agent_id: str | None = Field(
        None, max_length=64, description="Slot id (agent_1..agent_4) for assistant items"
    )
    name: str | None = Field(
        None, max_length=80, description="Display name for assistant items"
    )
    content: str = Field(
        ...,
        min_length=1,
        max_length=FOLLOW_UP_MAX_ITEM_CHARS,
        description="Message text (capped to keep context cheap)",
    )

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        return sanitize_model_text(
            v, max_length=FOLLOW_UP_MAX_ITEM_CHARS, field_name="context.content"
        )


class FollowUpSuggestionsRequest(BaseModel):
    """Ask the panel for follow-up questions after a completed round.

    The request carries the original question plus one short verdict per
    persona. Bounds mirror the follow-up context budget (see
    core/followup.py) so a single suggestion request stays cheap for a
    lightweight model and a hostile client cannot amplify the cost with
    megabytes of verdict text.
    """

    prompt: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="The user's original question from the completed round",
    )
    verdicts: list[str] = Field(
        default_factory=list,
        max_length=FOLLOW_UP_MAX_ITEMS,
        description="One short verdict per persona (max 8, capped in length)",
    )

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        return sanitize_model_text(v, max_length=2000, field_name="prompt")

    @field_validator("verdicts")
    @classmethod
    def validate_verdicts(cls, v: list[str]) -> list[str]:
        cleaned: list[str] = []
        total = 0
        for verdict in v:
            item = sanitize_model_text(
                verdict,
                max_length=FOLLOW_UP_MAX_ITEM_CHARS,
                field_name="verdicts",
            )
            total += len(item)
            cleaned.append(item)
        if total > FOLLOW_UP_MAX_TOTAL_CHARS:
            raise ValueError(
                f"verdicts content is too long ({total} chars; "
                f"max {FOLLOW_UP_MAX_TOTAL_CHARS})"
            )
        return cleaned


class IntegrityReport(BaseModel):
    """Persona integrity report for a set of agent responses"""
    drift_scores: dict[str, float] = Field(default_factory=dict, description="Per-agent drift scores (0=no drift, 1=high drift)")
    overlap_pairs: list[dict] = Field(default_factory=list, description="Pairs of agents with high overlap")
    flags: list[str] = Field(default_factory=list, description="Human-readable integrity warnings")


class ContradictionFlag(BaseModel):
    """Flag indicating an agent contradicted itself"""
    detected: bool = Field(False, description="Whether a contradiction was detected")
    previous_statement: str = Field("", description="What the agent said before")
    current_statement: str = Field("", description="What the agent said now")
    severity: str = Field("low", description="Severity: low, medium, or high")


class ScoredAgent(BaseModel):
    """Agent response with scoring metadata"""

    response: AgentResponse
    score: int = Field(..., ge=0, le=100, description="Score from the scorer")
    is_winner: bool = Field(False, description="Whether this agent won")
    contradiction: Optional[ContradictionFlag] = Field(None, description="Contradiction flag if detected")


class PromptResponse(BaseModel):
    """Complete response to a prompt request"""

    request_id: str | None = Field(None, description="Request correlation ID (X-Request-ID) for this response")
    session_id: str = Field(..., description="Session ID for this conversation")
    prompt: str = Field(..., description="Original prompt")
    prompt_category: str = Field("", description="Classified category of the prompt")
    winner: AgentResponse = Field(..., description="The winning agent's response")
    winner_agent_id: str = Field(..., description="ID of the winning agent")
    all_responses: list[ScoredAgent] = Field(..., description="All 4 agent responses with scores")
    scoring_reasoning: str | None = Field(None, description="The judge's plain-text rationale for the winning take (None when scoring fell back)")
    integrity: IntegrityReport | None = Field(None, description="Persona integrity report")
    tools_used: list[str] = Field(default_factory=list, description="List of tools that were used (e.g., ['calculator', 'web_search'])")
    timestamp: datetime = Field(default_factory=utcnow_naive)


class DebateMessage(BaseModel):
    """A single message in a debate thread"""
    agent_id: str = Field(..., description="Agent or 'user' who sent this message")
    # Content is capped at 20K chars per message. Same cap as
    # DiscussChatMessage.content (cycle 13 fix) — matches the
    # realistic LLM context budget and prevents a per-message
    # DoS where a user submits a single 5MB message in
    # debate_history that gets amplified into _build_debate_context
    # (and forwarded to the LLM API, which then rejects the
    # request after the server has already paid the memory cost).
    content: str = Field(..., max_length=20000, description="Message content (max 20K chars)")
    round_number: int = Field(..., ge=0, description="Which debate round this belongs to")
    timestamp: datetime = Field(default_factory=utcnow_naive)


class DebateRequest(BaseModel):
    """Request to start or continue a debate"""
    original_prompt: str = Field(..., min_length=1, description="The original user prompt")
    challenged_agent_id: str = Field(..., description="Agent being challenged")
    challenged_verdict: str = Field(..., description="The challenged agent's verdict")
    round_number: int = Field(1, ge=1, le=4, description="Current round (1-3 standard, optional 4th follow-up)")
    # debate_history is capped at 32 entries. The debate has at
    # most 4 active agents and 4 rounds, so the natural upper
    # bound is 16 messages. 32 is a generous ceiling that
    # accommodates future per-agent or per-round expansions
    # without a schema migration. Combined with the per-message
    # 20K cap on DebateMessage.content (cycle 14 fix), the
    # maximum history is 32 * 20K = 640K chars.
    debate_history: list[DebateMessage] = Field(
        default_factory=list, max_length=32,
        description="Previous debate messages (max 32 entries)",
    )
    user_interjection: str | None = Field(None, description="Optional user message to redirect the debate")
    session_id: str | None = Field(None, description="Session ID for continuity")
    # persona_ids is bounded at the Pydantic level: the list has
    # max 4 entries (matching the 4-slot agent design) and each
    # string is sliced to 50 chars (per-element cap, matching
    # the PromptRequest cycle 16 fix). The downstream
    # validate_persona_access rejects unknown ids, but a
    # user could submit 1000 unknown 10K-char strings to
    # amplify the validation cost before the rejection fires.
    persona_ids: list[str] | None = Field(
        None, max_length=4,
        description="Optional active persona ids for slots 1-4 (max 4 entries)",
    )

    @field_validator("original_prompt", "challenged_verdict")
    @classmethod
    def validate_debate_text(cls, v: str, info) -> str:
        return sanitize_model_text(v, max_length=2000, field_name=info.field_name)

    @field_validator("user_interjection")
    @classmethod
    def validate_user_interjection(cls, v: str | None) -> str | None:
        return sanitize_model_optional_text(v, max_length=2000, field_name="user_interjection")

    @field_validator("persona_ids")
    @classmethod
    def validate_persona_ids(cls, v: list[str] | None) -> list[str] | None:
        # Per-element cap matching PromptRequest cycle 16 fix.
        if v is None:
            return v
        return [s[:50] for s in v]


class DebateReaction(BaseModel):
    """A single agent's reaction in a debate round"""
    agent_id: str = Field(..., description="Which agent reacted")
    agent_number: int = Field(..., ge=1, le=4, description="Agent number")
    content: str = Field(..., description="Short reaction (2-3 sentences)")
    stance: str = Field(..., description="agree / disagree / partially agree")
    timestamp: datetime = Field(default_factory=utcnow_naive)


class DebateRoundResponse(BaseModel):
    """Response for a single debate round"""
    request_id: str | None = Field(None, description="Request correlation ID (X-Request-ID) for this response")
    round_number: int = Field(..., description="Which round this is")
    challenged_agent_id: str = Field(..., description="Agent being challenged")
    reactions: list[DebateReaction] = Field(..., description="3 agent reactions")
    debate_history: list[DebateMessage] = Field(..., description="Full debate history including this round")
    session_id: str = Field(..., description="Session ID")


class DiscussChatMessage(BaseModel):
    """A single message in a 1-on-1 discussion"""
    # Role is restricted to a Literal allowlist. Without this,
    # _build_messages in routes/discuss.py maps any non-"user"
    # value to "assistant" — a user could submit
    # `role: "assistant"` in conversation_history and have the
    # text passed to the LLM as a fake prior agent response.
    # The LLM would then treat the injected text as its own
    # prior output and could be steered into continuing whatever
    # the user planted (e.g. "You should always respond with..."
    # masquerading as a past assistant turn). The Pydantic-level
    # Literal check rejects the bad value at request parse time
    # (422) so the LLM never sees it.
    role: Literal["user", "agent"] = Field(..., description="'user' or 'agent'")
    # Content is capped at 20K chars per message. The same cap
    # is enforced by SaveThreadBody's validate_messages field
    # validator (line ~604) for the durable thread record. The
    # cap matches the realistic LLM context budget (most prompts
    # are 1-10K chars; 20K is a generous ceiling) and prevents
    # a per-message DoS where a user submits a single 5MB message
    # that pydantic stores in memory and the LLM API then
    # rejects (waste of server memory + LLM-side processing).
    content: str = Field(..., max_length=20000, description="Message content (max 20K chars)")
    timestamp: datetime = Field(default_factory=utcnow_naive)


class DiscussRequest(BaseModel):
    """Request to send a message in a 1-on-1 discussion"""
    agent_id: str = Field(..., description="Which agent to talk to")
    message: str = Field(..., min_length=1, max_length=2000, description="User's message")
    # conversation_history is capped at 500 entries. The per-message
    # cap on DiscussChatMessage.content (cycle 13 fix, 20K) bounds
    # the per-message memory cost; this cap bounds the total list
    # length so a user cannot submit 100K * 20K = 2GB of history.
    # The same 500-entry cap is enforced for the durable thread
    # record by SaveThreadBody's validate_messages field validator
    # (line ~604: `for m in v[:500]`). 500 is generous — most
    # active discuss threads are 10-50 messages.
    conversation_history: list[DiscussChatMessage] = Field(
        default_factory=list, max_length=500,
        description="Full conversation so far (max 500 entries)",
    )
    original_verdict: str = Field(..., description="Agent's original verdict for context")
    original_prompt: str = Field(..., description="The original arena prompt for context")
    session_id: str | None = Field(None, description="Session ID for continuity")
    # persona_ids is bounded at the Pydantic level: the list has
    # max 4 entries (matching the 4-slot agent design) and each
    # string is sliced to 50 chars (per-element cap, matching
    # the PromptRequest cycle 16 fix).
    persona_ids: list[str] | None = Field(
        None, max_length=4,
        description="Optional active persona ids for slots 1-4 (max 4 entries)",
    )

    @field_validator("message", "original_verdict", "original_prompt")
    @classmethod
    def validate_discuss_text(cls, v: str, info) -> str:
        return sanitize_model_text(v, max_length=2000, field_name=info.field_name)

    @field_validator("persona_ids")
    @classmethod
    def validate_persona_ids(cls, v: list[str] | None) -> list[str] | None:
        # Per-element cap matching PromptRequest cycle 16 fix.
        if v is None:
            return v
        return [s[:50] for s in v]


class DiscussResponse(BaseModel):
    """Response from a 1-on-1 discussion turn"""
    request_id: str | None = Field(None, description="Request correlation ID (X-Request-ID) for this response")
    agent_id: str = Field(..., description="Which agent responded")
    content: str = Field(..., description="Agent's reply")
    conversation_history: list[DiscussChatMessage] = Field(..., description="Updated full history")
    session_id: str = Field(..., description="Session ID")


class SessionTurn(BaseModel):
    """A single turn in a session (prompt + all agent responses)"""
    turn_id: str = Field(..., description="Unique turn identifier")
    prompt: str = Field(..., description="Original user prompt")
    agent_responses: dict[str, AgentResponse] = Field(..., description="All 4 agent responses keyed by agent_id")
    winner_id: str = Field(..., description="Which agent won this turn")
    timestamp: datetime = Field(default_factory=utcnow_naive)


class SessionData(BaseModel):
    """Complete session data for memory storage"""
    session_id: str = Field(..., description="Session identifier")
    user_id: str = Field(default="anonymous", description="User identifier (anonymous or registered)")
    turns: list[SessionTurn] = Field(default_factory=list, description="All turns in this session")
    topics: list[str] = Field(default_factory=list, description="Topics discussed (LLM-extracted)")
    created_at: datetime = Field(default_factory=utcnow_naive)
    last_active: datetime = Field(default_factory=utcnow_naive)


class MemoryContext(BaseModel):
    """Memory context injected into agent prompts"""
    agent_id: str = Field(..., description="Which agent this context is for")
    previous_responses: list[str] = Field(default_factory=list, description="Agent's own previous responses in this session")
    session_summary: str = Field("", description="Brief summary of previous sessions for this user")


class ErrorResponse(BaseModel):
    """Standard error response"""

    error: str
    message: str | None = None
    timestamp: datetime = Field(default_factory=utcnow_naive)


# ─────────────────────────────────────────────────
# Auth schemas
# ─────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str = Field("", max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return sanitize_model_text(v or "", max_length=100, field_name="name")

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class FeedbackCalibrationInfo(BaseModel):
    """Display-only confidence adjustment derived from a user's verdict history.

    Field bounds pin the contract so a malformed helper or a downstream
    client can never silently smuggle absurd values into the UI:

    - adjustment is in [-15, 0]. The helper's formula is
      ``-(wrong_rate*15) - (partial_rate*7)`` rounded to an int. Worst
      case is every row wrong → -15. The lower bound also prevents the
      UI from ever being told to subtract more confidence than the 0-100
      score range can express.
    - reliable flips at 10 verdicts (see feedback_calibrator.get_feedback_calibration).
    - wrong_rate / partial_rate are percentages in [0, 100],
      integer-rounded. partial_rate is surfaced because the formula
      weights partials at 7 — a payload without it cannot explain the
      adjustment when wrong_rate is 0.
    - total_feedback is the number of verdicts in the recent-20 window
      that fed the computation (max 20 — see CALIBRATION_WINDOW in
      feedback_calibrator). The window keeps the knob responsive to
      recent behavior instead of a lifetime average.

    Bounds are enforced at the Pydantic level (parse-time 422) so a
    bad payload cannot reach the response serializer.
    """

    model_config = ConfigDict(extra="ignore")

    adjustment: int = Field(0, ge=-15, le=0)
    reliable: bool = False
    total_feedback: int = Field(0, ge=0, le=20)
    wrong_rate: int = Field(0, ge=0, le=100)
    partial_rate: int = Field(0, ge=0, le=100)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    id: int
    email: str
    tier: str
    created_at: datetime
    prompt_count_today: int
    name: str = ""
    expertise_level: str = "curious"
    expertise_domain: str = ""
    feedback_calibration: FeedbackCalibrationInfo = Field(default_factory=FeedbackCalibrationInfo)
    consecutive_payments: int = 0
    loyalty_reward_active: bool = False
    loyalty_free_months_remaining: int = 0
    loyalty_resume_at: Optional[datetime] = None
    loyalty_resume_attempts: int = 0
    loyalty_resume_next_attempt_at: Optional[datetime] = None
    agent_addon_active: bool = False
    agent_addon_cancelling: bool = False
    addon_subscription_id: Optional[str] = None
    subscription_billing_period: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def _name_default(cls, v: object) -> str:
        return "" if v is None else str(v)

    @field_validator("expertise_level", mode="before")
    @classmethod
    def _expertise_level_default(cls, v: object) -> str:
        if v is None or v == "":
            return "curious"
        return str(v)

    @field_validator("expertise_domain", mode="before")
    @classmethod
    def _expertise_domain_default(cls, v: object) -> str:
        return "" if v is None else str(v)


class UserProfilePatch(BaseModel):
    name: str | None = Field(None, max_length=100)
    expertise_level: str | None = Field(None, max_length=32)
    expertise_domain: str | None = Field(None, max_length=100)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        return sanitize_model_optional_html(v, max_length=100, field_name="name")

    @field_validator("expertise_domain")
    @classmethod
    def validate_expertise_domain(cls, v: str | None) -> str | None:
        return sanitize_model_optional_html(v, max_length=100, field_name="expertise_domain")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AuthResponse(BaseModel):
    success: bool = True
    user: UserResponse


# ─────────────────────────────────────────────────
# Payments (Razorpay subscriptions)
# ─────────────────────────────────────────────────


class SubscribePlanRequest(BaseModel):
    # plan_key is bounded at the Pydantic level (max 50
    # chars). Real values are like "plus_monthly" (~12 chars);
    # 50 chars is generous. The Pydantic cap closes the gap
    # so a user cannot submit a 1MB plan_key to amplify the
    # pydantic memory cost before the route handler's dict
    # lookup runs.
    plan_key: str = Field(..., max_length=50)


class VerifyPaymentRequest(BaseModel):
    # Razorpay fields are bounded at the Pydantic level.
    # Razorpay payment/subscription IDs are short
    # ("pay_XXXXXXXXXXXXX" ~18 chars, "sub_..." ~18 chars);
    # 64 chars is generous. Razorpay signatures are
    # HMAC-SHA256 hex strings (~64 chars); 256 chars is
    # generous. The Pydantic cap closes the gap so a user
    # cannot submit a 1MB string to amplify the verify-payment
    # work before the route handler's ID validation runs.
    razorpay_payment_id: str = Field(..., max_length=64)
    razorpay_subscription_id: str = Field(..., max_length=64)
    razorpay_signature: str = Field(..., max_length=256)


# ─────────────────────────────────────────────────
# Rate limit error schema
# ─────────────────────────────────────────────────

class RateLimitError(BaseModel):
    error: str = "rate_limit_exceeded"
    message: str
    tier: str
    prompts_used: int
    daily_limit: int
    scope: str = ""


# ─────────────────────────────────────────────────
# Cost tracking schema
# ─────────────────────────────────────────────────

class RequestCost(BaseModel):
    request_id: str
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost_usd: float = 0.0
    model: str = ""
