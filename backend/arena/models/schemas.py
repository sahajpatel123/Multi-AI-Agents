"""Pydantic models for request/response data contracts"""

from typing import Optional, List, Any, Dict, Literal
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, EmailStr, Field, field_validator


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
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="ISO datetime")


class PromptRequest(BaseModel):
    """Request to submit a prompt to all agents"""
    
    prompt: str = Field(..., min_length=1, max_length=10000, description="User's prompt")
    session_id: str | None = Field(None, description="Optional session ID for continuity")
    persona_ids: list[str] | None = Field(None, description="Optional active persona ids for slots 1-4")


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
    
    session_id: str = Field(..., description="Session ID for this conversation")
    prompt: str = Field(..., description="Original prompt")
    prompt_category: str = Field("", description="Classified category of the prompt")
    winner: AgentResponse = Field(..., description="The winning agent's response")
    winner_agent_id: str = Field(..., description="ID of the winning agent")
    all_responses: list[ScoredAgent] = Field(..., description="All 4 agent responses with scores")
    integrity: IntegrityReport | None = Field(None, description="Persona integrity report")
    tools_used: list[str] = Field(default_factory=list, description="List of tools that were used (e.g., ['calculator', 'web_search'])")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class DebateMessage(BaseModel):
    """A single message in a debate thread"""
    agent_id: str = Field(..., description="Agent or 'user' who sent this message")
    content: str = Field(..., description="Message content")
    round_number: int = Field(..., ge=0, description="Which debate round this belongs to")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class DebateRequest(BaseModel):
    """Request to start or continue a debate"""
    original_prompt: str = Field(..., min_length=1, description="The original user prompt")
    challenged_agent_id: str = Field(..., description="Agent being challenged")
    challenged_verdict: str = Field(..., description="The challenged agent's verdict")
    round_number: int = Field(1, ge=1, le=3, description="Current round (1-3)")
    debate_history: list[DebateMessage] = Field(default_factory=list, description="Previous debate messages")
    user_interjection: str | None = Field(None, description="Optional user message to redirect the debate")
    session_id: str | None = Field(None, description="Session ID for continuity")
    persona_ids: list[str] | None = Field(None, description="Optional active persona ids for slots 1-4")


class DebateReaction(BaseModel):
    """A single agent's reaction in a debate round"""
    agent_id: str = Field(..., description="Which agent reacted")
    agent_number: int = Field(..., ge=1, le=4, description="Agent number")
    content: str = Field(..., description="Short reaction (2-3 sentences)")
    stance: str = Field(..., description="agree / disagree / partially agree")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class DebateRoundResponse(BaseModel):
    """Response for a single debate round"""
    round_number: int = Field(..., description="Which round this is")
    challenged_agent_id: str = Field(..., description="Agent being challenged")
    reactions: list[DebateReaction] = Field(..., description="3 agent reactions")
    debate_history: list[DebateMessage] = Field(..., description="Full debate history including this round")
    session_id: str = Field(..., description="Session ID")


class DiscussChatMessage(BaseModel):
    """A single message in a 1-on-1 discussion"""
    role: str = Field(..., description="'user' or 'agent'")
    content: str = Field(..., description="Message content")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class DiscussRequest(BaseModel):
    """Request to send a message in a 1-on-1 discussion"""
    agent_id: str = Field(..., description="Which agent to talk to")
    message: str = Field(..., min_length=1, max_length=10000, description="User's message")
    conversation_history: list[DiscussChatMessage] = Field(default_factory=list, description="Full conversation so far")
    original_verdict: str = Field(..., description="Agent's original verdict for context")
    original_prompt: str = Field(..., description="The original arena prompt for context")
    session_id: str | None = Field(None, description="Session ID for continuity")
    persona_ids: list[str] | None = Field(None, description="Optional active persona ids for slots 1-4")


class DiscussResponse(BaseModel):
    """Response from a 1-on-1 discussion turn"""
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
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class SessionData(BaseModel):
    """Complete session data for memory storage"""
    session_id: str = Field(..., description="Session identifier")
    user_id: str = Field(default="anonymous", description="User identifier (anonymous or registered)")
    turns: list[SessionTurn] = Field(default_factory=list, description="All turns in this session")
    topics: list[str] = Field(default_factory=list, description="Topics discussed (LLM-extracted)")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active: datetime = Field(default_factory=datetime.utcnow)


class MemoryContext(BaseModel):
    """Memory context injected into agent prompts"""
    agent_id: str = Field(..., description="Which agent this context is for")
    previous_responses: list[str] = Field(default_factory=list, description="Agent's own previous responses in this session")
    session_summary: str = Field("", description="Brief summary of previous sessions for this user")


class ErrorResponse(BaseModel):
    """Standard error response"""

    error: str
    detail: str | None = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ─────────────────────────────────────────────────
# Auth schemas
# ─────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class UserResponse(BaseModel):
    id: int
    email: str
    tier: str
    created_at: datetime
    prompt_count_today: int

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ─────────────────────────────────────────────────
# Rate limit error schema
# ─────────────────────────────────────────────────

class RateLimitError(BaseModel):
    error: str = "rate_limit_exceeded"
    message: str
    tier: str
    prompts_used: int
    daily_limit: int
    resets_at: str


# ─────────────────────────────────────────────────
# Cost tracking schema
# ─────────────────────────────────────────────────

class RequestCost(BaseModel):
    request_id: str
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost_usd: float = 0.0
    model: str = ""
