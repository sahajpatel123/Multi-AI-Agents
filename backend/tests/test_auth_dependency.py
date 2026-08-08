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
    # Pin the {error, message} envelope shape so a regression to the legacy
    # `detail='string'` form fails this test (cycle-81 widening catches AST
    # patterns, but a behavior assertion pins the public contract).
    assert isinstance(ei.value.detail, dict)
    assert "error" in ei.value.detail
    assert "message" in ei.value.detail


@pytest.mark.asyncio
async def test_missing_bearer_yields_401(db_session):
    from arena.core.dependencies import get_current_user

    scope = {"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b""}
    with pytest.raises(HTTPException) as ei:
        # Blacklist runs before the missing-bearer branch in the new auth
        # pipeline, so it needs a real DB session.
        await get_current_user(Request(scope), db=db_session)
    assert ei.value.status_code == 401
    assert isinstance(ei.value.detail, dict)
    assert ei.value.detail["error"] == "invalid_token"


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
    assert isinstance(ei.value.detail, dict)
    assert ei.value.detail["error"] == "invalid_token"


# ── Complementary coverage using mocked dependencies ─────────────────
#
# The tests above exercise real DB + real JWT signing. These additional
# tests use mocks so we can pin more edge cases without standing up the
# full auth pipeline (decode_token, token_blacklist, orm_user_to_response).
# Both styles complement each other: real-fixture tests catch regressions
# in the wire format, mock tests catch regressions in the conditional
# branches (blacklist hit, refresh-type rejection, optional variants).


def _mock_request(authorization: object) -> Request:
    """Build a Request with a controllable Authorization header."""
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": (
            [(b"authorization", authorization.encode())] if isinstance(authorization, str) else []
        ),
        "query_string": b"",
    }
    return Request(scope)


class _StubSession:
    """Returns a configured user (or None) on the lookup chain."""

    def __init__(self, user):
        self._user = user

    def query(self, _model):
        return self

    def options(self, *_args, **_kwargs):
        return self

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self._user


def _user(user_id: int = 42):
    obj = type("User", (), {})()
    obj.id = user_id
    obj.email = f"u{user_id}@arena.com"
    return obj


@pytest.mark.asyncio
async def test_non_bearer_scheme_rejected(monkeypatch):
    """Auth header is present but not Bearer → must 401."""
    from arena.core import dependencies
    from arena.core.dependencies import get_current_user

    monkeypatch.setattr(dependencies.token_blacklist, "is_blacklisted", lambda *_a, **_k: False)
    req = _mock_request("Basic dXNlcjpwYXNz")
    with pytest.raises(HTTPException) as ei:
        await get_current_user(req, db=_StubSession(None))
    assert ei.value.status_code == 401
    assert ei.value.detail["error"] == "invalid_token"


@pytest.mark.asyncio
async def test_blacklisted_token_rejected(monkeypatch):
    """A revoked JWT must be rejected with token_revoked, before decode runs."""
    from arena.core import dependencies
    from arena.core.dependencies import get_current_user

    monkeypatch.setattr(
        dependencies.token_blacklist, "is_blacklisted", lambda *_a, **_k: True
    )
    req = _mock_request("Bearer revoked-token")
    with pytest.raises(HTTPException) as ei:
        await get_current_user(req, db=_StubSession(None))
    assert ei.value.status_code == 401
    assert ei.value.detail["error"] == "token_revoked"


@pytest.mark.asyncio
async def test_undecodable_token_rejected(monkeypatch):
    """decode_token returns None → 401 with token_expired (covers malformed/expired)."""
    from arena.core import dependencies
    from arena.core.dependencies import get_current_user

    monkeypatch.setattr(dependencies.token_blacklist, "is_blacklisted", lambda *_a, **_k: False)
    monkeypatch.setattr(dependencies, "decode_token", lambda _t: None)
    req = _mock_request("Bearer junk")
    with pytest.raises(HTTPException) as ei:
        await get_current_user(req, db=_StubSession(None))
    assert ei.value.status_code == 401
    assert ei.value.detail["error"] == "token_expired"


@pytest.mark.asyncio
async def test_refresh_token_type_rejected(monkeypatch):
    """A perfectly valid JWT of type=refresh must be rejected as invalid_token."""
    from arena.core import dependencies
    from arena.core.dependencies import get_current_user

    monkeypatch.setattr(dependencies.token_blacklist, "is_blacklisted", lambda *_a, **_k: False)
    monkeypatch.setattr(
        dependencies, "decode_token", lambda _t: {"sub": "1", "type": "refresh"}
    )
    req = _mock_request("Bearer valid-refresh")
    with pytest.raises(HTTPException) as ei:
        await get_current_user(req, db=_StubSession(None))
    assert ei.value.status_code == 401
    assert ei.value.detail["error"] == "invalid_token"


@pytest.mark.asyncio
async def test_missing_sub_claim_rejected(monkeypatch):
    """A token with type=access but no sub/user_id → 401 invalid_token."""
    from arena.core import dependencies
    from arena.core.dependencies import get_current_user

    monkeypatch.setattr(dependencies.token_blacklist, "is_blacklisted", lambda *_a, **_k: False)
    monkeypatch.setattr(dependencies, "decode_token", lambda _t: {"type": "access"})
    req = _mock_request("Bearer no-sub")
    with pytest.raises(HTTPException) as ei:
        await get_current_user(req, db=_StubSession(None))
    assert ei.value.status_code == 401
    assert ei.value.detail["error"] == "invalid_token"


@pytest.mark.asyncio
async def test_valid_token_returns_user(monkeypatch):
    """Happy path: valid access token + matching user returns the user."""
    from arena.core import dependencies
    from arena.core.dependencies import get_current_user

    monkeypatch.setattr(dependencies.token_blacklist, "is_blacklisted", lambda *_a, **_k: False)
    monkeypatch.setattr(
        dependencies, "decode_token", lambda _t: {"sub": "42", "type": "access"}
    )
    user = _user(user_id=42)
    req = _mock_request("Bearer good")
    result = await get_current_user(req, db=_StubSession(user))
    assert result is user


@pytest.mark.asyncio
async def test_valid_token_returns_user_with_int_sub(monkeypatch):
    """sub claim as int (PyJWT numeric sub) must also resolve correctly."""
    from arena.core import dependencies
    from arena.core.dependencies import get_current_user

    monkeypatch.setattr(dependencies.token_blacklist, "is_blacklisted", lambda *_a, **_k: False)
    monkeypatch.setattr(
        dependencies, "decode_token", lambda _t: {"sub": 7, "type": "access"}
    )
    user = _user(user_id=7)
    req = _mock_request("Bearer good-int")
    result = await get_current_user(req, db=_StubSession(user))
    assert result.id == 7


@pytest.mark.asyncio
async def test_optional_user_returns_none_on_missing_auth():
    """Optional variant must not raise — returns None for anonymous callers."""
    from arena.core.dependencies import get_optional_user

    result = await get_optional_user(_mock_request(None), db=_StubSession(None))
    assert result is None


@pytest.mark.asyncio
async def test_optional_user_returns_user_on_valid_auth(monkeypatch):
    """Optional variant returns the user when auth is valid."""
    from arena.core import dependencies
    from arena.core.dependencies import get_optional_user

    monkeypatch.setattr(dependencies.token_blacklist, "is_blacklisted", lambda *_a, **_k: False)
    monkeypatch.setattr(
        dependencies, "decode_token", lambda _t: {"sub": "9", "type": "access"}
    )
    user = _user(user_id=9)
    result = await get_optional_user(_mock_request("Bearer good"), db=_StubSession(user))
    assert result is user


@pytest.mark.asyncio
async def test_optional_user_returns_none_on_blacklisted_token(monkeypatch):
    """Optional variant converts auth failure to None (no exception leaked)."""
    from arena.core import dependencies
    from arena.core.dependencies import get_optional_user

    monkeypatch.setattr(dependencies.token_blacklist, "is_blacklisted", lambda *_a, **_k: True)
    result = await get_optional_user(_mock_request("Bearer revoked"), db=_StubSession(None))
    assert result is None


@pytest.mark.asyncio
async def test_required_aliases_raise_on_missing_auth():
    """The *_required / *_required_orm aliases must re-raise (not swallow)."""
    from arena.core.dependencies import (
        get_current_user_required,
        get_current_user_required_orm,
    )

    with pytest.raises(HTTPException):
        await get_current_user_required(_mock_request(None), db=_StubSession(None))
    with pytest.raises(HTTPException):
        await get_current_user_required_orm(_mock_request(None), db=_StubSession(None))


@pytest.mark.asyncio
async def test_userresponse_aliases_use_orm_user_to_response(monkeypatch):
    """The UserResponse-returning aliases must call orm_user_to_response."""
    from arena.core import dependencies
    from arena.core.dependencies import (
        get_current_user_optional,
        get_current_user_required,
    )

    monkeypatch.setattr(dependencies.token_blacklist, "is_blacklisted", lambda *_a, **_k: False)
    monkeypatch.setattr(
        dependencies, "decode_token", lambda _t: {"sub": "11", "type": "access"}
    )

    sentinel_response = type("UserResponse", (), {"id": 11})()
    monkeypatch.setattr(
        dependencies, "orm_user_to_response", lambda _u, _db: sentinel_response
    )

    optional = await get_current_user_optional(
        _mock_request("Bearer good"), db=_StubSession(_user(user_id=11))
    )
    required = await get_current_user_required(
        _mock_request("Bearer good"), db=_StubSession(_user(user_id=11))
    )
    assert optional is sentinel_response
    assert required is sentinel_response

