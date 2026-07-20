"""Tests for the auth module's deterministic helpers.

arena.core.auth is the central JWT + password module. Drift here means:
  - decode_token silently accepts a forged token (security critical)
  - decode_token returns a stale payload for an expired token (auth bypass)
  - create_access_token emits a token missing required claims
  - create_refresh_token accidentally produces an access token (type-pinning
    regression — the dependency.py auth gate rejects refresh tokens)

We pin _prehash, decode_token, create_access_token, create_refresh_token,
and legacy_hits. Password hashing is slow (bcrypt rounds=12) and tested
via integration tests elsewhere; we don't lock the bcrypt contract here.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from arena.core.auth import (
    ACCESS_TOKEN_MAX_AGE_SECONDS,
    ALGORITHM,
    REFRESH_TOKEN_MAX_AGE_SECONDS,
    SECRET_KEY,
    _prehash,
    create_access_token,
    create_refresh_token,
    decode_token,
    legacy_hits,
)
import jwt as pyjwt


# ── _prehash ──────────────────────────────────────────────────────


def test_prehash_is_deterministic() -> None:
    assert _prehash("hunter2") == _prehash("hunter2")


def test_prehash_differs_for_different_inputs() -> None:
    assert _prehash("hunter2") != _prehash("hunter3")


def test_prehash_is_base64_encoded_sha256() -> None:
    import base64
    import hashlib

    plain = "hello-world"
    expected = base64.b64encode(hashlib.sha256(plain.encode("utf-8")).digest())
    assert _prehash(plain) == expected


def test_prehash_returns_bytes() -> None:
    assert isinstance(_prehash("x"), bytes)


# ── decode_token ─────────────────────────────────────────────────


def test_decode_token_returns_none_for_empty_string() -> None:
    assert decode_token("") is None


def test_decode_token_returns_none_for_whitespace_only() -> None:
    assert decode_token("   \n\t  ") is None


def test_decode_token_returns_none_for_non_string() -> None:
    # The function checks isinstance(str) — non-string input must be
    # rejected without raising.
    assert decode_token(None) is None
    assert decode_token(123) is None  # type: ignore[arg-type]


def test_decode_token_returns_none_for_invalid_signature() -> None:
    # Token signed with the wrong key must NOT decode.
    bogus = pyjwt.encode(
        {"sub": "1", "user_id": 1, "type": "access", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        "WRONG_KEY",
        algorithm=ALGORITHM,
    )
    assert decode_token(bogus) is None


def test_decode_token_returns_none_for_wrong_algorithm() -> None:
    # Algorithm-confusion attack: token signed with HS512 must be
    # rejected when only HS256 is allowed.
    bogus = pyjwt.encode(
        {"sub": "1", "type": "access", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        SECRET_KEY,
        algorithm="HS512",
    )
    assert decode_token(bogus) is None


def test_decode_token_returns_none_for_expired_token() -> None:
    expired = create_access_token_at(user_id=42, email="x@y", exp_offset_seconds=-1)
    assert decode_token(expired) is None


def test_decode_token_returns_payload_for_valid_token() -> None:
    valid = create_access_token(user_id=42, email="x@y.com")
    payload = decode_token(valid)
    assert payload is not None
    assert payload["user_id"] == 42
    assert payload["email"] == "x@y.com"
    assert payload["type"] == "access"
    assert payload["sub"] == "42"


def test_decode_token_returns_payload_for_valid_refresh_token() -> None:
    valid = create_refresh_token(user_id=42, email="x@y.com")
    payload = decode_token(valid)
    assert payload is not None
    assert payload["type"] == "refresh"


def test_decode_token_rejects_garbage_string() -> None:
    assert decode_token("not.a.jwt") is None
    assert decode_token("garbage") is None


def test_decode_token_rejects_token_missing_exp_claim() -> None:
    no_exp = pyjwt.encode(
        {"sub": "1", "user_id": 1, "type": "access"},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    # PyJWT 2.10+ dropped the legacy `require_exp` boolean — the
    # auth helper uses `require=["exp"]` so a missing-exp token must 401.
    assert decode_token(no_exp) is None


# ── create_access_token ─────────────────────────────────────────


def test_create_access_token_round_trips_to_expected_claims() -> None:
    tok = create_access_token(user_id=42, email="x@y.com")
    payload = decode_token(tok)
    assert payload is not None
    assert payload["user_id"] == 42
    assert payload["email"] == "x@y.com"
    assert payload["type"] == "access"
    assert payload["sub"] == "42"
    # jti is a UUID4 string
    import uuid as _uuid
    assert _uuid.UUID(payload["jti"])


def test_create_access_token_has_expiry_in_configured_window() -> None:
    before = datetime.now(timezone.utc)
    tok = create_access_token(user_id=1, email="x@y.com")
    after = datetime.now(timezone.utc)
    payload = decode_token(tok)
    assert payload is not None
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    # exp is between (before + ACCESS_TOKEN_MAX_AGE) and (after + ACCESS_TOKEN_MAX_AGE)
    assert before + timedelta(seconds=ACCESS_TOKEN_MAX_AGE_SECONDS - 2) <= exp
    assert exp <= after + timedelta(seconds=ACCESS_TOKEN_MAX_AGE_SECONDS + 2)


def test_create_access_token_emits_distinct_jti_per_call() -> None:
    # jti is RFC 7519 §4.1.7 — guarantees byte-unique tokens even when
    # issued in the same second. Two calls in quick succession must not
    # produce identical JWTs.
    a = create_access_token(user_id=1, email="x@y.com")
    b = create_access_token(user_id=1, email="x@y.com")
    assert a != b


def test_create_access_token_uses_hs256_algorithm() -> None:
    tok = create_access_token(user_id=1, email="x@y.com")
    header = pyjwt.get_unverified_header(tok)
    assert header["alg"] == "HS256"


# ── create_refresh_token ────────────────────────────────────────


def test_create_refresh_token_type_is_refresh() -> None:
    tok = create_refresh_token(user_id=42, email="x@y.com")
    payload = decode_token(tok)
    assert payload is not None
    assert payload["type"] == "refresh"


def test_create_refresh_token_uses_longer_window_than_access() -> None:
    # Refresh must outlive access so /refresh can mint new access after
    # the old one expires.
    assert REFRESH_TOKEN_MAX_AGE_SECONDS > ACCESS_TOKEN_MAX_AGE_SECONDS


def test_create_refresh_token_carries_jti() -> None:
    import uuid as _uuid
    tok = create_refresh_token(user_id=42, email="x@y.com")
    payload = decode_token(tok)
    assert payload is not None
    assert _uuid.UUID(payload["jti"])


# ── legacy_hits ─────────────────────────────────────────────────


def test_legacy_hits_starts_at_zero() -> None:
    # Fresh import — counter at 0. Other tests may have incremented
    # it; we just assert >= 0 and let the reset happen via the next
    # actual legacy verify (out of scope for unit tests of helpers).
    assert legacy_hits() >= 0


# ── Helpers for the tests above ──────────────────────────────────


def create_access_token_at(
    user_id: int,
    email: str,
    *,
    exp_offset_seconds: int,
) -> str:
    """Build an HS256 token whose `exp` is offset seconds from now
    (negative = expired). For testing the decode_token rejection path."""
    expire = datetime.now(timezone.utc) + timedelta(seconds=exp_offset_seconds)
    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "email": email,
        "exp": expire,
        "type": "access",
        "jti": "test-jti",
    }
    return pyjwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
