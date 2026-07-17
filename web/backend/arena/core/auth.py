"""Auth core — JWT, password hashing, user helpers (no cookies)."""

import base64
import hashlib
import logging
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt as _bcrypt
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.core.feedback_calibrator import get_feedback_calibration
from arena.core.tier_config import get_tier_str
from arena.db_models import Subscription, User, UserTier
from arena.models.schemas import FeedbackCalibrationInfo, UserResponse

logger = logging.getLogger(__name__)

# Counter for legacy-password-fallback matches. Operators watch this via
# admin-gated /api/health/detailed: when it stays 0 for a full user-active
# window (~90 days), every legacy hash has been auto-rehashed and the
# fallback verify branch can be deleted safely.
_legacy_hit_lock = threading.Lock()
_legacy_hits: int = 0

_settings = get_settings()
SECRET_KEY = _settings.secret_key
ALGORITHM = "HS256"
ACCESS_TOKEN_MAX_AGE_SECONDS = _settings.access_token_expire_minutes * 60
REFRESH_TOKEN_MAX_AGE_SECONDS = _settings.refresh_token_expire_days * 86400


def _prehash(plain: str) -> bytes:
    digest = hashlib.sha256(plain.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(plain: str) -> str:
    return _bcrypt.hashpw(_prehash(plain), _bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> tuple[bool, bool]:
    """Return (matched, used_legacy_fallback).

    The second flag tells callers when a password was verified via the legacy
    non-prehashed path (kept for old accounts whose hashes predate the SHA256
    prehash). On a real-account legacy match the caller MUST rehash to the
    modern format so the next login skips this fallback entirely.

    Important: we never return True unless bcrypt said so. Both branches go
    through `_bcrypt.checkpw`; nothing about the request reveals which path
    won.
    """
    hashed_bytes = hashed.encode("utf-8") if isinstance(hashed, str) else hashed

    try:
        if _bcrypt.checkpw(_prehash(plain), hashed_bytes):
            return True, False
    except Exception:
        pass

    try:
        legacy = plain.encode("utf-8")[:72].decode("utf-8", errors="ignore").encode("utf-8")
        if _bcrypt.checkpw(legacy, hashed_bytes):
            # Do not log any slice of the hash — even the algorithm prefix
            # is unnecessary on a hot path and can leak format metadata.
            with _legacy_hit_lock:
                global _legacy_hits
                _legacy_hits += 1
            logger.warning(
                "auth.verify_password: legacy path matched; "
                "caller should rehash to modern format",
            )
            return True, True
    except Exception:
        pass

    return False, False


# Precomputed bcrypt hash of a fixed throwaway value, using the same cost
# factor as real password hashes. When a login targets a non-existent account
# we still run one comparison against this so the response time does not reveal
# whether the email is registered (mitigates username enumeration via timing).
_DUMMY_PASSWORD_HASH = _bcrypt.hashpw(
    _prehash("timing-equalization-placeholder"), _bcrypt.gensalt(rounds=12)
).decode("utf-8")


def create_access_token(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(seconds=ACCESS_TOKEN_MAX_AGE_SECONDS)
    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "email": email,
        "exp": expire,
        "type": "access",
        # jti (RFC 7519 §4.1.7) — guarantees each issued access token
        # is byte-unique even when issued in the same second. Without
        # this, two /refresh calls in the same second would mint
        # identical access tokens, defeating the rotation's observable
        # token-rotation property.
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(seconds=REFRESH_TOKEN_MAX_AGE_SECONDS)
    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "email": email,
        "exp": expire,
        "type": "refresh",
        # jti (JWT ID) — RFC 7519 §4.1.7. A fresh UUID per issuance means
        # every refresh token is byte-unique even when the other payload
        # fields match. This is what makes rotation observable: a rotated
        # token is a different string than the old one, so the old one
        # can be blacklisted and replay rejected.
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def legacy_hits() -> int:
    """How many times the legacy password verify path has matched.

    Operators can grep this number in /api/health/detailed and watch
    it stay at zero for ~90 days. Once it has been at zero long
    enough that no real user could still be on a legacy hash, the
    fallback verify branch can be deleted.
    """
    with _legacy_hit_lock:
        return _legacy_hits


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email.lower().strip()).first()


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def _main_subscription_billing_period(db: Session, user: User) -> Optional[str]:
    uid = getattr(user, "subscription_id", None)
    if uid:
        row = db.query(Subscription).filter(Subscription.id == uid).first()
        if row and get_tier_str(row) != "agent_addon":
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
        # Equalize timing: run a throwaway bcrypt comparison so an unregistered
        # email takes about as long as a wrong password on a real account. This
        # denies attackers a timing side-channel for username enumeration.
        verify_password(password, _DUMMY_PASSWORD_HASH)
        return None
    matched, used_legacy = verify_password(password, user.password_hash)
    if not matched:
        return None
    if used_legacy:
        # Silent migration: the user proved knowledge of the password via the
        # legacy path, so it's safe to upgrade their hash in place. Stops the
        # legacy fallback from ever needing to fire for this account again.
        user.password_hash = hash_password(password)
        db.add(user)
        db.commit()
        logger.info(
            "auth.authenticate_user: rehashed legacy password for user_id=%s",
            user.id,
        )
    return user
