"""get_current_user must fail closed (401) on malformed tokens, never 500."""

import pytest
from fastapi import HTTPException
from starlette.requests import Request


def _request_with_token(token: str) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"authorization", f"Bearer {token}".encode())],
        "query_string": b"",
    }
    return Request(scope)


@pytest.mark.asyncio
async def test_non_numeric_subject_yields_401_not_500():
    """A validly-signed token whose `sub` is non-numeric must raise 401, not let
    int() throw a ValueError that surfaces as a 500."""
    from jose import jwt

    from arena.config import get_settings
    from arena.core.auth import ALGORITHM
    from arena.core.dependencies import get_current_user

    settings = get_settings()
    token = jwt.encode(
        {"sub": "not-a-number", "type": "access"},
        settings.secret_key,
        algorithm=ALGORITHM,
    )

    with pytest.raises(HTTPException) as ei:
        # db is never reached — the guard rejects before any query.
        await get_current_user(_request_with_token(token), db=None)
    assert ei.value.status_code == 401


@pytest.mark.asyncio
async def test_missing_bearer_yields_401():
    from arena.core.dependencies import get_current_user

    scope = {"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b""}
    with pytest.raises(HTTPException) as ei:
        await get_current_user(Request(scope), db=None)
    assert ei.value.status_code == 401
