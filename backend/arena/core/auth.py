"""Auth core — JWT creation/verification, password hashing, user helpers, FastAPI dependencies"""

import base64
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt as _bcrypt
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.database import get_db
from arena.db_models import User, UserTier
from arena.models.schemas import UserResponse
from arena.core.token_blacklist import token_blacklist

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


# ─────────────────────────────────────────────────
# Password helpers
# ─────────────────────────────────────────────────

def _prehash(plain: str) -> bytes:
    """SHA-256 → base64-encoded bytes (always 44 bytes), permanently within bcrypt's 72-byte limit.
    This means passwords of any length work identically — no truncation, no data loss."""
    digest = hashlib.sha256(plain.encode("utf-8")).digest()
    return base64.b64encode(digest)  # 44 ASCII bytes


def hash_password(plain: str) -> str:
    """Hash a password with SHA-256 prehash + bcrypt."""
    return _bcrypt.hashpw(_prehash(plain), _bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a password against its stored hash.

    Tries the current SHA-256 prehash method first.
    Falls back to the old truncation method for hashes created before this fix,
    so existing users are never locked out.
    """
    hashed_b = hashed.encode("utf-8") if isinstance(hashed, str) else hashed

    # Primary path: current method (SHA-256 prehash → bcrypt).
    try:
        if _bcrypt.checkpw(_prehash(plain), hashed_b):
            return True
    except Exception:
        pass

    # Backward-compat path: old method (plain UTF-8 truncated to 72 bytes → bcrypt).
    try:
        old_bytes = plain.encode("utf-8")[:72].decode("utf-8", errors="ignore").encode("utf-8")
        return _bcrypt.checkpw(old_bytes, hashed_b)
    except Exception:
        return False


# ─────────────────────────────────────────────────
# JWT helpers
# ─────────────────────────────────────────────────

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(user_id: int, tier: str) -> str:
    settings = get_settings()
    expire = _now_utc() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "tier": tier,
        "type": ACCESS_TOKEN_TYPE,
        "exp": expire,
        "iat": _now_utc(),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def create_refresh_token(user_id: int) -> str:
    settings = get_settings()
    expire = _now_utc() + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": str(user_id),
        "type": REFRESH_TOKEN_TYPE,
        "exp": expire,
        "iat": _now_utc(),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT. Returns payload dict or None if invalid."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        return payload
    except JWTError:
        return None


# ─────────────────────────────────────────────────
# User DB helpers
# ─────────────────────────────────────────────────

def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email.lower().strip()).first()


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def create_user(db: Session, email: str, password: str) -> User:
    user = User(
        email=email.lower().strip(),
        password_hash=hash_password(password),
        tier=UserTier.REGISTERED,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


# ─────────────────────────────────────────────────
# Cookie names
# ─────────────────────────────────────────────────

ACCESS_COOKIE = "arena_access"
REFRESH_COOKIE = "arena_refresh"
COOKIE_SAMESITE = "lax"
# COOKIE_SECURE is intentionally left as False here; auth.py routes
# derive secure= from settings.is_production at runtime.
COOKIE_SECURE = False


# ─────────────────────────────────────────────────
# FastAPI dependencies
# ─────────────────────────────────────────────────

def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[UserResponse]:
    """Returns the authenticated user as Pydantic model or None (for guest)."""
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        return None
    if token_blacklist.is_blacklisted(token):
        return None
    payload = decode_token(token)
    if not payload or payload.get("type") != ACCESS_TOKEN_TYPE:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    user = get_user_by_id(db, int(user_id))
    if not user:
        return None
    # Convert ORM model to Pydantic before session closes
    return UserResponse.model_validate(user)


def get_current_user_required(
    user: Optional[UserResponse] = Depends(get_current_user_optional),
) -> UserResponse:
    """Requires an authenticated user; raises 401 if not."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return user
