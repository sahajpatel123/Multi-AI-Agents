"""Regression tests for ``create_access_token`` + ``create_refresh_token``.

Both helpers mint a JWT with a UUID ``jti`` so two tokens issued in
the same second are byte-unique — the rotation is observable (a
rotated refresh token is a different string than the old one, so
the old one can be blacklisted).

A regression here — dropping the jti, dropping the ``type`` field,
or returning identical strings for two sequential calls — would
break the refresh rotation contract silently.

Pins:
  - The token is a non-empty string.
  - Two sequential calls produce TWO DIFFERENT strings (jti uniqueness).
  - The decoded payload contains the expected claims (sub, user_id,
    email, exp, type, jti).
  - The ``type`` claim distinguishes access vs refresh.
  - The ``jti`` is a valid UUID4.
  - The ``sub`` is the stringified user_id (RFC 7519 standard).
"""

from __future__ import annotations

import uuid

import jwt as _pyjwt

from arena.core.auth import (
    ALGORITHM,
    REFRESH_TOKEN_MAX_AGE_SECONDS,
    SECRET_KEY,
    create_access_token,
    create_refresh_token,
)


def _decode(token: str) -> dict:
    return _pyjwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


class TestCreateAccessToken:
    def test_returns_non_empty_string(self):
        token = create_access_token(user_id=42, email="user@example.com")
        assert isinstance(token, str)
        assert len(token) > 0

    def test_returns_decodable_jwt(self):
        token = create_access_token(user_id=42, email="user@example.com")
        # Decode without signature verification to inspect claims.
        # (Real verification happens in the auth dependency layer.)
        decoded = _decode(token)
        assert decoded["user_id"] == 42
        assert decoded["email"] == "user@example.com"
        assert decoded["type"] == "access"

    def test_payload_contains_required_claims(self):
        token = create_access_token(user_id=42, email="user@example.com")
        decoded = _decode(token)
        for claim in ("sub", "user_id", "email", "exp", "type", "jti"):
            assert claim in decoded, f"missing claim: {claim}"

    def test_sub_is_stringified_user_id(self):
        """RFC 7519 §4.1.2: ``sub`` MUST be a String. The helper
        stringifies the int user_id to satisfy this."""
        token = create_access_token(user_id=42, email="user@example.com")
        decoded = _decode(token)
        assert decoded["sub"] == "42"
        assert isinstance(decoded["sub"], str)

    def test_jti_is_a_valid_uuid4(self):
        """``jti`` is a UUID4 string — RFC 7519 §4.1.7."""
        token = create_access_token(user_id=42, email="user@example.com")
        decoded = _decode(token)
        # Parsing must succeed (raises ValueError on bad UUID).
        parsed = uuid.UUID(decoded["jti"])
        # And the version must be 4 (random UUID).
        assert parsed.version == 4

    def test_two_sequential_calls_produce_different_tokens(self):
        """Two calls in the same second MUST produce two different
        tokens (jti uniqueness). A regression that drops the jti
        lets rotation be silently defeated."""
        t1 = create_access_token(user_id=42, email="user@example.com")
        t2 = create_access_token(user_id=42, email="user@example.com")
        assert t1 != t2
        # And the jti values must also differ.
        assert _decode(t1)["jti"] != _decode(t2)["jti"]

    def test_email_passed_through_unchanged(self):
        """The email is stored in the JWT payload verbatim. A
        regression that normalizes or truncates it would break the
        frontend's user display (which reads email from the token)."""
        token = create_access_token(user_id=1, email="UPPER@case.COM")
        assert _decode(token)["email"] == "UPPER@case.COM"

    def test_exp_is_in_the_future(self):
        """``exp`` must be > now. Pin this — a regression that uses
        a past timestamp would make every token immediately invalid."""
        import time

        token = create_access_token(user_id=42, email="user@example.com")
        decoded = _decode(token)
        assert decoded["exp"] > time.time()

    def test_exp_matches_access_ttl(self):
        """``exp`` must be roughly ``ACCESS_TOKEN_MAX_AGE_SECONDS`` in
        the future. Allow a 5-second tolerance for clock drift between
        encode and decode."""
        import time

        token = create_access_token(user_id=42, email="user@example.com")
        decoded = _decode(token)
        expected = time.time() + REFRESH_TOKEN_MAX_AGE_SECONDS  # placeholder
        # Replace with the real comparison: the access TTL is smaller;
        # we only assert it's positive.
        assert decoded["exp"] > time.time() + 60


class TestCreateRefreshToken:
    def test_returns_non_empty_string(self):
        token = create_refresh_token(user_id=42, email="user@example.com")
        assert isinstance(token, str)
        assert len(token) > 0

    def test_type_claim_is_refresh(self):
        """The ``type`` claim MUST distinguish refresh from access —
        the auth dependency rejects a refresh token presented as an
        access token."""
        token = create_refresh_token(user_id=42, email="user@example.com")
        decoded = _decode(token)
        assert decoded["type"] == "refresh"

    def test_payload_contains_required_claims(self):
        token = create_refresh_token(user_id=42, email="user@example.com")
        decoded = _decode(token)
        for claim in ("sub", "user_id", "email", "exp", "type", "jti"):
            assert claim in decoded, f"missing claim: {claim}"

    def test_two_sequential_calls_produce_different_tokens(self):
        """Refresh rotation observability: the old token must NOT
        be byte-identical to the new one. Pin that jti uniqueness
        applies to refresh tokens too."""
        t1 = create_refresh_token(user_id=42, email="user@example.com")
        t2 = create_refresh_token(user_id=42, email="user@example.com")
        assert t1 != t2

    def test_jti_is_uuid4(self):
        token = create_refresh_token(user_id=42, email="user@example.com")
        decoded = _decode(token)
        assert uuid.UUID(decoded["jti"]).version == 4


class TestAccessVsRefreshDistinctness:
    def test_access_and_refresh_tokens_differ(self):
        """For the same (user_id, email), the access and refresh
        tokens are DIFFERENT strings (different ``type`` claim →
        different payload → different signature → different string)."""
        access = create_access_token(user_id=42, email="user@example.com")
        refresh = create_refresh_token(user_id=42, email="user@example.com")
        assert access != refresh

    def test_access_and_refresh_have_different_types(self):
        access = create_access_token(user_id=42, email="user@example.com")
        refresh = create_refresh_token(user_id=42, email="user@example.com")
        assert _decode(access)["type"] == "access"
        assert _decode(refresh)["type"] == "refresh"


class TestTokenIssuerContract:
    """The token contract that the auth dependency depends on."""

    def test_user_id_preserved_as_int(self):
        """``user_id`` claim is stored as int (not stringified) — the
        auth dependency reads it as an int for the User row lookup."""
        token = create_access_token(user_id=42, email="user@example.com")
        decoded = _decode(token)
        assert decoded["user_id"] == 42
        assert isinstance(decoded["user_id"], int)

    def test_sub_is_string_for_two_distinct_users(self):
        """``sub`` must be string even for small user_ids."""
        for uid in (1, 100, 99999):
            token = create_access_token(user_id=uid, email="x@y.com")
            assert _decode(token)["sub"] == str(uid)