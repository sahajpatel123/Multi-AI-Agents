"""Regression tests: ``get_user_by_email`` normalizes case + whitespace.

Pins the contract that has been the silent assumption across the auth
surface — `/register`, `/login`, `/refresh`, `/check-email`, password
reset, and the OAuth callback all rely on `get_user_by_email` returning
the same row regardless of input casing or surrounding whitespace.

The function is tiny — `email.lower().strip()` — but it sits in front of
every login attempt. A refactor that adds (e.g.) a `str.lstrip()` without
`.strip()` would silently let ``" alice@example.com "`` match but
``"alice@example.com\\n"`` (from a curl pipe) would 401. These tests
pin the contract at the unit level.
"""

from __future__ import annotations

import pytest

from arena.core.auth import get_user_by_email
from arena.db_models import User, UserTier


def _make_user(db_session, email: str) -> User:
    user = User(
        email=email.lower().strip(),
        password_hash="x",  # hash is irrelevant — we never call verify_password here
        name="Test",
        tier=UserTier.FREE,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_lookup_matches_mixed_case_input(db_session):
    seeded = _make_user(db_session, "alice@example.com")

    # Mixed-case input — must resolve to the same row.
    found = get_user_by_email(db_session, "ALICE@Example.COM")
    assert found is not None
    assert found.id == seeded.id


@pytest.mark.asyncio
async def test_lookup_strips_surrounding_whitespace(db_session):
    seeded = _make_user(db_session, "bob@example.com")

    # Leading + trailing whitespace — must strip before comparing.
    found = get_user_by_email(db_session, "   bob@example.com   ")
    assert found is not None
    assert found.id == seeded.id

    # Newline from a curl-pipe upload — the most common whitespace gotcha.
    found = get_email_with_trailing_newline = get_user_by_email(
        db_session, "bob@example.com\n"
    )
    assert found is not None
    assert found.id == seeded.id


@pytest.mark.asyncio
async def test_lookup_returns_none_for_unknown_email(db_session):
    assert get_user_by_email(db_session, "nobody@example.com") is None


@pytest.mark.asyncio
async def test_lookup_is_case_sensitive_on_local_part_after_normalization(db_session):
    """Once normalized, two emails that differ only in domain casing still
    collide (because `.lower()` collapses them). Pin that the
    normalization is full-string, not local-part-only — anything else
    would let the same email register twice on /register."""
    _make_user(db_session, "carol@example.com")

    # Both inputs must resolve to the same row — domain casing is NOT
    # preserved post-normalization.
    a = get_user_by_email(db_session, "carol@EXAMPLE.com")
    b = get_user_by_email(db_session, "CAROL@example.COM")
    assert a is not None
    assert b is not None
    assert a.id == b.id


@pytest.mark.asyncio
async def test_lookup_does_not_match_plus_addressing_as_same_user(db_session):
    """Plus-addressing is a *different* account in the registration flow —
    'alice@example.com' and 'alice+x@example.com' must both resolve to
    their own rows (or ``None`` if not seeded)."""
    _make_user(db_session, "alice@example.com")

    a = get_user_by_email(db_session, "alice@example.com")
    plus = get_user_by_email(db_session, "alice+x@example.com")
    assert a is not None
    # The plus-addressed email is a different account → no row.
    assert plus is None