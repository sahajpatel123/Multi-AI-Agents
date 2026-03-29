"""Auth core — JWT creation/verification, password hashing, user helpers, FastAPI dependencies."""

import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt as _bcrypt
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from starlette.responses import Response

from arena.core.feedback_calibrator import get_feedback_calibration
from arena.database import get_db
from arena.db_models import Subscription, User, UserTier
from arena.models.schemas import FeedbackCalibrationInfo, UserResponse

SECRET_KEY = os.environ.get("SECRET_KEY", "")
ALGORITHM = "HS256"
ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"
ACCESS_TOKEN_MAX_AGE_SECONDS = 900       # 15 min
REFRESH_TOKEN_MAX_AGE_SECONDS = 604800   # 7 days

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"


# ─────────────────────────────────────────────────
# Password helpers
# ─────────────────────────────────────────────────

def _prehash(plain: str) -> bytes:
    """SHA-256 → base64 bytes, permanently within bcrypt's 72-byte input limit."""
    digest = hashlib.sha256(plain.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(plain: str) -> str:
    return _bcrypt.hashpw(_prehash(plain), _bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    hashed_bytes = hashed.encode("utf-8") if isinstance(hashed, str) else hashed

    try:
        if _bcrypt.checkpw(_prehash(plain), hashed_bytes):
            return True
    except Exception:
        pass

    try:
        legacy = plain.encode("utf-8")[:72].decode("utf-8", errors="ignore").encode("utf-8")
        return _bcrypt.checkpw(legacy, hashed_bytes)
    except Exception:
        return False


# ─────────────────────────────────────────────────
# JWT helpers
# ─────────────────────────────────────────────────

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(data: dict) -> str:
    payload = data.copy()
    expire = _now_utc() + timedelta(seconds=ACCESS_TOKEN_MAX_AGE_SECONDS)
    payload.update({"exp": expire, "type": ACCESS_TOKEN_TYPE})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    payload = data.copy()
    expire = _now_utc() + timedelta(seconds=REFRESH_TOKEN_MAX_AGE_SECONDS)
    payload.update({"exp": expire, "type": REFRESH_TOKEN_TYPE})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_token_hash(token: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_token(token), stored_hash)


def hash_refresh_token(token: str) -> str:
    return hash_token(token)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def is_token_valid(token: str) -> bool:
    return decode_token(token) is not None


# ─────────────────────────────────────────────────
# User DB helpers
# ─────────────────────────────────────────────────

def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email.lower().strip()).first()


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def _main_subscription_billing_period(db: Session, user: User) -> Optional[str]:
    uid = getattr(user, "subscription_id", None)
    if uid:
        row = db.query(Subscription).filter(Subscription.id == uid).first()
        if row and row.tier != "AGENT_ADDON":
            return row.billing_period
    row = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user.id,
            Subscription.tier.in_(("PLUS", "PRO")),
        )
        .order_by(Subscription.id.desc())
        .first()
    )
    return row.billing_period if row else None


def orm_user_to_response(user: User, db: Optional[Session] = None) -> UserResponse:
    tier_raw = user.tier.value if hasattr(user.tier, "value") else str(user.tier)
    if db is not None:
        cal_raw = get_feedback_calibration(user.id, db)
        feedback_calibration = FeedbackCalibrationInfo(**cal_raw)
    else:
        feedback_calibration = FeedbackCalibrationInfo()
    sub_period = _main_subscription_billing_period(db, user) if db is not None else None
    return UserResponse(
        id=user.id,
        email=user.email,
        tier=tier_raw,
        created_at=user.created_at,
        prompt_count_today=user.prompt_count_today,
        name=getattr(user, "name", None) or "",
        expertise_level=getattr(user, "expertise_level", None) or "curious",
        expertise_domain=getattr(user, "expertise_domain", None) or "",
        feedback_calibration=feedback_calibration,
        consecutive_payments=int(getattr(user, "consecutive_payments", 0) or 0),
        loyalty_reward_active=bool(getattr(user, "loyalty_reward_active", False)),
        loyalty_free_months_remaining=int(getattr(user, "loyalty_free_months_remaining", 0) or 0),
        loyalty_resume_at=getattr(user, "loyalty_resume_at", None),
        agent_addon_active=bool(getattr(user, "agent_addon_active", False)),
        agent_addon_cancelling=bool(getattr(user, "agent_addon_cancelling", False)),
        addon_subscription_id=getattr(user, "addon_subscription_id", None),
        subscription_billing_period=sub_period,
    )


def create_user(db: Session, email: str, password: str, name: str = "") -> User:
    user = User(
        email=email.lower().strip(),
        password_hash=hash_password(password),
        name=name.strip(),
        tier=UserTier.FREE,
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
# Cookie helpers
# ─────────────────────────────────────────────────

def auth_cookie_samesite_and_secure() -> tuple[str, bool]:
    is_prod = os.environ.get("ENVIRONMENT") == "production"
    return ("none", True) if is_prod else ("lax", False)


def persist_refresh_token(user: User, refresh_token: str) -> None:
    user.refresh_token_hash = hash_token(refresh_token)
    user.refresh_token_expires_at = (
        _now_utc() + timedelta(seconds=REFRESH_TOKEN_MAX_AGE_SECONDS)
    ).replace(tzinfo=None)


def clear_refresh_token(user: User) -> None:
    user.refresh_token_hash = None
    user.refresh_token_expires_at = None


def issue_auth_cookies(response: Response, user: User) -> tuple[str, str]:
    payload = {"sub": str(user.id), "user_id": user.id, "email": user.email}
    access_token = create_access_token(payload)
    refresh_token = create_refresh_token(payload)
    samesite, secure = auth_cookie_samesite_and_secure()

    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        max_age=ACCESS_TOKEN_MAX_AGE_SECONDS,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        max_age=REFRESH_TOKEN_MAX_AGE_SECONDS,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )
    return access_token, refresh_token


def set_auth_cookies_on_response(response: Response, user: User, db: Session) -> None:
    _access_token, refresh_token = issue_auth_cookies(response, user)
    persist_refresh_token(user, refresh_token)
    db.add(user)
    db.commit()
    db.refresh(user)


# ─────────────────────────────────────────────────
# FastAPI dependencies
# ─────────────────────────────────────────────────

async def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_token(token)
    if not payload or payload.get("type") != ACCESS_TOKEN_TYPE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    user_id = payload.get("sub") or payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = get_user_by_id(db, int(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


async def get_optional_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[User]:
    try:
        return await get_current_user(request, db)
    except HTTPException:
        return None


async def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[UserResponse]:
    user = await get_optional_user(request, db)
    if not user:
        return None
    return orm_user_to_response(user, db)


async def get_current_user_optional_orm(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[User]:
    return await get_optional_user(request, db)


async def get_current_user_required_orm(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    return await get_current_user(request, db)


async def get_current_user_required(
    request: Request,
    db: Session = Depends(get_db),
) -> UserResponse:
    user = await get_current_user(request, db)
    return orm_user_to_response(user, db)
