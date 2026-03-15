"""SQLAlchemy ORM models — the actual database tables"""

from datetime import datetime, timezone
from enum import Enum as PyEnum

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
)
from sqlalchemy.orm import relationship

from arena.database import Base


class UserTier(str, PyEnum):
    GUEST = "guest"
    REGISTERED = "registered"
    PRO = "pro"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    tier = Column(Enum(UserTier), default=UserTier.REGISTERED, nullable=False)
    created_at = Column(DateTime, default=_now, nullable=False)
    last_active = Column(DateTime, default=_now, onupdate=_now, nullable=False)
    prompt_count_today = Column(Integer, default=0, nullable=False)
    prompt_count_reset_at = Column(DateTime, default=_now, nullable=False)

    sessions = relationship("DBSession", back_populates="user", cascade="all, delete-orphan")
    usage_records = relationship("UsageRecord", back_populates="user", cascade="all, delete-orphan")
    preferences = relationship("UserPreference", back_populates="user", uselist=False, cascade="all, delete-orphan")
    stance_entries = relationship("AgentStance", back_populates="user", cascade="all, delete-orphan")
    session_summaries = relationship("SessionSummary", back_populates="user", cascade="all, delete-orphan")
    panel = relationship("UserPanel", back_populates="user", uselist=False, cascade="all, delete-orphan")
    saved_responses = relationship("SavedResponse", back_populates="user", cascade="all, delete-orphan")
    persona_drift_logs = relationship("PersonaDriftLog", back_populates="user", cascade="all, delete-orphan")
    scoring_audits = relationship("ScoringAudit", back_populates="user", cascade="all, delete-orphan")
    ux_events = relationship("UXEvent", back_populates="user", cascade="all, delete-orphan")


class DBSession(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(36), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    guest_ip = Column(String(45), nullable=True)
    topics = Column(Text, default="[]")
    created_at = Column(DateTime, default=_now, nullable=False)
    last_active = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    user = relationship("User", back_populates="sessions")
    turns = relationship("DBTurn", back_populates="session", cascade="all, delete-orphan")


class DBTurn(Base):
    __tablename__ = "turns"

    id = Column(Integer, primary_key=True, index=True)
    turn_id = Column(String(36), unique=True, index=True, nullable=False)
    session_id = Column(String(36), ForeignKey("sessions.session_id"), nullable=False)
    prompt = Column(Text, nullable=False)
    agent_responses = Column(Text, nullable=False)  # JSON
    winner_id = Column(String(20), nullable=False)
    timestamp = Column(DateTime, default=_now, nullable=False)

    session = relationship("DBSession", back_populates="turns")


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

    user = relationship("User", back_populates="usage_records")


class GuestRateLimit(Base):
    """Tracks daily prompt counts for guests (by IP)."""
    __tablename__ = "guest_rate_limits"

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String(45), unique=True, index=True, nullable=False)
    prompt_count_today = Column(Integer, default=0, nullable=False)
    reset_at = Column(DateTime, default=_now, nullable=False)


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

    user = relationship("User", back_populates="preferences")


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

    user = relationship("User", back_populates="stance_entries")

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

    user = relationship("User", back_populates="session_summaries")


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

    user = relationship("User", back_populates="panel")


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

    user = relationship("User", back_populates="saved_responses")

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

    user = relationship("User", back_populates="persona_drift_logs")

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

    user = relationship("User", back_populates="scoring_audits")

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

    user = relationship("User", back_populates="ux_events")
