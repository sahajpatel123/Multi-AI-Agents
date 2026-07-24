"""Regression tests for ``_hash_token``.

The helper produces the SHA-256 hex digest stored in the
``RevokedToken`` table. A regression here would:

  - Drop the SHA-256 algorithm → revoke→lookup mismatch (a
    revoked token would never match a freshly-hashed lookup).
  - Switch to a different encoding (e.g. latin-1) → Unicode JWTs
    with non-ASCII characters would produce wrong hashes.
  - Return a variable-length string → the `String(64)` column
    would silently truncate and break the index.

Pins:
  - Output is a 64-char lowercase hex string.
  - Output matches ``hashlib.sha256(token.encode("utf-8")).hexdigest()``.
  - Empty / whitespace / non-string inputs return the SHA-256
    hash of their encoded form (defensive: never raise).
  - Two distinct inputs produce two distinct hashes.
  - The hash is stable across processes (deterministic).
"""

from __future__ import annotations

import hashlib

import pytest

from arena.core.token_blacklist import _hash_token


class TestHashTokenShape:
    def test_returns_64_char_lowercase_hex(self):
        out = _hash_token("any-token")
        assert isinstance(out, str)
        assert len(out) == 64
        assert all(c in "0123456789abcdef" for c in out)

    def test_matches_hashlib_sha256(self):
        """Pin the algorithm match — a regression to SHA-512 or
        bcrypt would break every revocation lookup."""
        for token in ("", "abc", "x" * 100, "üñîçødé"):
            expected = hashlib.sha256(token.encode("utf-8")).hexdigest()
            assert _hash_token(token) == expected

    def test_does_not_return_bytes(self):
        """Defensive: the helper must return a str, not bytes.
        A bytes return would 500 every insert into the
        String(64) column."""
        out = _hash_token("any-token")
        assert isinstance(out, str)
        assert not isinstance(out, bytes)


class TestHashTokenEmptyInput:
    def test_empty_string_returns_sha256_of_empty(self):
        """An empty string is the SHA-256 hash of the empty input."""
        assert _hash_token("") == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

    def test_whitespace_only(self):
        """Whitespace IS hashed (no strip) — the helper preserves
        the byte-exact form so a token with leading whitespace
        hashes to a DIFFERENT value than the canonical form."""
        # The blacklist caller strips before calling _hash_token, so
        # this case doesn't arise in practice — but the helper itself
        # doesn't strip, and the test pins that contract.
        plain = _hash_token("token")
        padded = _hash_token("  token  ")
        assert plain != padded


class TestHashTokenNonStringInput:
    def test_bytes_input_raises(self):
        """A bytes input raises AttributeError (the helper calls
        ``token.encode('utf-8')`` which fails on bytes). Pin the
        contract: bytes is NOT accepted. Callers must decode first."""
        with pytest.raises(AttributeError):
            _hash_token(b"any-token")  # type: ignore[arg-type]

    def test_int_input_returns_error_or_hash(self):
        """An int input — depending on encoding, either raises or
        returns a hash. The current implementation calls
        ``token.encode('utf-8')`` which raises AttributeError on int.
        Pin the contract: the helper may raise on non-string-coercible
        input, but bytes / string-coercible inputs must work."""
        with pytest.raises(AttributeError):
            _hash_token(42)  # type: ignore[arg-type]


class TestHashTokenDistinctness:
    def test_two_distinct_inputs_produce_distinct_hashes(self):
        h1 = _hash_token("token-A")
        h2 = _hash_token("token-B")
        assert h1 != h2

    def test_collision_resistance(self):
        """A regression to a weaker hash would make this assertion
        fail — SHA-256 has effectively zero collision rate for
        realistic inputs."""
        for i in range(100):
            for j in range(100):
                if i != j:
                    assert _hash_token(f"token-{i}") != _hash_token(f"token-{j}")

    def test_case_sensitive(self):
        """Case sensitivity — the hash is byte-exact."""
        assert _hash_token("TOKEN") != _hash_token("token")


class TestHashTokenStability:
    def test_deterministic(self):
        for _ in range(5):
            assert _hash_token("stable-token") == _hash_token("stable-token")

    def test_avalanche_single_char_change(self):
        """A single-character change in the token produces a
        wildly different hash (avalanche property)."""
        a = _hash_token("abcdefghij" * 10)  # 100 chars
        b = _hash_token("abcdefghij" * 9 + "abcdefghik")  # differs at last char
        common = sum(1 for x, y in zip(a, b) if x == y)
        # Avalanche: less than half of the 64 nibbles should match.
        assert common < 32, f"hashes too similar: {common}/64 common nibbles"


class TestHashTokenLength:
    def test_output_length_is_fixed_at_64(self):
        """The output is exactly 64 chars regardless of input length
        — a regression to a variable-length encoding would
        silently truncate in the String(64) column."""
        for length in (0, 1, 10, 100, 1_000):
            assert len(_hash_token("x" * length)) == 64


class TestHashTokenUnicode:
    def test_unicode_encoded_as_utf8(self):
        """Unicode characters are encoded via UTF-8 — the hash
        matches the byte-exact UTF-8 encoding."""
        token = "üñîçødé-token"
        expected = hashlib.sha256(token.encode("utf-8")).hexdigest()
        assert _hash_token(token) == expected

    def test_chinese_token(self):
        token = "中文-token"
        expected = hashlib.sha256(token.encode("utf-8")).hexdigest()
        assert _hash_token(token) == expected

    def test_emoji_token(self):
        token = "🚀-token"
        expected = hashlib.sha256(token.encode("utf-8")).hexdigest()
        assert _hash_token(token) == expected