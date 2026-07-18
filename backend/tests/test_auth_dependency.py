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
async def test_non_numeric_subject_yields_401_not_500(db_session):
    """A validly-signed token whose `sub` is non-numeric must raise 401, not let
    int() throw a ValueError that surfaces as a 500."""
    import jwt as pyjwt
    from arena.config import get_settings
    from arena.core.auth import ALGORITHM
    from arena.core.dependencies import get_current_user

    settings = get_settings()
    token = pyjwt.encode(
        {"sub": "not-a-number", "type": "access"},
        settings.secret_key,
        algorithm=ALGORITHM,
    )

    with pytest.raises(HTTPException) as ei:
        # The blacklist lookup runs first (DB-backed as of iter-12 hardening);
        # it returns False for an unknown token, then the int(user_id) parse
        # raises 401. Pass a real session — passing None crashes the DB query.
        await get_current_user(_request_with_token(token), db=db_session)
    assert ei.value.status_code == 401


@pytest.mark.asyncio
async def test_missing_bearer_yields_401(db_session):
    from arena.core.dependencies import get_current_user

    scope = {"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b""}
    with pytest.raises(HTTPException) as ei:
        # Blacklist runs before the missing-bearer branch in the new auth
        # pipeline, so it needs a real DB session.
        await get_current_user(Request(scope), db=db_session)
    assert ei.value.status_code == 401


@pytest.mark.asyncio
async def test_empty_bearer_token_yields_401(db_session):
    """'Bearer ' with only whitespace must not proceed to decode/blacklist."""
    from arena.core.dependencies import get_current_user

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"authorization", b"Bearer    ")],
        "query_string": b"",
    }
    with pytest.raises(HTTPException) as ei:
        await get_current_user(Request(scope), db=db_session)
    assert ei.value.status_code == 401
