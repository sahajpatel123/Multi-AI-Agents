"""SQLAlchemy ORM models — the actual database tables"""

from datetime import datetime, timezone
from enum import Enum as PyEnum
from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    Enum,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from arena.database import Base


class UserTier(str, PyEnum):
    GUEST = "GUEST"
    FREE = "FREE"
    PLUS = "PLUS"
    PRO = "PRO"
    REGISTERED = "registered"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String, default="", nullable=False)
    expertise_level = Column(String, default="curious", nullable=False)
    expertise_domain = Column(String, default="", nullable=False)
    password_hash = Column(String(255), nullable=False)
    refresh_token_hash = Column(String(255), nullable=True)
    refresh_token_expires_at = Column(DateTime, nullable=True)
    tier = Column(Enum(UserTier), default=UserTier.FREE, nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)
    last_active = Column(DateTime, default=_now, onupdate=_now, nullable=False)
    prompt_count_today = Column(Integer, default=0, nullable=False)
    prompt_count_reset_at = Column(DateTime, default=_now, nullable=False)

    razorpay_customer_id = Column(String(64), nullable=True)
    subscription_id = Column(
        Integer,
        ForeignKey("subscriptions.id", use_alter=True, name="fk_users_subscription_id"),
        nullable=True,
    )
    subscription_status = Column(String(32), nullable=True)
    subscription_end_date = Column(DateTime, nullable=True)

    sessions = relationship("DBSession", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    usage_records = relationship("UsageRecord", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    preferences = relationship("UserPreference", back_populates="user", uselist=False, cascade="all, delete-orphan", lazy="joined")
    stance_entries = relationship("AgentStance", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    session_summaries = relationship("SessionSummary", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    panel = relationship("UserPanel", back_populates="user", uselist=False, cascade="all, delete-orphan", lazy="joined")
    saved_responses = relationship("SavedResponse", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    persona_drift_logs = relationship("PersonaDriftLog", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    scoring_audits = relationship("ScoringAudit", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    ux_events = relationship("UXEvent", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    agent_tasks = relationship("AgentTask", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    discuss_threads = relationship("DiscussThread", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    agent_contradictions = relationship(
        "AgentContradiction",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    confidence_ratings = relationship(
        "ConfidenceRating",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    answer_feedbacks = relationship(
        "AnswerFeedback",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    orchestrations = relationship(
        "Orchestration",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    watchlist_items = relationship(
        "WatchlistItem",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    subscriptions = relationship(
        "Subscription",
        back_populates="user",
        foreign_keys="Subscription.user_id",
        lazy="selectin",
    )
    room_memberships = relationship(
        "RoomMember",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    created_rooms = relationship(
        "Room",
        back_populates="creator",
        foreign_keys="Room.creator_id",
        lazy="selectin",
    )
    mcp_integrations = relationship(
        "MCPIntegration",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    consecutive_payments = Column(Integer, default=0, nullable=False)
    loyalty_reward_active = Column(Boolean, default=False, nullable=False)
    loyalty_free_months_remaining = Column(Integer, default=0, nullable=False)
    loyalty_resume_at = Column(DateTime, nullable=True)
    # Operator-telemetry for the loyalty resume sweep. attempts counts
    # consecutive failures (reset to 0 on success); next_attempt_at delays
    # retries so a misconfigured Razorpay key does not hammer the API.
    loyalty_resume_attempts = Column(Integer, default=0, nullable=False)
    loyalty_resume_next_attempt_at = Column(DateTime, nullable=True)
    agent_addon_active = Column(Boolean, default=False, nullable=False)
    agent_addon_cancelling = Column(Boolean, default=False, nullable=False)
    addon_subscription_id = Column(String(64), nullable=True)


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    razorpay_subscription_id = Column(String(64), unique=True, nullable=False)
    razorpay_customer_id = Column(String(64), nullable=True)
    plan_id = Column(String(64), nullable=False)
    plan_name = Column(String(128), nullable=False)
    tier = Column(String(16), nullable=False)
    billing_period = Column(String(16), nullable=False)
    status = Column(String(32), nullable=False, default="created")
    current_start = Column(DateTime, nullable=True)
    current_end = Column(DateTime, nullable=True)
    amount = Column(Integer, nullable=False)
    currency = Column(String(8), default="INR", nullable=False)
    payment_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    user = relationship("User", back_populates="subscriptions", foreign_keys=[user_id], lazy="joined")


class DBSession(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(36), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    guest_ip = Column(String(45), nullable=True)
    topics = Column(Text, default="[]")
    created_at = Column(DateTime, default=_now, nullable=False)
    last_active = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    user = relationship("User", back_populates="sessions", lazy="joined")
    turns = relationship("DBTurn", back_populates="session", cascade="all, delete-orphan", lazy="selectin")


class DBTurn(Base):
    __tablename__ = "turns"

    id = Column(Integer, primary_key=True, index=True)
    turn_id = Column(String(36), unique=True, index=True, nullable=False)
    session_id = Column(String(36), ForeignKey("sessions.session_id"), nullable=False)
    prompt = Column(Text, nullable=False)
    agent_responses = Column(Text, nullable=False)  # JSON
    winner_id = Column(String(20), nullable=False)
    timestamp = Column(DateTime, default=_now, nullable=False)

    session = relationship("DBSession", back_populates="turns", lazy="joined")


class UsageRecord(Base):
    __tablename__ = "usage_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    guest_ip = Column(String(45), nullable=True)
    session_id = Column(String(36), nullable=True)
    request_id = Column(String(36), nullable=False, index=True)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    estimated_cost_usd = Column(Float, default=0.0)
    prompt_category = Column(String(50), nullable=True)
    winner_agent_id = Column(String(20), nullable=True)
    persona_ids = Column(JSON, nullable=True, comment="List of 4 persona_ids used in this exchange")
    panel_used = Column(JSON, nullable=True, comment="Full panel config at time of exchange")
    mode = Column(String(20), default="arena", nullable=False, comment="arena | agent")
    winning_persona_id = Column(String(50), nullable=True, comment="persona_id of winner not just agent_id")
    total_processing_ms = Column(Integer, default=0)
    timestamp = Column(DateTime, default=_now, nullable=False, index=True)

    user = relationship("User", back_populates="usage_records", lazy="joined")


class GuestRateLimit(Base):
    """Tracks daily prompt counts for guests (by IP)."""
    __tablename__ = "guest_rate_limits"

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String(45), unique=True, index=True, nullable=False)
    prompt_count_today = Column(Integer, default=0, nullable=False)
    reset_at = Column(DateTime, default=_now, nullable=False)


class PasswordResetToken(Base):
    """Single-use, time-bounded password-reset token.

    Stores SHA-256(token) only — never the raw token. Used by the
    public /auth/forgot-password + /auth/reset-password flow. A reset
    marks ``used_at`` so the row cannot be replayed; a periodic sweep
    purges expired rows alongside the revoked-token one.
    """
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=_now, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    used_at = Column(DateTime, nullable=True)


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    preferred_depth = Column(String(20), default="moderate", nullable=False)
    trusted_persona_id = Column(String(50), nullable=True)
    topic_interests = Column(JSON, default=list, nullable=False)
    total_prompts = Column(Integer, default=0, nullable=False)
    total_debates = Column(Integer, default=0, nullable=False)
    total_discusses = Column(Integer, default=0, nullable=False)
    most_used_panel = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=_now, nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    user = relationship("User", back_populates="preferences", lazy="joined")


class AgentStance(Base):
    __tablename__ = "agent_stances"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    persona_id = Column(String(50), nullable=False)
    topic = Column(String(50), nullable=False)
    topic_normalized = Column(String(50), nullable=False)
    stance = Column(String(200), nullable=False)
    confidence = Column(Integer, default=0, nullable=False)
    session_id = Column(String(36), nullable=False)
    prompt_snippet = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    user = relationship("User", back_populates="stance_entries", lazy="joined")

    __table_args__ = (
        Index("idx_agent_stances_user_persona_topic", "user_id", "persona_id", "topic_normalized"),
    )


class SessionSummary(Base):
    __tablename__ = "session_summaries"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(36), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    main_topics = Column(JSON, default=list, nullable=False)
    dominant_category = Column(String(50), nullable=False)
    preferred_depth = Column(String(20), nullable=False)
    trusted_persona = Column(String(50), nullable=True)
    key_positions_taken = Column(JSON, default=list, nullable=False)
    session_summary = Column(Text, nullable=False)
    exchange_count = Column(Integer, default=0, nullable=False)
    raw_exchanges_count = Column(Integer, default=0, nullable=False)
    compressed_at = Column(DateTime, default=_now, nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)

    user = relationship("User", back_populates="session_summaries", lazy="joined")


class PersonaLibrary(Base):
    __tablename__ = "persona_library"

    id = Column(Integer, primary_key=True)
    persona_id = Column(String(50), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    color = Column(String(20), nullable=False)
    bg_tint = Column(String(20), nullable=False)
    quote = Column(String(255), nullable=False)
    description = Column(String(500), nullable=False)
    temperature = Column(Float, nullable=False)
    system_prompt = Column(Text, nullable=False)
    provider = Column(String(50), default="claude", nullable=False)
    is_locked = Column(Boolean, default=False)
    display_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=_now, nullable=False)


class UserPanel(Base):
    __tablename__ = "user_panels"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    slot_1 = Column(String(50), default="analyst", nullable=False)
    slot_2 = Column(String(50), default="philosopher", nullable=False)
    slot_3 = Column(String(50), default="pragmatist", nullable=False)
    slot_4 = Column(String(50), default="contrarian", nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    user = relationship("User", back_populates="panel", lazy="joined")


class SavedResponse(Base):
    __tablename__ = "saved_responses"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    session_id = Column(String(36), nullable=False)
    agent_id = Column(String(20), nullable=False)
    persona_id = Column(String(50), nullable=False)
    persona_name = Column(String(255), nullable=False)
    persona_color = Column(String(20), nullable=False)
    prompt = Column(String(1000), nullable=False)
    one_liner = Column(String(1000), nullable=False)
    verdict = Column(Text, nullable=False)
    score = Column(Integer, nullable=True)
    confidence = Column(Integer, nullable=True)
    saved_at = Column(DateTime, default=_now, nullable=False)
    user = relationship("User", back_populates="saved_responses", lazy="joined")


    __table_args__ = (
        Index("idx_saved_responses_user_session", "user_id", "session_id"),
        Index("idx_saved_responses_user_saved_at", "user_id", "saved_at"),
    )


class PersonaDriftLog(Base):
    __tablename__ = "persona_drift_logs"

    id = Column(Integer, primary_key=True)
    session_id = Column(String(36), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    persona_id = Column(String(50), nullable=False)
    agent_id = Column(String(20), nullable=False)
    prompt_snippet = Column(String(200), nullable=False, comment="First 200 chars of the prompt")
    drift_detected = Column(Boolean, nullable=False, default=False)
    overlap_detected = Column(Boolean, nullable=False, default=False)
    overlap_score = Column(Float, nullable=True, comment="Similarity score 0.0 to 1.0")
    reprompt_triggered = Column(Boolean, nullable=False, default=False)
    reprompt_success = Column(Boolean, nullable=True, comment="True if reprompt fixed the drift")
    original_response_snippet = Column(String(300), nullable=True)
    final_response_snippet = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=_now, nullable=False)

    user = relationship("User", back_populates="persona_drift_logs", lazy="joined")

    __table_args__ = (
        Index("idx_persona_drift_persona_detected", "persona_id", "drift_detected"),
        Index("idx_persona_drift_session", "session_id"),
        Index("idx_persona_drift_created_at", "created_at"),
    )


class ScoringAudit(Base):
    __tablename__ = "scoring_audits"

    id = Column(Integer, primary_key=True)
    session_id = Column(String(36), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    prompt_snippet = Column(String(200), nullable=False)
    prompt_category = Column(String(50), nullable=True)
    winner_agent_id = Column(String(20), nullable=False)
    winner_persona_id = Column(String(50), nullable=False)
    winner_score = Column(Integer, nullable=False)
    scores = Column(JSON, nullable=False, comment="All 4 agent scores")
    criteria_breakdown = Column(JSON, nullable=True, comment="Per-criteria scores directness/logic/etc")
    confidence_values = Column(JSON, nullable=True, comment="Self-reported confidence per agent")
    persona_ids_used = Column(JSON, nullable=True, comment="4 persona_ids in this exchange")
    scoring_duration_ms = Column(Integer, nullable=True, comment="How long scoring LLM call took")
    fallback_used = Column(Boolean, default=False, comment="True if scoring failed and fallback used")
    created_at = Column(DateTime, default=_now, nullable=False)

    user = relationship("User", back_populates="scoring_audits", lazy="joined")

    __table_args__ = (
        Index("idx_scoring_audits_winner_persona", "winner_persona_id"),
        Index("idx_scoring_audits_prompt_category", "prompt_category"),
        Index("idx_scoring_audits_created_at", "created_at"),
        Index("idx_scoring_audits_user_created", "user_id", "created_at"),
    )


class UXEvent(Base):
    __tablename__ = "ux_events"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, comment="Null for guest users")
    session_id = Column(String(36), nullable=False)
    event_type = Column(String(50), nullable=False, comment="See event types below")
    persona_id = Column(String(50), nullable=True, comment="Which persona was involved")
    agent_id = Column(String(20), nullable=True)
    event_metadata = Column("metadata", JSON, nullable=True, comment="Extra event data")
    created_at = Column(DateTime, default=_now, nullable=False)

    user = relationship("User", back_populates="ux_events", lazy="joined")


class AgentTask(Base):
    """Persistent record of Agent Mode runs (research memory)."""

    __tablename__ = "agent_tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    orchestration_id = Column(String(36), ForeignKey("orchestrations.id"), nullable=True, index=True)
    watchlist_item_id = Column(String(36), ForeignKey("watchlist_items.id"), nullable=True, index=True)
    task_id = Column(String(64), unique=True, nullable=False, index=True)
    title = Column(String(512), nullable=True)
    task_text = Column(Text, nullable=False)
    final_answer = Column(Text, nullable=True)
    final_score = Column(Integer, nullable=True)
    final_confidence = Column(Float, nullable=True)
    sources_used = Column(Text, nullable=True)
    topics = Column(Text, nullable=True)
    key_conclusions = Column(Text, nullable=True)
    stages_run = Column(Text, nullable=True)
    user_feedback = Column(String(32), nullable=True)
    feedback_note = Column(Text, nullable=True)
    insight_report = Column(JSON, nullable=True)
    contradictions = Column(JSON, nullable=True)
    intelligence_score = Column(JSON, nullable=True)
    is_live = Column(Boolean, default=False, nullable=False)
    live_last_checked = Column(DateTime, nullable=True)
    live_next_check = Column(DateTime, nullable=True)
    live_updates = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=_now, nullable=False)

    user = relationship("User", back_populates="agent_tasks", lazy="joined")
    orchestration = relationship("Orchestration", back_populates="child_tasks", lazy="joined")
    watchlist_item = relationship("WatchlistItem", back_populates="spawned_tasks", lazy="joined")
    room_task_links = relationship(
        "RoomTask",
        back_populates="agent_task",
        foreign_keys="RoomTask.task_id",
        lazy="selectin",
    )
    answer_feedbacks = relationship(
        "AnswerFeedback",
        back_populates="agent_task",
        foreign_keys="AnswerFeedback.task_id",
        lazy="selectin",
    )

    def to_dict_summary(self) -> dict:
        """Compact shape for cross-task LLM prompts (pipeline insights / contradictions)."""
        q = (self.task_text or "")[:300]
        fa = (self.final_answer or "")[:200]
        title = (self.title or "").strip() or (self.task_text or "")[:80]
        return {
            "task_id": self.task_id,
            "title": title,
            "question": q,
            "final_answer": fa,
            "created_at": self.created_at.isoformat() if self.created_at else "",
        }

    def to_dict(self) -> dict:
        """API-oriented snapshot of persisted agent task fields."""
        return {
            "task_id": self.task_id,
            "user_id": self.user_id,
            "title": self.title,
            "task_text": self.task_text,
            "final_answer": self.final_answer,
            "final_score": self.final_score,
            "final_confidence": self.final_confidence,
            "insight_report": self.insight_report,
            "contradictions": self.contradictions,
            "intelligence_score": self.intelligence_score,
            "is_live": bool(self.is_live),
            "live_last_checked": self.live_last_checked.isoformat()
            if self.live_last_checked
            else None,
            "live_next_check": self.live_next_check.isoformat()
            if self.live_next_check
            else None,
            "live_updates": self.live_updates if isinstance(self.live_updates, list) else [],
            "created_at": self.created_at.isoformat() if self.created_at else "",
        }


class ConfidenceRating(Base):
    """User self-rating vs system intelligence score (calibration game)."""

    __tablename__ = "confidence_ratings"
    __table_args__ = (
        UniqueConstraint("user_id", "task_id", name="uq_confidence_rating_user_task"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    task_id = Column(
        String(64),
        ForeignKey("agent_tasks.task_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_rating = Column(Integer, nullable=False)
    system_score = Column(Integer, nullable=False)
    delta = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)

    user = relationship("User", back_populates="confidence_ratings", lazy="joined")


class AnswerFeedback(Base):
    """User verdict on answer accuracy (correct / partial / wrong) per task."""

    __tablename__ = "answer_feedback"
    __table_args__ = (
        UniqueConstraint("user_id", "task_id", name="uq_answer_feedback_user_task"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    task_id = Column(
        String(64),
        ForeignKey("agent_tasks.task_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    verdict = Column(String(32), nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_now, nullable=False)

    user = relationship("User", back_populates="answer_feedbacks", lazy="joined")
    agent_task = relationship(
        "AgentTask",
        back_populates="answer_feedbacks",
        foreign_keys=[task_id],
        lazy="joined",
    )


class WatchlistItem(Base):
    """Recurring agent research question on a fixed hour interval."""

    __tablename__ = "watchlist_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    interval_hours = Column(Integer, nullable=False)
    expertise_level = Column(String(32), default="curious", nullable=False)
    expertise_domain = Column(String(512), default="", nullable=False)
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=False)
    latest_task_id = Column(String(64), nullable=True)
    run_count = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)

    user = relationship("User", back_populates="watchlist_items", lazy="joined")
    spawned_tasks = relationship("AgentTask", back_populates="watchlist_item", lazy="selectin")


class Orchestration(Base):
    """Multi-task agent run: parallel pipelines plus cross-task synthesis."""

    __tablename__ = "orchestrations"

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    task_ids = Column(JSON, nullable=False)
    synthesis = Column(Text, nullable=True)
    synthesis_bullets = Column(JSON, nullable=True)
    conflicts = Column(JSON, nullable=True)
    status = Column(String(32), default="running", nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)

    user = relationship("User", back_populates="orchestrations", lazy="joined")
    child_tasks = relationship("AgentTask", back_populates="orchestration", lazy="selectin")


class AgentContradiction(Base):
    """When a new Agent answer may contradict a prior conclusion."""

    __tablename__ = "agent_contradictions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    new_task_id = Column(String(64), nullable=False)
    old_task_id = Column(String(64), nullable=False, default="")
    contradiction_summary = Column(Text, nullable=False)
    severity = Column(String(32), default="moderate", nullable=False)
    resolved = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)

    user = relationship("User", back_populates="agent_contradictions", lazy="joined")


class Room(Base):
    """Shared research room: cross-member synthesis over Agent tasks."""

    __tablename__ = "rooms"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(255), nullable=False)
    slug = Column(String(128), unique=True, nullable=False, index=True)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    synthesis = Column(JSON, nullable=True)
    synthesis_updated_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)

    creator = relationship("User", back_populates="created_rooms", foreign_keys=[creator_id], lazy="joined")
    members = relationship("RoomMember", back_populates="room", cascade="all, delete-orphan", lazy="selectin")
    room_tasks = relationship("RoomTask", back_populates="room", cascade="all, delete-orphan", lazy="selectin")


class RoomMember(Base):
    __tablename__ = "room_members"
    __table_args__ = (UniqueConstraint("room_id", "user_id", name="uq_room_member_room_user"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(String(36), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    joined_at = Column(DateTime, default=_now, nullable=False)
    last_seen_at = Column(DateTime, default=_now, nullable=False)

    room = relationship("Room", back_populates="members", lazy="joined")
    user = relationship("User", back_populates="room_memberships", lazy="joined")


class MCPIntegration(Base):
    """User-connected external tools (Notion, Drive, GitHub) for Agent MCP context."""

    __tablename__ = "mcp_integrations"
    __table_args__ = (UniqueConstraint("user_id", "service", name="uq_mcp_user_service"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    service = Column(String(64), nullable=False)
    display_name = Column(String(128), nullable=False)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    connected_at = Column(DateTime, default=_now, nullable=False)
    integration_metadata = Column("metadata", JSON, nullable=True)

    user = relationship("User", back_populates="mcp_integrations", lazy="joined")


class RevokedToken(Base):
    """DB-backed JWT revocation list.

    Stores the SHA-256 hash of the raw token (NEVER the token itself) plus
    its JWT `exp` claim. Entries whose `expires_at` is in the past are
    eligible for lazy cleanup at lookup time.

    Replacing the previous in-memory TokenBlacklist gives us:
      - cross-process / cross-worker consistency (Render runs multiple uvicorn
        workers; the in-memory set was per-process)
      - survival across deploys and restarts (the in-memory set was wiped
        on every restart, granting logged-out tokens fresh windows of
        validity every time a worker bounced)
    """

    __tablename__ = "revoked_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, default=_now, nullable=False)
    reason = Column(String(64), nullable=True)  # 'logout' / 'admin' / etc.


class RoomTask(Base):
    __tablename__ = "room_tasks"
    __table_args__ = (UniqueConstraint("room_id", "task_id", name="uq_room_task_room_task"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(String(36), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = Column(String(64), ForeignKey("agent_tasks.task_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    added_at = Column(DateTime, default=_now, nullable=False)

    room = relationship("Room", back_populates="room_tasks", lazy="joined")
    agent_task = relationship(
        "AgentTask",
        back_populates="room_task_links",
        foreign_keys=[task_id],
        primaryjoin="RoomTask.task_id==AgentTask.task_id",
        lazy="joined",
    )
    user = relationship("User", lazy="joined")


class MigrationKind(str, PyEnum):
    WATCHLIST_ITEM = "watchlist_item"
    LIVE_AGENT_TASK = "live_agent_task"


class MigrationFlag(Base):
    """User-facing flags for Condura honest-rejection migration review."""

    __tablename__ = "migration_flags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    kind = Column(Enum(MigrationKind), nullable=False)
    ref_id = Column(String(64), nullable=False)
    affected_capability = Column(String(64), nullable=False)
    surfaced_at = Column(DateTime, default=_now, nullable=False)
    resolved_at = Column(DateTime, nullable=True)
    user_decision = Column(String(64), nullable=True)


class HandoffRecord(Base):
    """UX mirror of Condura handoffs. Condura audit log is system of record."""

    __tablename__ = "handoff_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    session_id = Column(String(36), nullable=True)
    capability = Column(String(64), nullable=False)
    execution_env = Column(String(32), nullable=False)
    condura_run_id = Column(String(64), nullable=True, index=True)
    # Status literals: see arena.core.handoff_status. Default is DISPATCH_PENDING.
    # Cannot import the constant here (db_models loads very early during
    # Base registration); keep the string in sync with handoff_status.DISPATCH_PENDING.
    status = Column(String(32), default="dispatch_pending", nullable=False)
    retention_class = Column(String(16), default="standard", nullable=False)
    summary = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=_now, nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)


class HandoffEvent(Base):
    """Browser-forwarded stream events for a handoff run."""

    __tablename__ = "handoff_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    handoff_id = Column(Integer, ForeignKey("handoff_records.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = Column(String(64), nullable=True)
    event_kind = Column(String(32), nullable=False)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=_now, nullable=False)


class HandoffDraft(Base):
    """Saved handoff payloads for Path B (Condura not ready / mobile)."""

    __tablename__ = "handoff_drafts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    capability = Column(String(64), nullable=False)
    payload_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)


class DiscussThread(Base):
    """A 1-on-1 conversation with a single agent.

    The streaming discuss endpoint takes the full conversation in the
    request, which means a user has nowhere to "come back" to a prior
    thread — every visit starts from scratch. This table is the durable
    record: messages are stored as a JSON array of {role, content,
    timestamp} dicts so we can reconstruct the conversation on read
    without a child table.
    """

    __tablename__ = "discuss_threads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    agent_id = Column(String(20), nullable=False)
    title = Column(String(255), nullable=True)
    messages = Column(JSON, default=list, nullable=False)
    original_prompt = Column(Text, nullable=True)
    original_verdict = Column(Text, nullable=True)
    last_message_at = Column(DateTime, default=_now, nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)

    user = relationship("User", back_populates="discuss_threads", lazy="joined")

