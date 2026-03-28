"""Auth routes — /api/auth/*"""

import traceback
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import Date, cast, func
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.core.auth import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    REFRESH_TOKEN_TYPE,
    auth_cookie_samesite_and_secure,
    authenticate_user,
    create_access_token,
    create_refresh_token,
    create_user,
    decode_token,
    get_current_user_required,
    get_current_user_required_orm,
    get_user_by_email,
    get_user_by_id,
    orm_user_to_response,
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
from arena.core.token_blacklist import token_blacklist
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


def _set_auth_cookies(response: Response, user: User) -> None:
    access_token = create_access_token(user.id, _tier_value(user))
    refresh_token = create_refresh_token(user.id)
    samesite, secure = auth_cookie_samesite_and_secure()
    settings = get_settings()
    access_max_age = 60 * int(settings.access_token_expire_minutes)

    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=access_max_age,
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=60 * 60 * 24 * int(settings.refresh_token_expire_days),
        path="/api/auth/refresh",
    )


def _clear_auth_cookies(response: Response) -> None:
    """Clear cookies with the same flags used when setting (required for cross-site cookies)."""
    samesite, secure = auth_cookie_samesite_and_secure()
    response.delete_cookie(
        ACCESS_COOKIE,
        path="/",
        secure=secure,
        httponly=True,
        samesite=samesite,
    )
    response.delete_cookie(
        REFRESH_COOKIE,
        path="/api/auth/refresh",
        secure=secure,
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
            user_response = _user_to_response(user, db)
            _set_auth_cookies(response, user)

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
        traceback.print_exc()
        print(f"REGISTER ERROR: {type(e).__name__}: {e}", flush=True)
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

            user_response = _user_to_response(user, db)
            _set_auth_cookies(response, user)

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
        traceback.print_exc()
        print(f"LOGIN ERROR: {type(e).__name__}: {e}", flush=True)
        raise


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
) -> dict:
    # Blacklist the current access token so it can't be reused
    access_token = request.cookies.get(ACCESS_COOKIE)
    if access_token:
        token_blacklist.add(access_token)

    _clear_auth_cookies(response)
    return {"message": "Logged out"}


@router.post("/refresh", response_model=UserResponse)
async def refresh(
    response: Response,
    db: Session = Depends(get_db),
    arena_refresh: Optional[str] = Cookie(default=None),
) -> UserResponse:
    try:
        try:
            if not arena_refresh:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="No refresh token",
                )
            payload = decode_token(arena_refresh)
            if not payload or payload.get("type") != REFRESH_TOKEN_TYPE:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired refresh token",
                )
            user = get_user_by_id(db, int(payload["sub"]))
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found",
                )

            user_response = _user_to_response(user, db)
            _set_auth_cookies(response, user)
            return user_response

        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Token refresh failed",
            )
    except Exception as e:
        traceback.print_exc()
        print(f"REFRESH ERROR: {type(e).__name__}: {e}", flush=True)
        raise


@router.get("/me", response_model=UserResponse)
async def me(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> UserResponse:
    return _user_to_response(user, db)


@user_router.patch("/profile", response_model=UserResponse)
async def patch_user_profile(
    body: UserProfilePatch,
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> UserResponse:
    if body.name is not None:
        user.name = body.name.strip()[:255]
    if body.expertise_level is not None:
        level = body.expertise_level.strip().lower()
        if level not in _EXPERTISE_LEVELS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid expertise_level",
            )
        user.expertise_level = level
    if body.expertise_domain is not None:
        user.expertise_domain = body.expertise_domain.strip()[:512]

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
    elif normalized_tier == UserTier.PLUS and getattr(user, "agent_addon_active", False):
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
