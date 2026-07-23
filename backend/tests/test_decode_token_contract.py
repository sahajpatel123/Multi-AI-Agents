"""Regression tests for ``decode_token``.

The JWT decoder sits in front of every authenticated request. A
regression here would either:

  - Drop the empty/whitespace check → an unauthenticated caller
    gets a phantom decoded dict with no claims.
  - Drop the ``require_exp`` enforcement → a token without an
    ``exp`` claim is accepted forever (no expiration).
  - Accept a different algorithm → "algorithm confusion" attack
    (CVE-2015-9235 class).

Pins:
  - Empty / None / whitespace tokens return None (no exception).
  - Tokens without an ``exp`` claim are rejected.
  - Tokens with an expired ``exp`` are rejected.
  - Tokens signed with a different algorithm (``none``, ``HS512``)
    are rejected.
  - Tokens signed with the wrong key are rejected.
  - Garbage / truncated tokens return None.
"""

from __future__ import annotations

import time

import jwt as _pyjwt
import pytest

from arena.core.auth import (
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    decode_token,
)


class TestDecodeTokenEmptyInput:
    def test_empty_string_returns_none(self):
        assert decode_token("") is None

    def test_none_returns_none(self):
        assert decode_token(None) is None  # type: ignore[arg-type]

    def test_whitespace_only_returns_none(self):
        assert decode_token("   \n\t  ") is None

    def test_non_string_input_returns_none(self):
        """Defensive: a non-string input must not raise — callers
        may forward raw bytes or a number through a sloppy bridge."""
        assert decode_token(42) is None  # type: ignore[arg-type]
        assert decode_token(b"bytes-token") is None  # type: ignore[arg-type]


class TestDecodeTokenValidToken:
    def test_valid_token_decodes(self):
        token = create_access_token(user_id=42, email="user@example.com")
        decoded = decode_token(token)
        assert decoded is not None
        assert decoded["user_id"] == 42

    def test_valid_token_round_trips_claims(self):
        token = create_access_token(user_id=42, email="user@example.com")
        decoded = decode_token(token)
        for claim in ("sub", "user_id", "email", "exp", "type", "jti"):
            assert claim in decoded


class TestDecodeTokenMissingExp:
    def test_token_without_exp_claim_rejected(self):
        """A token missing the ``exp`` claim MUST be rejected — this
        is the no-expiration attack vector."""
        payload = {
            "sub": "42",
            "user_id": 42,
            "email": "user@example.com",
            "type": "access",
        }
        token = _pyjwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        assert decode_token(token) is None


class TestDecodeTokenExpired:
    def test_expired_token_rejected(self):
        """An expired token MUST be rejected. A regression that
        drops ``verify_exp`` would let any old token authenticate."""
        # Build a token that's already expired (1 second in the past).
        payload = {
            "sub": "42",
            "user_id": 42,
            "email": "user@example.com",
            "exp": int(time.time()) - 1,
            "type": "access",
        }
        token = _pyjwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        assert decode_token(token) is None

    def test_future_expired_token_accepted(self):
        """A token with exp in the future is accepted (sanity check
        — the verify_exp flag works in both directions)."""
        token = create_access_token(user_id=42, email="user@example.com")
        assert decode_token(token) is not None


class TestDecodeTokenAlgorithmSafety:
    def test_token_signed_with_none_algorithm_rejected(self):
        """Algorithm confusion attack: an attacker crafts a token
        with ``alg=none`` and no signature. The decoder MUST reject
        it because the algorithms allow-list is ``[HS256]``."""
        # PyJWT requires explicit unsafe flag for alg=none; build a
        # token manually.
        import base64
        import json

        header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
        payload = base64.urlsafe_b64encode(json.dumps({
            "sub": "42",
            "user_id": 42,
            "email": "attacker@evil.com",
            "exp": int(time.time()) + 3600,
            "type": "access",
        }).encode()).rstrip(b"=").decode()
        forged_token = f"{header}.{payload}."
        # The decoder MUST reject.
        assert decode_token(forged_token) is None

    def test_token_signed_with_hs512_rejected(self):
        """An HS512-signed token (algorithm confusion variant) MUST
        be rejected — only HS256 is in the allow-list."""
        payload = {
            "sub": "42",
            "user_id": 42,
            "email": "attacker@evil.com",
            "exp": int(time.time()) + 3600,
            "type": "access",
        }
        token = _pyjwt.encode(payload, SECRET_KEY, algorithm="HS512")
        assert decode_token(token) is None


class TestDecodeTokenWrongSecret:
    def test_token_signed_with_wrong_secret_rejected(self):
        """A token signed with a different SECRET_KEY MUST be
        rejected. This is the most basic signature-verification test
        — a regression that disables signature verification would
        let any token authenticate."""
        payload = {
            "sub": "42",
            "user_id": 42,
            "email": "user@example.com",
            "exp": int(time.time()) + 3600,
            "type": "access",
        }
        token = _pyjwt.encode(payload, "wrong-secret-key-32-chars-ok", algorithm=ALGORITHM)
        assert decode_token(token) is None


class TestDecodeTokenGarbage:
    def test_garbage_string_returns_none(self):
        assert decode_token("not-a-jwt-at-all") is None

    def test_truncated_token_returns_none(self):
        """A truncated token (header only, no payload, no signature)
        must return None."""
        assert decode_token("just.a.header") is None

    def test_random_3_part_string_returns_none(self):
        """A random 3-part dot-separated string is not a JWT."""
        assert decode_token("aaa.bbb.ccc") is None

    def test_modified_payload_rejected(self):
        """A valid token whose payload is modified post-signing MUST
        be rejected (signature no longer matches)."""
        token = create_access_token(user_id=42, email="user@example.com")
        # Tamper with the payload section (middle).
        parts = token.split(".")
        # Decode the payload, modify it, re-encode.
        import base64
        import json

        payload_bytes = base64.urlsafe_b64decode(parts[1] + "==")
        payload = json.loads(payload_bytes)
        payload["user_id"] = 999  # privilege escalation attempt
        tampered_payload = base64.urlsafe_b64encode(
            json.dumps(payload).encode()
        ).rstrip(b"=").decode()
        tampered = f"{parts[0]}.{tampered_payload}.{parts[2]}"
        assert decode_token(tampered) is None


class TestDecodeTokenDefensive:
    def test_does_not_raise_on_malformed_payload(self):
        """A token whose payload is not valid JSON must return None,
        not raise."""
        # Build a header + invalid payload + signature manually.
        import base64

        header = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').rstrip(b"=").decode()
        bad_payload = base64.urlsafe_b64encode(b"not valid json").rstrip(b"=").decode()
        sig = base64.urlsafe_b64encode(b"fake-signature").rstrip(b"=").decode()
        token = f"{header}.{bad_payload}.{sig}"
        # No exception → safe.
        result = decode_token(token)
        # The decoder may return None or raise internally — but the
        # contract is "must not propagate to the caller".
        assert result is None

    def test_does_not_raise_on_oversized_token(self):
        """A 100KB token returns None without exhausting memory."""
        huge = "a" * 100_000 + "." + "b" * 100_000 + "." + "c" * 100_000
        assert decode_token(huge) is None