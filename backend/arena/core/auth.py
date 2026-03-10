"""Auth core — JWT creation/verification, password hashing, user helpers, FastAPI dependencies"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.database import get_db
from arena.db_models import User, UserTier

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


# ─────────────────────────────────────────────────
# Password helpers
# ─────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


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
COOKIE_SECURE = False  # Set True in production (HTTPS)


# ─────────────────────────────────────────────────
# FastAPI dependencies
# ─────────────────────────────────────────────────

def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Returns the authenticated user or None (for guest)."""
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        return None
    payload = decode_token(token)
    if not payload or payload.get("type") != ACCESS_TOKEN_TYPE:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return get_user_by_id(db, int(user_id))


def get_current_user_required(
    user: Optional[User] = Depends(get_current_user_optional),
) -> User:
    """Requires an authenticated user; raises 401 if not."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return user
