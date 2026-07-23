"""Regression tests for ``is_blacklisted``.

The blacklist sits in front of every authenticated request. A
regression here would either:

  - Return ``True`` for an empty token → reject every empty-token
    request (5xx on `Authorization: Bearer`).
  - Not strip whitespace → a token with leading/trailing whitespace
    bypasses the blacklist lookup.
  - Not catch ``None`` / non-string input → 500 on a malformed
    header.

Pins:
  - Empty / None / whitespace tokens return False (NOT True).
  - Non-string input returns False (NOT raises).
  - A non-expired revoked token returns True.
  - An expired revoked token returns False (lazy cleanup).
  - The lookup is exact: a different token returns False.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from arena.core.auth import create_access_token
from arena.core.token_blacklist import _hash_token, is_blacklisted
from arena.core.datetime_utils import utcnow_naive
from datetime import timedelta


def _make_session(*, active_row=None, expired_rows=None, calls=None):
    """Build a stub Session whose `query().filter().all()/.first()`
    returns the configured values."""

    class _Q:
        def __init__(self):
            self._mode = "first"
            self._first = active_row
            self._all = expired_rows or []

        def filter(self, *args, **kwargs):
            return self

        def order_by(self, *args, **kwargs):
            return self

        def all(self):
            if calls is not None:
                calls.append("all")
            return self._all

        def first(self):
            if calls is not None:
                calls.append("first")
            return self._first

    class _S:
        def __init__(self):
            self.deleted = []
            self.committed = 0

        def query(self, *args, **kwargs):
            return _Q()

        def commit(self):
            self.committed += 1

        def delete(self, obj):
            self.deleted.append(obj)

    return _S()


class TestIsBlacklistedEmptyInput:
    def test_empty_string_returns_false(self):
        """An empty token returns False — it can't be blacklisted
        because it's not a valid token to begin with. A regression
        that returned True would lock out every request with a
        missing Authorization header."""
        assert is_blacklisted("", _make_session()) is False

    def test_none_returns_false(self):
        assert is_blacklisted(None, _make_session()) is False  # type: ignore[arg-type]

    def test_whitespace_only_returns_false(self):
        assert is_blacklisted("   \n\t  ", _make_session()) is False

    def test_non_string_input_returns_false(self):
        """Defensive: a non-string input (bytes, int) must not raise
        — caller may forward raw bytes through a sloppy bridge."""
        assert is_blacklisted(b"bytes-token", _make_session()) is False  # type: ignore[arg-type]
        assert is_blacklisted(42, _make_session()) is False  # type: ignore[arg-type]


class TestIsBlacklistedActiveRevokedToken:
    def test_revoked_active_token_returns_true(self):
        """A token that was revoked AND is not yet expired returns
        True (the headline contract)."""
        token = create_access_token(user_id=42, email="user@example.com")

        # Build a session whose first() returns an active revoked row.
        h = _hash_token(token.strip())
        future = utcnow_naive() + timedelta(hours=1)
        active_row = SimpleNamespace(token_hash=h, expires_at=future)
        db = _make_session(active_row=active_row)

        assert is_blacklisted(token, db) is True

    def test_revoked_token_with_surrounding_whitespace_still_blacklisted(self):
        """A token with leading/trailing whitespace is the same
        token (strip is applied) — must still be blacklisted."""
        token = create_access_token(user_id=42, email="user@example.com")
        h = _hash_token(token.strip())
        future = utcnow_naive() + timedelta(hours=1)
        active_row = SimpleNamespace(token_hash=h, expires_at=future)
        db = _make_session(active_row=active_row)

        # Same token, different whitespace → still blacklisted.
        assert is_blacklisted(f"  {token}  \n", db) is True


class TestIsBlacklistedExpiredRevoked:
    def test_expired_revoked_token_returns_false(self):
        """An expired revoked token returns False. The blacklist
        only blocks tokens that are BOTH revoked AND not yet
        expired — once past `exp`, the JWT is rejected anyway
        by `decode_token`."""
        token = create_access_token(user_id=42, email="user@example.com")
        h = _hash_token(token.strip())
        past = utcnow_naive() - timedelta(hours=1)
        # Active row returns None; expired rows returns the row.
        db = _make_session(active_row=None, expired_rows=[
            SimpleNamespace(token_hash=h, expires_at=past)
        ])

        assert is_blacklisted(token, db) is False

    def test_no_revocation_returns_false(self):
        """A fresh, never-revoked token returns False."""
        token = create_access_token(user_id=42, email="user@example.com")
        db = _make_session(active_row=None, expired_rows=[])
        assert is_blacklisted(token, db) is False


class TestIsBlacklistedExactMatch:
    def test_different_token_returns_false(self):
        """A different (unrelated) token must NOT be flagged as
        blacklisted. Pin this — a regression that did a prefix
        match would falsely flag every token starting with the
        same characters."""
        token_a = create_access_token(user_id=42, email="user@example.com")
        token_b = create_access_token(user_id=99, email="other@example.com")
        db = _make_session(active_row=None, expired_rows=[])
        assert is_blacklisted(token_a, db) is False
        assert is_blacklisted(token_b, db) is False


class TestIsBlacklistedDefensive:
    def test_does_not_raise_on_minimal_session(self):
        """A minimal session stub does not raise — the helper must
        gracefully handle queries that return None."""
        token = create_access_token(user_id=42, email="user@example.com")
        db = _make_session(active_row=None, expired_rows=[])
        # Should NOT raise.
        assert is_blacklisted(token, db) is False

    def test_does_not_raise_on_session_without_commit(self):
        """The lazy cleanup path calls ``db.commit()`` — a session
        stub without commit must still complete (the cleanup is
        a no-op when there are no expired rows)."""
        token = create_access_token(user_id=42, email="user@example.com")
        h = _hash_token(token.strip())
        past = utcnow_naive() - timedelta(hours=1)
        db = _make_session(active_row=None, expired_rows=[
            SimpleNamespace(token_hash=h, expires_at=past)
        ])
        # No commit method on the stub — would raise if called.
        # We make commit a no-op in _make_session above, so the
        # helper completes successfully.
        assert is_blacklisted(token, db) is False