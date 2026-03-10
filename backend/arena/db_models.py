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
    String,
    Text,
    Enum,
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
