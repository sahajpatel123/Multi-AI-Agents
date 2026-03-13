"""Auth routes — /api/auth/*"""

from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from arena.core.auth import (
    ACCESS_COOKIE,
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    REFRESH_COOKIE,
    REFRESH_TOKEN_TYPE,
    authenticate_user,
    create_access_token,
    create_refresh_token,
    create_user,
    decode_token,
    get_current_user_required,
    get_user_by_email,
    get_user_by_id,
)
from arena.database import get_db
from arena.db_models import User
from arena.models.schemas import (
    LoginRequest,
    RegisterRequest,
    UserResponse,
    TokenResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_auth_cookies(response: Response, user: User) -> None:
    access_token = create_access_token(user.id, user.tier.value)
    refresh_token = create_refresh_token(user.id)

    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=60 * 60,
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=60 * 60 * 24 * 30,
        path="/api/auth/refresh",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth/refresh")


def _user_to_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        tier=user.tier.value,
        created_at=user.created_at,
        prompt_count_today=user.prompt_count_today,
    )


# ─────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> UserResponse:
    try:
        if get_user_by_email(db, body.email):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with that email already exists",
            )
        user = create_user(db, body.email, body.password)
        
        # Convert to response model before setting cookies to avoid DetachedInstanceError
        user_response = _user_to_response(user)
        _set_auth_cookies(response, user)
        
        return user_response
    except HTTPException:
        # Re-raise HTTPExceptions as-is (they're already JSON)
        raise
    except Exception as e:
        # Catch any other errors and return JSON
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}",
        )


@router.post("/login", response_model=UserResponse)
async def login(
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> UserResponse:
    try:
        user = authenticate_user(db, body.email, body.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        
        # Convert to response model before setting cookies to avoid DetachedInstanceError
        user_response = _user_to_response(user)
        _set_auth_cookies(response, user)
        
        return user_response
    except HTTPException:
        # Re-raise HTTPExceptions as-is (they're already JSON)
        raise
    except Exception as e:
        # Catch any other errors and return JSON
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {str(e)}",
        )


@router.post("/logout")
async def logout(response: Response) -> dict:
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
        
        # Convert to response model before setting cookies to avoid DetachedInstanceError
        user_response = _user_to_response(user)
        _set_auth_cookies(response, user)
        
        return user_response
    except HTTPException:
        # Re-raise HTTPExceptions as-is (they're already JSON)
        raise
    except Exception as e:
        # Catch any other errors and return JSON
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Token refresh failed: {str(e)}",
        )


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user_required)) -> UserResponse:
    return _user_to_response(user)
