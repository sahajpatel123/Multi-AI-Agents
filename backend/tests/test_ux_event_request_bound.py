"""Tests for the UXEventRequest field length bounds.

session_id, event_type, persona_id, agent_id historically
had no max_length at the Pydantic level. The
validate_required_text / validate_optional_text field
validators cap at 100 chars AFTER Pydantic accepts the
full string.

This is an anonymous-writable endpoint (no auth required
to POST), so a user can amplify the per-field memory cost
to amplify the validation work. The Pydantic cap closes
the gap at parse time (422) so the per-field memory cost
is bounded by the cap.

Tests pin:
- session_id: 100 accepted (boundary), 101 rejected, 1MB
  rejected, missing rejected (required)
- event_type: 100 accepted (boundary), 101 rejected, 1MB
  rejected, missing rejected (required)
- persona_id: 100 accepted (boundary), 101 rejected, 1MB
  rejected, None accepted (default)
- agent_id: 100 accepted (boundary), 101 rejected, 1MB
  rejected, None accepted (default)
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.analytics import UXEventRequest
from pydantic import ValidationError


# --- session_id (Required, max 100) ---


def test_session_id_100_accepted() -> None:
    req = UXEventRequest(session_id="a" * 100, event_type="click")
    assert len(req.session_id) == 100


def test_session_id_101_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        UXEventRequest(session_id="a" * 101, event_type="click")
    assert "session_id" in str(exc_info.value).lower()


def test_session_id_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        UXEventRequest(session_id="a" * (1024 * 1024), event_type="click")


def test_session_id_missing_rejected() -> None:
    """Missing session_id is rejected (the field is required)."""
    with pytest.raises(ValidationError):
        UXEventRequest(event_type="click")  # type: ignore[call-arg]


# --- event_type (Required, max 100) ---


def test_event_type_100_accepted() -> None:
    req = UXEventRequest(session_id="s", event_type="a" * 100)
    assert len(req.event_type) == 100


def test_event_type_101_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        UXEventRequest(session_id="s", event_type="a" * 101)
    assert "event_type" in str(exc_info.value).lower()


def test_event_type_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        UXEventRequest(session_id="s", event_type="a" * (1024 * 1024))


def test_event_type_missing_rejected() -> None:
    with pytest.raises(ValidationError):
        UXEventRequest(session_id="s")  # type: ignore[call-arg]


# --- persona_id (Optional, max 100) ---


def test_persona_id_100_accepted() -> None:
    req = UXEventRequest(
        session_id="s", event_type="click", persona_id="a" * 100,
    )
    assert len(req.persona_id) == 100


def test_persona_id_101_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        UXEventRequest(
            session_id="s", event_type="click", persona_id="a" * 101,
        )
    assert "persona_id" in str(exc_info.value).lower()


def test_persona_id_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        UXEventRequest(
            session_id="s", event_type="click",
            persona_id="a" * (1024 * 1024),
        )


def test_persona_id_none_accepted() -> None:
    """None is the default (no persona_id)."""
    req = UXEventRequest(session_id="s", event_type="click")
    assert req.persona_id is None


# --- agent_id (Optional, max 100) ---


def test_agent_id_100_accepted() -> None:
    req = UXEventRequest(session_id="s", event_type="click", agent_id="a" * 100)
    assert len(req.agent_id) == 100


def test_agent_id_101_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        UXEventRequest(session_id="s", event_type="click", agent_id="a" * 101)
    assert "agent_id" in str(exc_info.value).lower()


def test_agent_id_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        UXEventRequest(
            session_id="s", event_type="click", agent_id="a" * (1024 * 1024),
        )


def test_agent_id_none_accepted() -> None:
    """None is the default (no agent_id)."""
    req = UXEventRequest(session_id="s", event_type="click")
    assert req.agent_id is None
