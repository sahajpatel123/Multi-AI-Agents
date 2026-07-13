"""Auth routes — /api/auth/* (Bearer tokens in JSON body, no cookies)."""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import Date, cast, func
from sqlalchemy.orm import Session

from arena.core.auth import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    create_user,
    decode_token,
    get_user_by_email,
    orm_user_to_response,
)
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
from arena.database import get_db
from arena.db_models import UsageRecord, User
from arena.models.schemas import LoginRequest, RegisterRequest, UserProfilePatch, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])
user_router = APIRouter(prefix="/api/user", tags=["auth"])
logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)

_COMMON_PASSWORDS = {
    "password",
    "12345678",
    "password1",
    "qwerty123",
    "letmein1",
    "welcome1",
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
    try:
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

            user = create_user(db, body.email, body.password, body.name)
            access = create_access_token(user.id, user.email)
            refresh = create_refresh_token(user.id, user.email)
            registration_limiter.check_and_record(request, success=True)
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
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Registration failed",
            )
    except Exception:
        logger.exception("Registration failed")
        raise


@router.post("/login")
async def login(
    body: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> JSONResponse:
    try:
        login_limiter.check_and_record(request, success=False)

        try:
            user = authenticate_user(db, body.email, body.password)
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password",
                )

            access = create_access_token(user.id, user.email)
            refresh = create_refresh_token(user.id, user.email)
            login_limiter.check_and_record(request, success=True)
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
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Login failed",
            )
    except Exception:
        logger.exception("Login failed")
        raise


@router.post("/logout")
async def logout() -> JSONResponse:
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
            detail="Invalid or expired refresh token",
        )

    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user_id = payload.get("sub") or str(payload.get("user_id", ""))
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

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
async def me(request: Request, db: Session = Depends(get_db)) -> UserResponse:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = auth_header[7:]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = payload.get("sub") or str(payload.get("user_id", ""))
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return orm_user_to_response(user, db)


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
    return orm_user_to_response(user, db)


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
