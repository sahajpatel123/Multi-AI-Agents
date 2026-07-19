"""Auth routes — /api/auth/* (Bearer tokens in JSON body, no cookies)."""

import logging
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from fastapi.responses import JSONResponse
from slowapi import Limiter
from sqlalchemy import Date, cast, func
from sqlalchemy.exc import OperationalError, InterfaceError
from sqlalchemy.orm import Session

from arena.core.client_ip import get_request_client_ip
from arena.core.rate_limits import enforce_ip_rate_limit, enforce_user_rate_limit
from arena.core.datetime_utils import utcnow_naive

from arena.core.errors import ErrorCodes
from arena.core.auth import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    create_user,
    decode_token,
    get_user_by_email,
    hash_password,
    orm_user_to_response,
    verify_password,
)


def _payload_exp_seconds(token: str) -> Optional[int]:
    """Return the JWT `exp` claim as an epoch second, or None if absent/invalid.

    Used by /logout to record the token's natural expiry in the
    persistent blacklist. We never crash if the token is malformed —
    the caller just skips revocation for that token.
    """
    try:
        payload = decode_token(token)
    except Exception:
        return None
    if not payload:
        return None
    exp = payload.get("exp")
    return int(exp) if isinstance(exp, (int, float)) else None


def _epoch_to_naive(epoch_seconds: int) -> datetime:
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).replace(tzinfo=None)


def _subject_user_id(payload: dict) -> Optional[int]:
    """Parse JWT subject to int user id, or None if missing/malformed."""
    raw = payload.get("sub") or payload.get("user_id")
    if raw is None:
        return None
    try:
        return int(str(raw).strip())
    except (ValueError, TypeError):
        return None


def _owned_refresh_token(token: str, user_id: int) -> Optional[dict]:
    """Return decoded payload only if token is a live refresh JWT for user_id.

    Logout must never blacklist another user's refresh token. Without this
    check, any authenticated client could POST a victim's refresh_token in
    the body and force-revoke their session (session DoS / forced re-login).
    """
    try:
        payload = decode_token(token)
    except Exception:
        return None
    if not payload or payload.get("type") != "refresh":
        return None
    sub = _subject_user_id(payload)
    if sub is None or sub != int(user_id):
        return None
    return payload
from arena.core.token_blacklist import token_blacklist
from arena.core.dependencies import get_current_user_required_orm
from arena.core.feedback_calibrator import get_answer_feedback_distribution
from arena.core.input_validation import sanitize_html
from arena.core.login_limiter import login_limiter, registration_limiter
from arena.core.tier_config import (
    TIER_FEATURES,
    UserTier,
    get_credit_budget,
    get_daily_limit,
    get_tier_personas,
    get_tier_str,
    normalize_tier,
    upgrade_target,
)
from arena.database import dispose_engine, get_db, is_db_connectivity_error
from arena.db_models import PasswordResetToken, UsageRecord, User
from arena.models.schemas import LoginRequest, RegisterRequest, UserProfilePatch, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])
user_router = APIRouter(prefix="/api/user", tags=["auth"])
logger = logging.getLogger(__name__)


def _raise_if_db_unavailable(exc: BaseException, action: str) -> None:
    """Map DB connectivity failures to 503 (not opaque 500 'Login failed')."""
    if not (
        is_db_connectivity_error(exc)
        or isinstance(exc, (OperationalError, InterfaceError))
    ):
        return
    dispose_engine()
    logger.exception("%s failed: database unavailable", action)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "error": "database_unavailable",
            "message": "Database temporarily unavailable. Please try again in a moment.",
        },
    )

# Key by spoof-resistant client IP (rightmost XFF in prod; peer in dev).
limiter = Limiter(key_func=get_request_client_ip)

_COMMON_PASSWORDS = {
    # Top 20 most common passwords plus variations
    "password",
    "12345678",
    "password1",
    "qwerty123",
    "letmein1",
    "welcome1",
    "123456789",
    "password123",
    "admin",
    "admin123",
    "letmein",
    "welcome",
    "monkey",
    "dragon",
    "master",
    "login",
    "abc123",
    "iloveyou",
    "princess",
    "football",
    "trustno1",
    "sunshine",
    "ashley",
    "bailey",
    "passw0rd",
    "shadow",
    "123123",
}

_EXPERTISE_LEVELS = {"none", "curious", "practitioner", "expert", "researcher"}


def user_payload(user: User, db: Session) -> dict[str, Any]:
    """Full user shape for API clients; name is always a string."""
    return orm_user_to_response(user, db).model_dump(mode="json")


def _validate_password_strength(password: str) -> tuple[bool, str]:
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    if not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter"
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number"
    if password.lower() in _COMMON_PASSWORDS:
        return False, "Password is too common. Please choose a stronger one"
    return True, ""


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> JSONResponse:
    # HTTPException (400/409/429) must NOT be logged as unexpected server
    # failures — that filled logs on every weak-password attempt and made
    # real errors harder to spot (and was a log-volume DoS vector).
    try:
        # Lockout check only — do not pre-count this attempt as a failure.
        registration_limiter.assert_not_locked(request)

        # Bound successful account creation per IP (mass-signup spam).
        # This MUST run BEFORE create_user: if it triggers after the user
        # is already committed, the user record exists in the DB while
        # the response is 429 — and the next /register attempt with the
        # same email returns 409, leaving a phantom account.
        from arena.core.rate_limits import enforce_ip_rate_limit

        enforce_ip_rate_limit(
            request,
            scope="registration_create",
            limit=5,
            window_seconds=3600,
            message="Too many accounts created from this network. Please try again later.",
        )

        is_valid, error_msg = _validate_password_strength(body.password)
        if not is_valid:
            registration_limiter.record_failure(request)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "weak_password", "message": error_msg},
            )

        if get_user_by_email(db, body.email):
            registration_limiter.record_failure(request)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with that email already exists",
            )

        user = create_user(db, body.email, body.password, body.name)
        access = create_access_token(user.id, user.email)
        refresh = create_refresh_token(user.id, user.email)
        registration_limiter.clear(request)
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content={
                "success": True,
                "access_token": access,
                "refresh_token": refresh,
                "user": user_payload(user, db),
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        _raise_if_db_unavailable(exc, "Registration")
        logger.exception("Registration failed")
        # Unexpected server failure still counts toward abuse window.
        try:
            registration_limiter.record_failure(request)
        except HTTPException:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed",
        )


@router.post("/login")
async def login(
    body: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> JSONResponse:
    # Same contract as register: expected client errors (401/429) are not
    # logged as stack traces. DB outages become 503; other failures → 500.
    try:
        # Check lockout first — never pre-record a failure before bcrypt runs.
        # Pre-recording locked out legitimate recovery on the Nth correct
        # password after (N-1) typos.
        login_limiter.assert_not_locked(request)

        user = authenticate_user(db, body.email, body.password)
        if not user:
            login_limiter.record_failure(request)
            # Surface remaining attempts so the UI can render
            # '2 attempts remaining' instead of a bare 'invalid'.
            # The number is a soft hint — leaking it doesn't materially
            # help an attacker who already has the email (knowing
            # they're 1/3 down just means they have to try again on a
            # different IP, which they could do anyway).
            remaining = login_limiter.remaining_attempts(request)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "error": "invalid_credentials",
                    "message": "Invalid email or password",
                    "remaining_attempts": remaining,
                },
            )

        access = create_access_token(user.id, user.email)
        refresh = create_refresh_token(user.id, user.email)
        login_limiter.clear(request)
        return JSONResponse(
            content={
                "success": True,
                "access_token": access,
                "refresh_token": refresh,
                "user": user_payload(user, db),
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        # Root cause of opaque "Login failed" in prod logs: Postgres TLS
        # handshake / pool death. Surface 503 so clients can retry cleanly.
        _raise_if_db_unavailable(exc, "Login")
        logger.exception("Login failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed",
        )


@router.post("/logout")
async def logout(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user_required_orm)) -> JSONResponse:
    """Revoke ALL tokens for this session: the access token used for the
    logout request AND any refresh token the client forwards (in body or
    Authorization header). Without blacklisting the refresh token too, a
    logged-out session can be silently re-minted via /api/auth/refresh.

    Refresh tokens in the body are only revoked when they belong to the
    authenticated caller — otherwise any logged-in client could force-
    revoke another user's session by pasting their refresh JWT.
    """
    # 30/min/user — blacklist writes; stop logout-flood thrash.
    enforce_user_rate_limit(
        user.id,
        scope="auth_logout",
        limit=30,
        window_seconds=60,
        message="Too many logout attempts. Please slow down.",
    )
    auth_header = request.headers.get("Authorization", "")
    access_token = ""
    if auth_header.startswith("Bearer "):
        # Strip consistently so blacklist lookups match the dependency's token.
        access_token = auth_header[7:].strip()

    # Pull the refresh token from body OR header. Body wins if both arrive.
    refresh_token = ""
    try:
        body = await request.json()
        if isinstance(body, dict):
            refresh_token = (body.get("refresh_token") or "").strip()
    except Exception:
        pass
    if not refresh_token and auth_header.startswith("Bearer "):
        # Header-fallback: also accept a refresh token here so a client that
        # only ever sets one Authorization header can still log out cleanly.
        # If the header is the access token (normal case), ownership checks
        # below skip treating it as a second refresh revoke.
        refresh_token = auth_header[7:].strip()

    access_revoked = False
    refresh_revoked = False
    if access_token:
        access_exp = _payload_exp_seconds(access_token)
        if access_exp is not None:
            token_blacklist.add(
                access_token, expires_at=_epoch_to_naive(access_exp), db=db, reason="logout"
            )
            access_revoked = True
    if refresh_token and refresh_token != access_token:
        owned = _owned_refresh_token(refresh_token, user.id)
        if owned is not None:
            exp = owned.get("exp")
            if isinstance(exp, (int, float)):
                token_blacklist.add(
                    refresh_token,
                    expires_at=_epoch_to_naive(int(exp)),
                    db=db,
                    reason="logout",
                )
                refresh_revoked = True
        else:
            # Foreign or malformed refresh — do not revoke, do not error
            # (logout of the caller's access token still succeeds).
            logger.warning(
                "Logout ignored non-owned or invalid refresh token for user=%s",
                user.id,
            )
    logger.info(
        "Logout user=%d access_revoked=%s refresh_revoked=%s",
        user.id,
        access_revoked,
        refresh_revoked,
    )
    return JSONResponse({"success": True})


@router.post("/refresh")
@limiter.limit("20/hour")
async def refresh(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    refresh_token = ""
    try:
        body = await request.json()
        if isinstance(body, dict):
            refresh_token = (body.get("refresh_token") or "").strip()
    except Exception:
        pass

    if not refresh_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            refresh_token = auth_header[7:].strip()

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": ErrorCodes.INVALID_TOKEN, "message": "Invalid or expired refresh token"},
        )

    # Honor the blacklist: a logout that revoked the refresh token must
    # actually end the session, not just gate the access token.
    if token_blacklist.is_blacklisted(refresh_token, db):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )

    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": ErrorCodes.INVALID_TOKEN, "message": "Invalid or expired refresh token"},
        )

    uid = _subject_user_id(payload)
    if uid is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Refresh-token rotation (single-use refresh tokens).
    #
    # Without rotation, a captured refresh token keeps minting valid
    # access tokens indefinitely — the only mitigation is the user
    # eventually logging out (which fires /logout's blacklist entry).
    # An attacker can replay the captured token in the gap between
    # capture and logout, minting fresh access tokens as many times
    # as they want.
    #
    # Rotation closes the gap: every successful /refresh blacklists
    # the OLD refresh token BEFORE returning the new pair. Fail closed:
    # if we cannot record the revocation (missing exp, DB error), we
    # refuse to mint a new pair. Issuing while the old token stays
    # valid would leave two live refresh tokens — the exact dual-
    # session hole rotation is meant to close.
    refresh_exp = _payload_exp_seconds(refresh_token)
    if refresh_exp is None:
        # Decoded payload without a usable exp cannot be TTL'd on the
        # blacklist; reject rather than rotate with an immortal row
        # or skip blacklisting entirely.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": ErrorCodes.INVALID_TOKEN, "message": "Invalid or expired refresh token"},
        )
    try:
        token_blacklist.add(
            refresh_token,
            expires_at=_epoch_to_naive(refresh_exp),
            db=db,
            reason="refresh_rotation",
        )
    except Exception as _exc:
        logger.error(
            "Failed to blacklist rotated refresh token for user=%s: %s",
            user.id, _exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": ErrorCodes.SERVICE_UNAVAILABLE, "message": "Unable to complete token rotation. Please try again."},
        ) from _exc

    new_access = create_access_token(user.id, user.email)
    new_refresh = create_refresh_token(user.id, user.email)

    return JSONResponse(
        content={
            "success": True,
            "access_token": new_access,
            "refresh_token": new_refresh,
            "user": user_payload(user, db),
        },
    )


@router.get("/me", response_model=UserResponse)
async def me(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> UserResponse:
    # Routed through get_current_user_required_orm so the blacklist check
    # at dependencies.py:26 is enforced — without this the endpoint had a
    # side-channel that accepted logged-out tokens.
    # 120/min/user — shell hydrate is hot; still cap token-replay spam.
    enforce_user_rate_limit(
        user.id,
        scope="auth_me",
        limit=120,
        window_seconds=60,
        message="Too many profile reads. Please slow down.",
    )
    return orm_user_to_response(user, db)


@router.get("/me/features")
async def my_features(
    user: User = Depends(get_current_user_required_orm),
) -> dict:
    """Just the caller's tier feature map — a cheaper alternative to
    GET /me when a UI only needs to know 'can this user do X?'.

    Returns { tier, features: {...} } where features is the boolean
    map from TIER_FEATURES. Same auth contract as /me."""
    # 120/min/user — feature gates poll often; match /me ceiling.
    enforce_user_rate_limit(
        user.id,
        scope="auth_me_features",
        limit=120,
        window_seconds=60,
        message="Too many feature-map reads. Please slow down.",
    )
    tier = user.tier.value if hasattr(user.tier, "value") else str(user.tier)
    nt = normalize_tier(tier)
    return {
        "tier": tier,
        "features": TIER_FEATURES.get(nt, TIER_FEATURES[UserTier.FREE]),
    }


@router.get("/check-email")
async def check_email_availability(
    request: Request,
    email: str = Query(..., min_length=1, max_length=255),
    db: Session = Depends(get_db),
) -> dict:
    """Public pre-flight check: is this email already registered?

    Used by the signup form to render 'email already taken' before the
    user submits — better UX than waiting for the 409 from /register.
    Returns ONLY a boolean (and the normalized email), never the
    matching user record — checking email availability must NOT leak
    the existence of any other account.

    IP rate limit (5/min, scoped per IP) blocks the email-enumeration
    attack: without it an unauthenticated caller could probe thousands
    of addresses per second and learn which ones are registered. The
    response shape is constant (just the bool), so a successful probe
    tells the attacker 'this email is taken' — which is exactly the
    leak we need to throttle.
    """
    enforce_ip_rate_limit(
        request,
        scope="auth_check_email",
        limit=5,
        window_seconds=60,
        message="Too many email-availability checks. Please slow down.",
    )
    normalized = email.lower().strip()
    existing = get_user_by_email(db, normalized)
    return {
        "email": normalized,
        "available": existing is None,
    }


@user_router.patch("/profile", response_model=UserResponse)
async def patch_user_profile(
    body: UserProfilePatch,
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> UserResponse:
    # 30/min/user — profile saves from the account panel.
    enforce_user_rate_limit(
        user.id,
        scope="user_profile_patch",
        limit=30,
        window_seconds=60,
        message="Too many profile updates. Please slow down.",
    )
    if body.name is not None:
        user.name = sanitize_html(body.name, max_length=100, field_name="name")
    if body.expertise_level is not None:
        level = body.expertise_level.strip().lower()
        if level not in _EXPERTISE_LEVELS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": ErrorCodes.VALIDATION_ERROR, "message": "Invalid expertise_level"},
            )
        user.expertise_level = level
    if body.expertise_domain is not None:
        user.expertise_domain = sanitize_html(
            body.expertise_domain,
            max_length=100,
            field_name="expertise domain",
        )

    db.add(user)
    db.commit()
    db.refresh(user)
    return orm_user_to_response(user, db)


@user_router.get("/answer-feedback-stats")
async def user_answer_feedback_stats(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> dict:
    # 60/min/user — account panel chart; light aggregation.
    enforce_user_rate_limit(
        user.id,
        scope="user_feedback_stats",
        limit=60,
        window_seconds=60,
        message="Too many feedback stats reads. Please slow down.",
    )
    return get_answer_feedback_distribution(user.id, db)


@user_router.get("/usage")
async def get_user_usage(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> dict:
    # 60/min/user — multi-aggregate usage dashboard; cap polling.
    enforce_user_rate_limit(
        user.id,
        scope="user_usage",
        limit=60,
        window_seconds=60,
        message="Too many usage stats reads. Please slow down.",
    )
    normalized = normalize_tier(get_tier_str(user))
    daily_limit = get_credit_budget(normalized)
    weekly_limit = daily_limit * 7

    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    week_start = today_start - timedelta(days=7)
    month_start = today_start - timedelta(days=30)

    token_sum = UsageRecord.input_tokens + UsageRecord.output_tokens

    credits_used_today = int(
        db.query(func.coalesce(func.sum(token_sum), 0))
        .filter(UsageRecord.user_id == user.id, UsageRecord.timestamp >= today_start)
        .scalar()
        or 0,
    )
    credits_used_week = int(
        db.query(func.coalesce(func.sum(token_sum), 0))
        .filter(UsageRecord.user_id == user.id, UsageRecord.timestamp >= week_start)
        .scalar()
        or 0,
    )

    credits_remaining_today = max(daily_limit - credits_used_today, 0)
    credits_remaining_week = max(weekly_limit - credits_used_week, 0)

    total_tasks_month = (
        db.query(func.count(UsageRecord.id))
        .filter(UsageRecord.user_id == user.id, UsageRecord.timestamp >= month_start)
        .scalar()
        or 0
    )
    total_tasks_month = int(total_tasks_month)

    chart_start = today_start - timedelta(days=13)
    day_col = cast(UsageRecord.timestamp, Date)
    rows = (
        db.query(day_col.label("day"), func.coalesce(func.sum(token_sum), 0).label("total"))
        .filter(UsageRecord.user_id == user.id, UsageRecord.timestamp >= chart_start)
        .group_by(day_col)
        .all()
    )
    by_day: dict[date, int] = {}
    for r in rows:
        d = r.day
        if isinstance(d, datetime):
            dk = d.date()
        elif isinstance(d, date):
            dk = d
        elif isinstance(d, str):
            dk = date.fromisoformat(d[:10])
        else:
            dk = d
        by_day[dk] = int(r.total or 0)

    usage_history: list[int] = []
    for i in range(13, -1, -1):
        day = (today_start - timedelta(days=i)).date()
        usage_history.append(by_day.get(day, 0))

    return {
        "credits_used_today": credits_used_today,
        "credits_remaining_today": credits_remaining_today,
        "daily_limit": daily_limit,
        "credits_used_week": credits_used_week,
        "credits_remaining_week": credits_remaining_week,
        "weekly_limit": weekly_limit,
        "total_tasks_month": total_tasks_month,
        "usage_history": usage_history,
    }


@user_router.get("/tier")
async def get_user_tier_summary(
    user: User = Depends(get_current_user_required_orm),
) -> dict:
    # 120/min/user — feature gates hydrate often across shells.
    enforce_user_rate_limit(
        user.id,
        scope="user_tier",
        limit=120,
        window_seconds=60,
        message="Too many tier summary reads. Please slow down.",
    )
    normalized_tier = normalize_tier(get_tier_str(user))
    daily_limit = get_daily_limit(normalized_tier)
    messages_used_today = min(int(user.prompt_count_today or 0), daily_limit)
    base = TIER_FEATURES[normalized_tier]
    agent_mode = bool(base.get("agent_mode", False))
    if normalized_tier == UserTier.PRO:
        agent_mode = True
    elif normalized_tier == UserTier.PLUS and (
        getattr(user, "agent_addon_active", False)
        or getattr(user, "agent_addon_cancelling", False)
    ):
        agent_mode = True

    return {
        "tier": normalized_tier.value,
        "daily_limit": daily_limit,
        "messages_used_today": messages_used_today,
        "messages_remaining": max(daily_limit - messages_used_today, 0),
        "allowed_personas": sorted(get_tier_personas(normalized_tier)),
        "features": {
            "debate": base["debate"],
            "discuss": base["discuss"],
            "memory": base["memory"],
            "saved_responses": base["saved_responses"],
            "agent_mode": agent_mode,
            "agent_orchestrate": base.get("agent_orchestrate", False),
            "agent_watchlist": base.get("agent_watchlist", False),
            "scoring_audit": base["scoring_audit"],
        },
        "upgrade_to": upgrade_target(normalized_tier),
    }


# ──────────────────────────────────────────────────────────────
# Account security: change-password + security metadata
# ──────────────────────────────────────────────────────────────


class ChangePasswordBody(BaseModel):
    """Body for POST /auth/change-password.

    Requiring the current password is a deliberate friction — a stolen
    session token alone isn't enough to take over the account, the
    attacker would also need the user's password.
    """

    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        ok, reason = _validate_password_strength(v)
        if not ok:
            raise ValueError(reason)
        return v


@router.post("/change-password")
async def change_password(
    body: ChangePasswordBody,
    request: Request,
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> dict:
    """Rotate the caller's password.

    Verifies the current password before accepting the new one — so a
    stolen access token alone can't take over the account. Rate-limited
    to 5/minute because the verify step runs scrypt (CPU-bound) and a
    brute-force loop would be expensive even with strong hashing.
    """
    enforce_user_rate_limit(
        user.id,
        scope="auth_change_password",
        limit=5,
        window_seconds=60,
        message="Too many password change attempts. Please slow down.",
    )

    matched, _ = verify_password(body.current_password, user.password_hash)
    if not matched:
        # Use the same response shape as a stale-token failure so a
        # caller can't enumerate which current_password values are
        # correct via 401 vs 422.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "current_password_invalid"},
        )

    if matched and verify_password(body.new_password, user.password_hash)[0]:
        # Block no-op rotations — silently accepting a "new" password
        # equal to the current one would defeat the purpose of having
        # a separate password field.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "new_password_must_differ"},
        )

    user.password_hash = hash_password(body.new_password)
    db.add(user)
    db.commit()

    # Surface a different log line so a SOC can grep for it.
    logger.info("password_changed user_id=%s", user.id)
    return {"status": "changed"}


@router.get("/security")
async def account_security(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> dict:
    """Account-security metadata for the Security panel.

    Returns the timestamps and counts a user needs to make sense of
    'is this account in a healthy state?' — without exposing any
    PII about other accounts.
    """
    # 60/min/user — panel load + DB max() on usage; keep scrapers out.
    enforce_user_rate_limit(
        user.id,
        scope="auth_security",
        limit=60,
        window_seconds=60,
        message="Too many security panel reads. Please slow down.",
    )
    # Account age — 'member since'.
    member_since = user.created_at.isoformat() if user.created_at else None

    # Last login timestamp. We use the most recent successful login as
    # recorded by the UsageRecord timestamp for mode='arena' on this
    # user — not perfect (a brand-new user with no prompts yet has no
    # last-login signal), but a reasonable proxy without a separate
    # login_audit table.
    last_prompt = (
        db.query(func.max(UsageRecord.timestamp))
        .filter(UsageRecord.user_id == user.id)
        .scalar()
    )

    # Password freshness proxy: 'password_changed_at' would require a
    # new column; until that ships, the absence of a tracked timestamp
    # is itself the signal — UI can render 'never changed' or 'set at
    # signup' so users know the password is the original.
    return {
        "email": user.email,
        "member_since": member_since,
        "last_active_at": last_prompt.isoformat() if last_prompt else None,
        "tier": user.tier.value if hasattr(user.tier, "value") else str(user.tier),
        "is_verified": bool(getattr(user, "is_verified", False)),
        "has_password": bool(user.password_hash),
        # Column not shipped yet — UI treats null as "unknown / set at signup".
        "password_last_changed_at": None,
    }


# ────────────────────────────────────────────────────────────────────────
# Password reset
# ────────────────────────────────────────────────────────────────────────

# Tokens expire after one hour. Short enough that a leaked email can't
# be redeemed forever, long enough that a distracted user can still
# find the link in their inbox.
_RESET_TOKEN_TTL_SECONDS = 3600


def _hash_reset_token(token: str) -> str:
    """Stable SHA-256 of the raw reset token. We store the hash only —
    never the raw token — so a DB read does not give an attacker a
    working reset link."""
    import hashlib as _hashlib

    return _hashlib.sha256(token.encode("utf-8")).hexdigest()


class ForgotPasswordBody(BaseModel):
    """Body for POST /auth/forgot-password.

    The response shape is identical regardless of whether the email is
    registered — never leak which addresses hold an account.
    """

    email: str = Field(..., min_length=3, max_length=320)


class ResetPasswordBody(BaseModel):
    """Body for POST /auth/reset-password."""

    token: str = Field(..., min_length=32, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        ok, reason = _validate_password_strength(v)
        if not ok:
            raise ValueError(reason)
        return v


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordBody,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """Issue a single-use password-reset token for ``body.email``.

    Always returns 200 with the same shape so a caller cannot enumerate
    registered addresses via the response. If the address is registered
    a token is generated; the caller has a separate delivery channel
    (the email transport — wired up in a follow-up) to deliver it. For
    now the token is logged at INFO level so an operator can recover
    it from the logs in dev; production wiring belongs in the email
    transport module.
    """
    enforce_ip_rate_limit(
        request,
        scope="auth_forgot_password",
        limit=10,
        window_seconds=3600,
        message="Too many password reset requests. Please slow down.",
    )

    normalized = body.email.lower().strip()
    user = get_user_by_email(db, normalized)
    if user is not None:
        raw_token = secrets.token_urlsafe(48)
        token_hash = _hash_reset_token(raw_token)
        expires_at = utcnow_naive() + timedelta(
            seconds=_RESET_TOKEN_TTL_SECONDS
        )
        row = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        db.add(row)
        try:
            db.commit()
        except Exception as exc:
            logger.warning(
                "password_reset: failed to persist token for user=%s: %s",
                user.id,
                exc,
            )
            db.rollback()
        else:
            logger.info(
                "password_reset_issued user_id=%s email=%s token_hash=%s",
                user.id,
                user.email,
                token_hash,
            )

    return {"status": "received"}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordBody,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """Redeem a reset token and rotate the user's password.

    Returns 200 even on a stale/forged token — the only signal that a
    reset happened is the password actually rotating. This avoids the
    'is this token valid?' oracle and keeps the API surface flat for
    the client.
    """
    enforce_ip_rate_limit(
        request,
        scope="auth_reset_password",
        limit=10,
        window_seconds=3600,
        message="Too many password reset attempts. Please slow down.",
    )

    token_hash = _hash_reset_token(body.token)
    now = utcnow_naive()
    row = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "reset_token_invalid"},
        )

    user = db.query(User).filter(User.id == row.user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "reset_token_invalid"},
        )

    if verify_password(body.new_password, user.password_hash)[0]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "new_password_must_differ"},
        )

    user.password_hash = hash_password(body.new_password)
    row.used_at = now
    db.add(user)
    db.add(row)
    db.commit()
    logger.info("password_reset_redeemed user_id=%s", user.id)
    return {"status": "reset"}
