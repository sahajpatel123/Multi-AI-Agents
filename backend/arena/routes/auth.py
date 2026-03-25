"""Auth routes — /api/auth/*"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, text
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
from arena.core.tier_config import (
    TIER_FEATURES,
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


def _user_to_response(user: User) -> UserResponse:
    return orm_user_to_response(user)


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _day_start_utc(d: datetime) -> datetime:
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


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
        user_response = _user_to_response(user)
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


@router.post("/login", response_model=UserResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> UserResponse:
    # Rate-limit login attempts per IP (5/hour, 1h lockout)
    login_limiter.check_and_record(request, success=False)

    try:
        user = authenticate_user(db, body.email, body.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        user_response = _user_to_response(user)
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

        user_response = _user_to_response(user)
        _set_auth_cookies(response, user)
        return user_response

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed",
        )


@router.get("/me", response_model=UserResponse)
async def me(
    user: User = Depends(get_current_user_required_orm),
) -> UserResponse:
    return _user_to_response(user)


@user_router.patch("/profile", response_model=UserResponse)
async def patch_user_profile(
    body: UserProfilePatch,
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> UserResponse:
    if body.name is not None:
        user.name = body.name.strip()[:255]
        db.add(user)
        db.commit()
        db.refresh(user)

    level_normalized: str | None = None
    domain_stripped: str | None = None
    if body.expertise_level is not None:
        level_normalized = body.expertise_level.strip().lower()
        if level_normalized not in _EXPERTISE_LEVELS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid expertise_level",
            )
    if body.expertise_domain is not None:
        domain_stripped = body.expertise_domain.strip()[:512]

    expertise_sql_ok = False
    if level_normalized is not None or domain_stripped is not None:
        sets: list[str] = []
        bind: dict = {"user_id": user.id}
        if level_normalized is not None:
            sets.append("expertise_level = :level")
            bind["level"] = level_normalized
        if domain_stripped is not None:
            sets.append("expertise_domain = :domain")
            bind["domain"] = domain_stripped
        try:
            db.execute(
                text(f"UPDATE users SET {', '.join(sets)} WHERE id = :user_id"),
                bind,
            )
            db.commit()
            expertise_sql_ok = True
        except Exception as e:
            db.rollback()
            print(f"Expertise update skipped (columns pending): {e}")

    resp = _user_to_response(user)
    if expertise_sql_ok:
        patch: dict[str, str] = {}
        if level_normalized is not None:
            patch["expertise_level"] = level_normalized
        if domain_stripped is not None:
            patch["expertise_domain"] = domain_stripped
        if patch:
            resp = resp.model_copy(update=patch)
    return resp


@user_router.get("/usage")
async def get_user_usage(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> dict:
    normalized = normalize_tier(user.tier.value if hasattr(user.tier, "value") else str(user.tier))
    daily_limit = get_credit_budget(normalized)
    weekly_limit = daily_limit * 7

    now = _utc_now_naive()
    today_start = _day_start_utc(now)
    week_start = now - timedelta(days=7)
    month_start = now - timedelta(days=30)

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

    usage_history: list[int] = []
    for i in range(13, -1, -1):
        day = now - timedelta(days=i)
        d0 = _day_start_utc(day)
        d1 = d0 + timedelta(days=1)
        day_total = int(
            db.query(func.coalesce(func.sum(token_sum), 0))
            .filter(
                UsageRecord.user_id == user.id,
                UsageRecord.timestamp >= d0,
                UsageRecord.timestamp < d1,
            )
            .scalar()
            or 0,
        )
        usage_history.append(day_total)

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
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    normalized_tier = normalize_tier(user.tier.value if hasattr(user.tier, "value") else str(user.tier))
    daily_limit = get_daily_limit(normalized_tier)
    messages_used_today = min(int(user.prompt_count_today or 0), daily_limit)
    features = TIER_FEATURES[normalized_tier]

    return {
        "tier": normalized_tier.value,
        "daily_limit": daily_limit,
        "messages_used_today": messages_used_today,
        "messages_remaining": max(daily_limit - messages_used_today, 0),
        "allowed_personas": sorted(get_tier_personas(normalized_tier)),
        "features": {
            "debate": features["debate"],
            "discuss": features["discuss"],
            "memory": features["memory"],
            "saved_responses": features["saved_responses"],
            "agent_mode": features["agent_mode"],
            "scoring_audit": features["scoring_audit"],
        },
        "upgrade_to": upgrade_target(normalized_tier),
    }
