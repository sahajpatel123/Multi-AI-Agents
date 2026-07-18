"""JWT decode must require exp and reject empty / garbage tokens."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

from datetime import datetime, timezone

import jwt as pyjwt


def test_decode_token_rejects_empty():
    from arena.core.auth import decode_token

    assert decode_token("") is None
    assert decode_token("   ") is None
    assert decode_token(None) is None  # type: ignore[arg-type]


def test_decode_token_rejects_missing_exp():
    from arena.core import auth

    # Token without exp claim — must fail require_exp.
    raw = pyjwt.encode(
        {"sub": "1", "type": "access"},
        auth.SECRET_KEY,
        algorithm=auth.ALGORITHM,
    )
    assert auth.decode_token(raw) is None


def test_decode_token_accepts_valid_access():
    from arena.core.auth import create_access_token, decode_token

    token = create_access_token(42, "a@b.com")
    payload = decode_token(token)
    assert payload is not None
    assert payload.get("type") == "access"
    assert str(payload.get("sub")) == "42"
    assert "exp" in payload


def test_blacklist_ignores_empty_token(isolated_db):
    from arena.core.token_blacklist import token_blacklist
    from arena.db_models import RevokedToken

    SessionLocal = isolated_db
    s = SessionLocal()
    try:
        token_blacklist.add(
            "",
            expires_at=utcnow_naive(),
            db=s,
        )
        assert s.query(RevokedToken).count() == 0
        assert token_blacklist.is_blacklisted("", s) is False
    finally:
        s.close()
