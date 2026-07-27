"""Tests for the WatchlistCreateBody/WatchlistPatchBody.interval_hours bounds.

interval_hours historically had no Pydantic bounds — a user
could submit 999999999 (or any int, including negative or
overflow values). The route handler validates against
WATCHLIST_INTERVALS={24, 72, 168}, but the Pydantic schema
accepted any int.

Fix: bound interval_hours at the Pydantic level (ge=1,
le=168). The route handler's WATCHLIST_INTERVALS check
remains as the strict allow-list (24/72/168 only); the
Pydantic cap is the defense-in-depth outer bound.

Tests pin:
- WatchlistCreateBody: interval_hours=24 accepted (the
  minimum realistic value, also in WATCHLIST_INTERVALS)
- WatchlistCreateBody: interval_hours=168 accepted (the
  maximum realistic value, also in WATCHLIST_INTERVALS)
- WatchlistCreateBody: interval_hours=0 rejected
  (Pydantic ge=1 catches this)
- WatchlistCreateBody: interval_hours=169 rejected
  (Pydantic le=168 catches this)
- WatchlistCreateBody: interval_hours=-1 rejected
- WatchlistCreateBody: interval_hours=999999999 rejected
  (overflow / DoS)
- WatchlistPatchBody: same bounds apply
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.agent import WatchlistCreateBody, WatchlistPatchBody
from pydantic import ValidationError


# --- WatchlistCreateBody.interval_hours ---


def test_watchlist_create_interval_24_accepted() -> None:
    """24 is the minimum realistic value (also in the
    WATCHLIST_INTERVALS allow-list of {24, 72, 168}).
    """
    req = WatchlistCreateBody(question="q", interval_hours=24)
    assert req.interval_hours == 24


def test_watchlist_create_interval_168_accepted() -> None:
    """168 = 1 week is the maximum realistic value (also in
    the WATCHLIST_INTERVALS allow-list).
    """
    req = WatchlistCreateBody(question="q", interval_hours=168)
    assert req.interval_hours == 168


def test_watchlist_create_interval_0_rejected() -> None:
    """0 is rejected at parse time (Pydantic ge=1). The
    previous behavior accepted 0; the route handler would
    have rejected it via WATCHLIST_INTERVALS membership.
    """
    with pytest.raises(ValidationError) as exc_info:
        WatchlistCreateBody(question="q", interval_hours=0)
    assert "interval_hours" in str(exc_info.value).lower()


def test_watchlist_create_interval_169_rejected() -> None:
    """169 is rejected at parse time (Pydantic le=168). The
    previous behavior accepted 169; the route handler would
    have rejected it via WATCHLIST_INTERVALS membership.
    """
    with pytest.raises(ValidationError) as exc_info:
        WatchlistCreateBody(question="q", interval_hours=169)
    assert "interval_hours" in str(exc_info.value).lower()


def test_watchlist_create_interval_negative_rejected() -> None:
    """-1 is rejected at parse time (Pydantic ge=1)."""
    with pytest.raises(ValidationError):
        WatchlistCreateBody(question="q", interval_hours=-1)


def test_watchlist_create_interval_huge_rejected() -> None:
    """999999999 is rejected at parse time (Pydantic le=168).
    The previous behavior accepted this; the route handler
    would have rejected it via WATCHLIST_INTERVALS, but
    the unbounded int could have overflowed the
    next_run_at calculation in tight loops.
    """
    with pytest.raises(ValidationError):
        WatchlistCreateBody(question="q", interval_hours=999999999)


# --- WatchlistPatchBody.interval_hours ---


def test_watchlist_patch_interval_24_accepted() -> None:
    req = WatchlistPatchBody(interval_hours=24)
    assert req.interval_hours == 24


def test_watchlist_patch_interval_169_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        WatchlistPatchBody(interval_hours=169)
    assert "interval_hours" in str(exc_info.value).lower()


def test_watchlist_patch_interval_0_rejected() -> None:
    with pytest.raises(ValidationError):
        WatchlistPatchBody(interval_hours=0)


def test_watchlist_patch_interval_none_accepted() -> None:
    """None is the default (don't change interval)."""
    req = WatchlistPatchBody()
    assert req.interval_hours is None
