"""Auth routes — /api/auth/*"""

import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import Date, cast, func
from sqlalchemy.orm import Session

from arena.core.auth import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    ACCESS_TOKEN_MAX_AGE_SECONDS,
    REFRESH_TOKEN_MAX_AGE_SECONDS,
    authenticate_user,
    create_access_token,
    create_refresh_token,
    create_user,
    decode_token,
    clear_refresh_token,
    get_current_user_required_orm,
    get_user_by_email,
    get_user_by_id,
    hash_token,
    orm_user_to_response,
    verify_token_hash,
)
from arena.core.feedback_calibrator import get_answer_feedback_distribution
from arena.core.tier_config import (
    TIER_FEATURES,
    UserTier,
    get_credit_budget,
    get_daily_limit,
    get_tier_personas,
    normalize_tier,
    upgrade_target,
)
from arena.core.login_limiter import login_limiter, registration_limiter
from arena.core.input_validation import sanitize_html, sanitize_optional_text
from arena.database import get_db
from arena.db_models import UsageRecord, User
from arena.models.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserProfilePatch,
    UserResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
user_router = APIRouter(prefix="/api/user", tags=["auth"])
logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)

_COMMON_PASSWORDS = {
    "password", "12345678", "password1",
    "qwerty123", "letmein1", "welcome1",
}


# ─────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────

def _tier_value(user: User) -> str:
    raw = user.tier.value if hasattr(user.tier, "value") else str(user.tier)
    return normalize_tier(raw).value


def _token_payload(user: User) -> dict[str, object]:
    return {"sub": str(user.id), "user_id": user.id, "email": user.email}


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    is_prod = os.environ.get("ENVIRONMENT") == "production"
    samesite = "none" if is_prod else "lax"
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        max_age=ACCESS_TOKEN_MAX_AGE_SECONDS,
        httponly=True,
        secure=is_prod,
        samesite=samesite,
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        max_age=REFRESH_TOKEN_MAX_AGE_SECONDS,
        httponly=True,
        secure=is_prod,
        samesite=samesite,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    is_prod = os.environ.get("ENVIRONMENT") == "production"
    samesite = "none" if is_prod else "lax"
    response.delete_cookie(
        ACCESS_COOKIE,
        path="/",
        secure=is_prod,
        httponly=True,
        samesite=samesite,
    )
    response.delete_cookie(
        REFRESH_COOKIE,
        path="/",
        secure=is_prod,
        httponly=True,
        samesite=samesite,
    )


def _user_to_response(user: User, db: Session) -> UserResponse:
    return orm_user_to_response(user, db)


_EXPERTISE_LEVELS = {"none", "curious", "practitioner", "expert", "researcher"}


def _validate_password_strength(password: str) -> tuple[bool, str]:
    """Return (is_valid, error_message)."""
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    if not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter"
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number"
    if password.lower() in _COMMON_PASSWORDS:
        return False, "Password is too common. Please choose a stronger one"
    return True, ""


# ─────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> UserResponse:
    try:
        # Rate-limit registrations per IP (3/hour, 24h lockout)
        registration_limiter.check_and_record(request, success=False)

        try:
            is_valid, error_msg = _validate_password_strength(body.password)
            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": "weak_password", "message": error_msg},
                )

            if get_user_by_email(db, body.email):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with that email already exists",
                )

            user = create_user(db, body.email, body.password)
            access_token = create_access_token(_token_payload(user))
            refresh_token = create_refresh_token(_token_payload(user))
            user.refresh_token_hash = hash_token(refresh_token)
            user.refresh_token_expires_at = (
                datetime.now(timezone.utc) + timedelta(seconds=REFRESH_TOKEN_MAX_AGE_SECONDS)
            ).replace(tzinfo=None)
            db.add(user)
            db.commit()
            db.refresh(user)
            _set_auth_cookies(response, access_token, refresh_token)
            user_response = _user_to_response(user, db)

            # Registration succeeded — clear attempt record
            registration_limiter.check_and_record(request, success=True)
            return user_response

        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Registration failed",
            )
    except Exception as e:
        logger.exception("Registration failed: %s", type(e).__name__)
        raise


@router.post("/login", response_model=UserResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> UserResponse:
    try:
        # Rate-limit login attempts per IP (5/hour, 1h lockout)
        login_limiter.check_and_record(request, success=False)

        try:
            user = authenticate_user(db, body.email, body.password)
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password",
                )

            access_token = create_access_token(_token_payload(user))
            refresh_token = create_refresh_token(_token_payload(user))
            user.refresh_token_hash = hash_token(refresh_token)
            user.refresh_token_expires_at = (
                datetime.now(timezone.utc) + timedelta(seconds=REFRESH_TOKEN_MAX_AGE_SECONDS)
            ).replace(tzinfo=None)
            db.add(user)
            db.commit()
            db.refresh(user)
            _set_auth_cookies(response, access_token, refresh_token)
            user_response = _user_to_response(user, db)

            # Auth succeeded — clear failed-attempt record
            login_limiter.check_and_record(request, success=True)
            return user_response

        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Login failed",
            )
    except Exception as e:
        logger.exception("Login failed: %s", type(e).__name__)
        raise


@router.post("/logout")
async def logout(
    request: Request,
    db: Session = Depends(get_db),
    _arena_refresh: Optional[str] = Cookie(default=None, alias=REFRESH_COOKIE),
) -> JSONResponse:
    token = request.cookies.get(ACCESS_COOKIE) or request.cookies.get(REFRESH_COOKIE)
    if token:
        payload = decode_token(token)
        if payload:
            user_id = payload.get("sub") or payload.get("user_id")
            if user_id:
                user = db.query(User).filter(User.id == int(user_id)).first()
                if user:
                    clear_refresh_token(user)
                    db.add(user)
                    db.commit()

    response = JSONResponse({"success": True})
    _clear_auth_cookies(response)
    return response


@router.post("/refresh")
@limiter.limit("20/hour")
async def refresh(
    request: Request,
    db: Session = Depends(get_db),
    _arena_refresh: Optional[str] = Cookie(default=None, alias=REFRESH_COOKIE),
) -> JSONResponse:
    try:
        refresh_token = request.cookies.get(REFRESH_COOKIE)
        if not refresh_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No session found. Please sign in.",
            )

        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please sign in.",
            )

        user_id = payload.get("sub") or payload.get("user_id")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid session. Please sign in.",
            )

        user = db.query(User).filter(User.id == int(user_id)).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account not found. Please sign in.",
            )

        if user.refresh_token_hash and not verify_token_hash(refresh_token, user.refresh_token_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session invalidated. Please sign in again.",
            )

        new_access = create_access_token(_token_payload(user))
        new_refresh = create_refresh_token(_token_payload(user))
        user.refresh_token_hash = hash_token(new_refresh)
        user.refresh_token_expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=REFRESH_TOKEN_MAX_AGE_SECONDS)
        ).replace(tzinfo=None)
        db.add(user)
        db.commit()

        response = JSONResponse({"success": True})
        _set_auth_cookies(response, new_access, new_refresh)
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Refresh failed: %s", type(e).__name__)
        raise


@router.get("/me", response_model=UserResponse)
async def me(
    request: Request,
    db: Session = Depends(get_db),
) -> UserResponse:
    access_token = request.cookies.get(ACCESS_COOKIE)
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_token(access_token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    user_id = payload.get("sub") or payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return _user_to_response(user, db)


@user_router.patch("/profile", response_model=UserResponse)
async def patch_user_profile(
    body: UserProfilePatch,
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> UserResponse:
    if body.name is not None:
        user.name = sanitize_html(body.name, max_length=100, field_name="name")
    if body.expertise_level is not None:
        level = body.expertise_level.strip().lower()
        if level not in _EXPERTISE_LEVELS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid expertise_level",
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
    return _user_to_response(user, db)


@user_router.get("/answer-feedback-stats")
async def user_answer_feedback_stats(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> dict:
    return get_answer_feedback_distribution(user.id, db)


@user_router.get("/usage")
async def get_user_usage(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> dict:
    normalized = normalize_tier(user.tier.value if hasattr(user.tier, "value") else str(user.tier))
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
    normalized_tier = normalize_tier(user.tier.value if hasattr(user.tier, "value") else str(user.tier))
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
