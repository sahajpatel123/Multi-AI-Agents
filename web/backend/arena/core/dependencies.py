"""FastAPI auth dependencies — Bearer JWT only."""

from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from arena.core.auth import decode_token, orm_user_to_response
from arena.database import get_db
from arena.db_models import User
from arena.models.schemas import UserResponse


async def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = auth_header[7:]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired or invalid",
        )
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user_id = payload.get("sub") or str(payload.get("user_id", ""))
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    # The subject is expected to be a numeric user id. A non-numeric value (a
    # malformed, legacy, or forged token) must fail authentication cleanly (401)
    # rather than raising ValueError from int() and surfacing as a 500.
    try:
        uid = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.query(User).filter(User.id == uid).first()
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
