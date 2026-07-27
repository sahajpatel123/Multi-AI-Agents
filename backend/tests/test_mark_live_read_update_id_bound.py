"""Tests for the MarkLiveReadBody.update_id length bound.

update_id historically had no max_length at the Pydantic
level. Live update IDs are UUIDs (~36 chars); a user could
submit a 1MB string to amplify the pydantic memory cost
before the route handler's strip+compare.

Fix: bound update_id at the Pydantic level (max 100 chars).

Tests pin:
- 100-char update_id accepted (boundary)
- 101-char update_id rejected
- 1MB update_id rejected (DoS)
- None accepted (default — mark all as read)
- "" accepted (empty string — also marks all as read)
- A typical UUID-length string accepted (36 chars)
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.agent import MarkLiveReadBody
from pydantic import ValidationError


# --- list-length cap: 100 is the max ---


def test_mark_live_read_update_id_100_accepted() -> None:
    req = MarkLiveReadBody(update_id="a" * 100)
    assert len(req.update_id) == 100


def test_mark_live_read_update_id_101_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        MarkLiveReadBody(update_id="a" * 101)
    assert "update_id" in str(exc_info.value).lower()


def test_mark_live_read_update_id_1mb_rejected() -> None:
    """A 1MB update_id is rejected at parse time — the
    Pydantic cap closes the gap before any per-id
    processing cost.
    """
    with pytest.raises(ValidationError):
        MarkLiveReadBody(update_id="a" * (1024 * 1024))


def test_mark_live_read_update_id_default_is_none() -> None:
    """None is the default (mark all updates as read)."""
    req = MarkLiveReadBody()
    assert req.update_id is None


def test_mark_live_read_update_id_empty_string_accepted() -> None:
    """Empty string is accepted (the route handler's
    `uid = (body.update_id or "").strip()` treats empty
    as None — marks all updates as read).
    """
    req = MarkLiveReadBody(update_id="")
    assert req.update_id == ""


def test_mark_live_read_update_id_uuid_length_accepted() -> None:
    """A typical UUID-length string (36 chars) is accepted
    (the realistic upper bound for live_update IDs)."""
    req = MarkLiveReadBody(update_id="a" * 36)
    assert len(req.update_id) == 36
