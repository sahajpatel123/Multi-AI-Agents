"""Auth core — JWT creation/verification, password hashing, user helpers, FastAPI dependencies"""

import base64
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt as _bcrypt
from fastapi import Depends, HTTPException, Request, status
from starlette.responses import Response
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.core.tier_config import normalize_tier
from arena.database import get_db
from arena.db_models import Subscription, User, UserTier
from arena.core.feedback_calibrator import get_feedback_calibration
from arena.models.schemas import FeedbackCalibrationInfo, UserResponse
from arena.core.token_blacklist import token_blacklist

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"
ACCESS_TOKEN_MAX_AGE_SECONDS = 900      # 15 minutes
REFRESH_TOKEN_MAX_AGE_SECONDS = 604800  # 7 days


# ─────────────────────────────────────────────────
# Password helpers
# ─────────────────────────────────────────────────

def _prehash(plain: str) -> bytes:
    """SHA-256 → base64-encoded bytes (always 44 bytes), permanently within bcrypt's 72-byte limit.
    This means passwords of any length work identically — no truncation, no data loss."""
    digest = hashlib.sha256(plain.encode("utf-8")).digest()
    return base64.b64encode(digest)  # 44 ASCII bytes


def hash_password(plain: str) -> str:
    """Hash a password with SHA-256 prehash + bcrypt (cost factor 12)."""
    return _bcrypt.hashpw(_prehash(plain), _bcrypt.gensalt(rounds=12)).decode("utf-8")


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
    expire = _now_utc() + timedelta(minutes=15)
    payload = {
        "sub": str(user_id),
        "tier": normalize_tier(tier).value,
        "type": ACCESS_TOKEN_TYPE,
        "exp": expire,
        "iat": _now_utc(),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def create_refresh_token(user_id: int) -> str:
    settings = get_settings()
    expire = _now_utc() + timedelta(days=7)
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


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ─────────────────────────────────────────────────
# User DB helpers
# ─────────────────────────────────────────────────

def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email.lower().strip()).first()


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def _main_subscription_billing_period(db: Session, user: User) -> Optional[str]:
    """Billing period of the user's primary Plus/Pro subscription (excludes Agent add-on)."""
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
    """Build UserResponse from SQLAlchemy User (avoid model_validate on ORM quirks / NULLs)."""
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
        tier=normalize_tier(tier_raw).value,
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


def create_user(db: Session, email: str, password: str) -> User:
    user = User(
        email=email.lower().strip(),
        password_hash=hash_password(password),
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
# Cookie names
# ─────────────────────────────────────────────────

ACCESS_COOKIE = "arena_access"
REFRESH_COOKIE = "arena_refresh"
# Default for dev; production uses SameSite=None + Secure for cross-site (e.g. Vercel + Render).
COOKIE_SAMESITE = "lax"
COOKIE_SECURE = False


def auth_cookie_samesite_and_secure() -> tuple[str, bool]:
    """(samesite, secure). Production: none+True for cross-origin credentialed requests."""
    settings = get_settings()
    if settings.is_production:
        return ("none", True)
    return ("lax", False)


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
    return orm_user_to_response(user, db)


def get_current_user_optional_orm(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Cookie JWT auth; returns SQLAlchemy User or None."""
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
    return get_user_by_id(db, int(user_id))


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


def persist_refresh_token(user: User, refresh_token: str) -> None:
    user.refresh_token_hash = hash_refresh_token(refresh_token)
    user.refresh_token_expires_at = (
        _now_utc() + timedelta(seconds=REFRESH_TOKEN_MAX_AGE_SECONDS)
    ).replace(tzinfo=None)


def clear_refresh_token(user: User) -> None:
    user.refresh_token_hash = None
    user.refresh_token_expires_at = None


def issue_auth_cookies(response: Response, user: User) -> tuple[str, str]:
    tier_raw = user.tier.value if hasattr(user.tier, "value") else str(user.tier)
    tier_val = normalize_tier(tier_raw).value
    access_token = create_access_token(user.id, tier_val)
    refresh_token = create_refresh_token(user.id)
    samesite, secure = auth_cookie_samesite_and_secure()

    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=ACCESS_TOKEN_MAX_AGE_SECONDS,
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=REFRESH_TOKEN_MAX_AGE_SECONDS,
        path="/api/auth/refresh",
    )
    return access_token, refresh_token


def set_auth_cookies_on_response(response: Response, user: User, db: Session) -> None:
    """Re-issue access + refresh cookies and persist the rotated refresh token."""
    _access_token, refresh_token = issue_auth_cookies(response, user)
    persist_refresh_token(user, refresh_token)
    db.add(user)
    db.commit()
    db.refresh(user)


def get_current_user_required_orm(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """Same auth as cookie JWT, but returns the SQLAlchemy User row (for DB updates)."""
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    if token_blacklist.is_blacklisted(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    payload = decode_token(token)
    if not payload or payload.get("type") != ACCESS_TOKEN_TYPE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    user = get_user_by_id(db, int(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return user
