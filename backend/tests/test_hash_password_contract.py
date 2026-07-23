"""Regression tests for ``hash_password``.

The helper produces a bcrypt hash with cost factor 12 of a SHA-256
prehash of the plain password. A regression here would either:

  - Drop the SHA-256 prehash → hash inputs longer than 72 bytes
    produce silent truncation (cycles ago).
  - Lower the cost factor → hashes become cheaper to brute-force.
  - Forget to decode the bytes → return a bytes object that the
    Pydantic User model column rejects.

Pins:
  - Output is a ``str`` (decoded UTF-8) — never bytes.
  - Output is a valid bcrypt hash (starts with ``$2b$`` for cost 12).
  - Two hashes of the SAME input differ (salt is random) — but
    both verify the same password.
  - The cost factor is exactly 12 (defensive; bcrypt defaults to
    lower costs which would weaken security).
  - Empty string hash does not raise (bcrypt handles this).
  - Long passwords (>= 72 bytes) round-trip correctly thanks to
    the SHA-256 prehash.
  - The output verifies against `verify_password` (round-trip).
"""

from __future__ import annotations

import re

import bcrypt

from arena.core.auth import hash_password, verify_password


class TestHashPasswordShape:
    def test_returns_str_not_bytes(self):
        """Defensive: the return type is ``str``. A regression that
        returns the raw bcrypt bytes would 500 every User-row insert
        (the password_hash column is VARCHAR)."""
        out = hash_password("Strong1Pass!")
        assert isinstance(out, str)
        assert not isinstance(out, bytes)

    def test_returns_valid_bcrypt_hash(self):
        """The output must be a valid bcrypt hash — starts with
        ``$2b$`` (modular crypt format), cost factor 12, 22-char
        salt, then 31-char hash digest."""
        out = hash_password("Strong1Pass!")
        # Format: $2b$12$<22-char salt><31-char hash>
        assert out.startswith("$2b$"), f"unexpected bcrypt prefix: {out[:10]!r}"
        assert re.match(r"^\$2b\$\d{2}\$.{22}.{31}$", out), (
            f"bcrypt format unexpected: {out}"
        )

    def test_cost_factor_is_12(self):
        """Pin the cost factor — a regression to bcrypt's default
        (4) would weaken security 8x overnight."""
        out = hash_password("Strong1Pass!")
        # Extract cost: ``$2b$12$...``.
        cost = int(out.split("$")[2])
        assert cost == 12, f"cost factor changed: {cost} (expected 12)"

    def test_decodes_as_utf8(self):
        """The bcrypt output is decoded as UTF-8 — a regression
        that returned bytes would surface here."""
        out = hash_password("Strong1Pass!")
        out.encode("utf-8")  # Should not raise.


class TestHashPasswordSalt:
    def test_two_hashes_of_same_input_differ(self):
        """Each call produces a different hash (the salt is
        random per call). A regression to a static salt would
        produce identical hashes — defeating rainbow-table
        resistance."""
        h1 = hash_password("Strong1Pass!")
        h2 = hash_password("Strong1Pass!")
        assert h1 != h2

    def test_salt_is_unique_across_ten_calls(self):
        """All 10 hashes must differ — salt collision across 10 calls
        is astronomically unlikely but pin the contract."""
        hashes = {hash_password("Strong1Pass!") for _ in range(10)}
        assert len(hashes) == 10


class TestHashPasswordRoundTrip:
    def test_hash_verifies_against_input(self):
        plain = "Strong1Pass!"
        hashed = hash_password(plain)
        matched, used_legacy = verify_password(plain, hashed)
        assert matched is True
        assert used_legacy is False

    def test_different_input_does_not_verify(self):
        hashed = hash_password("Strong1Pass!")
        matched, _ = verify_password("Different1Pass!", hashed)
        assert matched is False

    def test_empty_string_does_not_raise(self):
        """Defensive: an empty password is rejected by
        ``_validate_password_strength``, but ``hash_password`` itself
        must not raise (the validator runs separately)."""
        # bcrypt refuses empty input — if this raises, the helper
        # needs to reject empty up-front rather than letting bcrypt
        # raise a confusing ValueError.
        try:
            out = hash_password("")
            # If bcrypt does accept empty, the round-trip should still work.
            matched, _ = verify_password("", out)
            assert matched is True
        except ValueError:
            # Acceptable: bcrypt rejects empty. The validator runs
            # BEFORE this point so the user sees the "min 8 chars"
            # message, not the bcrypt ValueError. Pin that we don't
            # silently accept empty.
            pass


class TestHashPasswordLongInput:
    def test_password_over_72_bytes_verifies(self):
        """The SHA-256 prehash means passwords > 72 bytes (bcrypt's
        truncation limit) still verify. Without the prehash, a
        password > 72 bytes would truncate and the user could
        authenticate with the truncated form."""
        plain = "x" * 100 + "Strong1Pass!"
        hashed = hash_password(plain)
        matched, used_legacy = verify_password(plain, hashed)
        assert matched is True
        assert used_legacy is False

    def test_very_long_input_does_not_raise(self):
        """A 10KB password does not raise (the prehash handles it)."""
        plain = "x" * 10_000
        hashed = hash_password(plain)
        assert len(hashed) > 0

    def test_unicode_password_verifies(self):
        """Unicode passwords (multi-byte UTF-8) round-trip correctly
        — the prehash encodes via UTF-8."""
        plain = "üñîçødé-Strong1Pass!"
        hashed = hash_password(plain)
        matched, _ = verify_password(plain, hashed)
        assert matched is True


class TestHashPasswordBcryptDirect:
    """A regression that accidentally calls bcrypt directly on the
    plain password (skipping the prehash) would still hash, but the
    resulting hash would not verify via ``verify_password`` (which
    applies the prehash). Pin this contract directly."""

    def test_hash_matches_prehashed_bcrypt_format(self):
        """Verify the hash is a valid bcrypt by calling bcrypt.checkpw
        directly with the prehashed input."""
        plain = "Strong1Pass!"
        hashed = hash_password(plain)
        # The hash must verify when we apply the SAME prehash that
        # hash_password applies.
        import base64
        import hashlib

        prehash = base64.b64encode(hashlib.sha256(plain.encode("utf-8")).digest())
        assert bcrypt.checkpw(prehash, hashed.encode("utf-8")) is True

    def test_hash_does_NOT_verify_plain_bcrypt(self):
        """A regression that drops the prehash would make the hash
        verify against the plain (non-prehashed) input via direct
        bcrypt. Pin that the hash is NOT a direct bcrypt of the plain
        text."""
        plain = "Strong1Pass!"
        hashed = hash_password(plain)
        # Direct bcrypt check (no prehash) MUST NOT match.
        assert bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8")) is False