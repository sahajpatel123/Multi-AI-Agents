"""Tests for the AgentTaskRequest.attachment_ids and mcp_integration_ids list-length bounds.

Both fields historically had no max_length at the Pydantic
schema level. The route handler sliced them to 32 and 20
respectively, but the Pydantic schema accepted any length —
a user could submit 1000 attachment IDs and the per-id
validation cost was paid before the route-handler slice.

Fix: bound both at the Pydantic level (max 32 and max 20).
This parallels the cycle 16/17/23 pattern (prompt/discuss/
debate/cross-pollinate persona_ids) and the route-handler
slice becomes a redundant defense-in-depth.

Tests pin:
- attachment_ids with 32 entries accepted (boundary)
- attachment_ids with 33 entries rejected
- attachment_ids with 1000 entries rejected (DoS)
- attachment_ids None / default / empty list accepted
- mcp_integration_ids with 20 entries accepted (boundary)
- mcp_integration_ids with 21 entries rejected
- mcp_integration_ids with 1000 entries rejected (DoS)
- mcp_integration_ids None / default / empty list accepted
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.agent import AgentTaskRequest
from pydantic import ValidationError


# --- attachment_ids ---


_ATTACHMENT_CAP = 32


def test_attachment_ids_with_32_accepted() -> None:
    req = AgentTaskRequest(
        task="hi",
        attachment_ids=[f"id-{i}" for i in range(_ATTACHMENT_CAP)],
    )
    assert len(req.attachment_ids) == _ATTACHMENT_CAP


def test_attachment_ids_with_33_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AgentTaskRequest(
            task="hi",
            attachment_ids=[f"id-{i}" for i in range(_ATTACHMENT_CAP + 1)],
        )
    assert "attachment_ids" in str(exc_info.value).lower()


def test_attachment_ids_with_1000_rejected() -> None:
    """A 1000-entry list is rejected at parse time — the
    list-length cap fires before any per-id validation cost."""
    with pytest.raises(ValidationError):
        AgentTaskRequest(
            task="hi",
            attachment_ids=[f"id-{i}" for i in range(1000)],
        )


def test_attachment_ids_default_is_empty_list() -> None:
    req = AgentTaskRequest(task="hi")
    assert req.attachment_ids == []


def test_attachment_ids_empty_list_accepted() -> None:
    req = AgentTaskRequest(task="hi", attachment_ids=[])
    assert req.attachment_ids == []


# --- mcp_integration_ids ---


_MCP_CAP = 20


def test_mcp_integration_ids_with_20_accepted() -> None:
    req = AgentTaskRequest(
        task="hi",
        mcp_integration_ids=list(range(1, _MCP_CAP + 1)),
    )
    assert len(req.mcp_integration_ids) == _MCP_CAP


def test_mcp_integration_ids_with_21_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AgentTaskRequest(
            task="hi",
            mcp_integration_ids=list(range(1, _MCP_CAP + 2)),
        )
    assert "mcp_integration_ids" in str(exc_info.value).lower()


def test_mcp_integration_ids_with_1000_rejected() -> None:
    with pytest.raises(ValidationError):
        AgentTaskRequest(
            task="hi",
            mcp_integration_ids=list(range(1, 1001)),
        )


def test_mcp_integration_ids_default_is_empty_list() -> None:
    req = AgentTaskRequest(task="hi")
    assert req.mcp_integration_ids == []


def test_mcp_integration_ids_empty_list_accepted() -> None:
    req = AgentTaskRequest(task="hi", mcp_integration_ids=[])
    assert req.mcp_integration_ids == []
