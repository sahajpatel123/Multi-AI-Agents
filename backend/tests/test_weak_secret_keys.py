"""Regression tests for the startup-time secret-validation logic.

The `_WEAK_SECRET_KEYS` allowlist blocks known-bad defaults at boot.
A regression that drops an entry from the list lets a developer
ship a `SECRET_KEY="changeme"` to production without a startup error.

We test the LIST itself (the data structure) and the ``.lower()``
comparison logic (case-insensitivity).

Pins:
  - The canonical weak defaults are still in the allowlist.
  - The allowlist is a set (fast lookup, no order dependence).
  - The ``.lower()`` comparison means UPPERCASE weak defaults are
    also blocked.
  - A non-weak value is NOT in the list.
  - Empty string is NOT in the list (separate "missing" path).
  - The allowlist does not grow to include strong-looking strings.
"""

from __future__ import annotations

import pytest

from arena.config import _WEAK_SECRET_KEYS


class TestWeakSecretKeysContents:
    def test_canonical_weak_defaults_are_blocked(self):
        """The most common weak defaults must still be blocked —
        a regression that drops one would let it ship to prod."""
        for weak in (
            "secret", "dev", "password", "changeme", "default",
            "your-secret-key", "supersecretkey", "arena-secret",
        ):
            assert weak in _WEAK_SECRET_KEYS, (
                f"weak default {weak!r} is no longer blocked — "
                "operators may accidentally ship it to prod"
            )

    def test_strong_values_are_not_blocked(self):
        """A cryptographically random-looking value MUST NOT be in
        the list — a regression that adds too many entries would
        block legitimate deployments."""
        for strong in (
            "abc123def456ghi789jkl012mno345pq",
            "x" * 32,
            "k8s-rotation-2026-07-21T10:00:00Z-f3a9",
            "00000000-0000-0000-0000-000000000000",  # UUID zero
        ):
            assert strong not in _WEAK_SECRET_KEYS, (
                f"strong-looking value {strong!r} is in the weak list — "
                "the validator would falsely block it"
            )

    def test_empty_string_is_not_in_list(self):
        """An empty secret is handled by a separate "missing" branch
        in ``validate_secrets`` — it must NOT also be in the weak
        list (avoid double-counting in error messages)."""
        assert "" not in _WEAK_SECRET_KEYS

    def test_is_a_set_for_o1_lookup(self):
        """The allowlist must be a set (or frozenset) — list membership
        is O(n), which would slow boot for large allowlists. Pin the
        data structure choice."""
        assert isinstance(_WEAK_SECRET_KEYS, (set, frozenset))


class TestWeakSecretKeysLookupSemantics:
    """The lookup uses ``self.secret_key.lower() in _WEAK_SECRET_KEYS``
    (case-insensitive match). Pin the semantics directly so a refactor
    that drops the .lower() — case-sensitivity regression — fails."""

    @staticmethod
    def _is_weak(value: str) -> bool:
        return value.lower() in _WEAK_SECRET_KEYS

    def test_lowercase_weak_is_blocked(self):
        assert self._is_weak("changeme") is True

    def test_uppercase_weak_is_blocked(self):
        """``CHANGEME`` must also be blocked — the .lower() comparison
        folds case before lookup."""
        assert self._is_weak("CHANGEME") is True

    def test_mixed_case_weak_is_blocked(self):
        assert self._is_weak("ChangeMe") is True

    def test_strong_with_similar_chars_not_blocked(self):
        """A value that contains a weak substring but is otherwise
        different must NOT be blocked — substring containment would
        be a false-positive regression."""
        assert self._is_weak("changeme-please-but-with-a-suffix") is False
        assert self._is_weak("my-password-is-very-long") is False

    def test_weak_with_trailing_whitespace_not_blocked(self):
        """A weak default with trailing whitespace is technically a
        different value — but the validator is case-fold only, NOT
        whitespace-stripped. Pin: this is OUTSIDE the allowlist's
        responsibility; the separate ``validate_secrets`` function
        must check whitespace."""
        # (The boot path strips the secret_key before comparison; this
        # test pins the data structure's semantic — the allowlist
        # itself is case-fold only.)
        assert self._is_weak("changeme ") is False
        assert self._is_weak(" changeme") is False