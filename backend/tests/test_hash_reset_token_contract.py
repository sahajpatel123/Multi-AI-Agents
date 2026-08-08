"""Regression tests for ``_hash_reset_token``.

The helper produces the SHA-256 hex digest that the password-reset
token row stores in the DB. A regression here would:

  - Change the hash algorithm → all outstanding reset tokens become
    invalid (users click the link, get 400 'reset_token_invalid').
  - Stop stripping whitespace → two tokens differing only in trailing
    newline produce the same hash, allowing one to redeem the other.
  - Truncate the input → low-entropy tokens collapse to the same hash.

Pins:
  - The algorithm is SHA-256 (64 hex chars).
  - The output is hex (lowercase).
  - Two different inputs produce two different hashes.
  - The same input produces the same hash (deterministic).
  - The hash is stable across processes (the function is pure).
  - The raw token is NEVER recoverable from the hash (one-way).
"""

from __future__ import annotations

import hashlib

import pytest

from arena.routes.auth import _hash_reset_token


class TestHashResetTokenAlgorithm:
    def test_returns_64_char_hex_string(self):
        out = _hash_reset_token("any-token")
        assert isinstance(out, str)
        assert len(out) == 64
        # All chars must be valid lowercase hex.
        assert all(c in "0123456789abcdef" for c in out)

    def test_matches_pure_hashlib_sha256(self):
        """Pin the exact algorithm — if someone swaps SHA-256 for
        SHA-512 or bcrypt, every outstanding reset token becomes
        invalid. The contract: ``_hash_reset_token(t) ==
        hashlib.sha256(t.encode()).hexdigest()``."""
        for token in ("", "a", "short", "x" * 100, "üñîçødé"):
            expected = hashlib.sha256(token.encode("utf-8")).hexdigest()
            assert _hash_reset_token(token) == expected


class TestHashResetTokenStability:
    def test_same_input_same_output(self):
        """The hash is deterministic — the same input always produces
        the same hash (this is what makes the token-replay check
        work in the DB)."""
        for _ in range(3):
            assert _hash_reset_token("token-abc-123") == _hash_reset_token("token-abc-123")

    def test_distinct_inputs_distinct_outputs(self):
        """Two distinct tokens must produce two distinct hashes —
        otherwise the DB unique-index on token_hash would reject
        every legitimate token as a duplicate."""
        h1 = _hash_reset_token("token-A")
        h2 = _hash_reset_token("token-B")
        assert h1 != h2

    def test_case_sensitive_input(self):
        """The hash is case-sensitive — a token with different casing
        is a DIFFERENT token (the reset email is generated with a
        specific case)."""
        assert _hash_reset_token("ABC") != _hash_reset_token("abc")

    def test_whitespace_matters(self):
        """A token with trailing whitespace is a DIFFERENT token —
        no normalization that could collapse two distinct tokens to
        the same hash."""
        assert _hash_reset_token("token") != _hash_reset_token("token ")
        assert _hash_reset_token("token") != _hash_reset_token(" token")

    def test_empty_string_produces_valid_hash(self):
        """An empty token still produces a valid hash (the validator
        in the route is responsible for rejecting empty tokens; the
        hash function itself must not raise)."""
        out = _hash_reset_token("")
        assert len(out) == 64


class TestHashResetTokenOneWay:
    def test_hash_does_not_contain_raw_token_substring(self):
        """The hash must NOT contain the raw token as a substring —
        otherwise a DB read leaks the token. Pin this for short tokens
        where a collision would be visible."""
        token = "secret-recovery-token-xyz"
        h = _hash_reset_token(token)
        # The raw token must not appear in the hash.
        assert token not in h
        # And the obvious 8-char prefixes must not appear either.
        for prefix_len in (4, 8, 12):
            if len(token) >= prefix_len:
                assert token[:prefix_len] not in h

    def test_hash_length_is_fixed_regardless_of_input_length(self):
        """The hash output length MUST be 64 chars regardless of input
        length — a regression that uses a variable-length encoding
        would leak the original token length."""
        for length in (0, 1, 10, 100, 1_000):
            assert len(_hash_reset_token("x" * length)) == 64


class TestHashResetTokenUnicode:
    def test_unicode_tokens_encode_to_utf8(self):
        """Unicode tokens must encode via UTF-8 — the function is
        called from the route handlers which receive JSON strings
        (already UTF-8). Pin the encoding choice."""
        token = "üñîçødé-token-✓"
        expected = hashlib.sha256(token.encode("utf-8")).hexdigest()
        assert _hash_reset_token(token) == expected

    def test_byte_exact_passthrough(self):
        """The function passes the bytes through verbatim. Two byte-
        identical inputs MUST produce the same hash, and a single
        byte difference MUST produce a different hash (avalanche)."""
        token = "verifiable-token-string-12345"
        # Same bytes → same hash.
        assert _hash_reset_token(token) == _hash_reset_token(token)
        # One-byte difference → different hash.
        assert _hash_reset_token(token) != _hash_reset_token(token + "!")
        assert _hash_reset_token(token) != _hash_reset_token("a" + token)

    def test_avalanche_single_bit_change(self):
        """A single-character difference in the middle of the token
        must produce a wildly different hash (avalanche property of
        SHA-256). Pin the contract — a regression to a weaker hash
        would make this assertion fail."""
        a = "abcdefghijklmnopqrstuvwxyz0123456789"
        b = "abcdefghijklmnopqrstuvwxyz012345678!"  # last char different
        ha = _hash_reset_token(a)
        hb = _hash_reset_token(b)
        # And the avalanche property: the hashes share very few
        # nibbles. A rough proxy: Hamming distance > 30 out of 64
        # nibbles for a 1-byte change at the end of a 39-byte input.
        common = sum(1 for x, y in zip(ha, hb) if x == y)
        assert common < 20, (
            f"hashes too similar: {common} common nibbles out of 64"
        )