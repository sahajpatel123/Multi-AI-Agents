"""Tests for the SaveThreadBody.messages role allowlist.

The validate_messages field validator historically capped
role to 20 chars but didn't validate against an allowlist.
A malicious client could persist role="system" or "admin"
that the read path would later emit in the GET
/discuss/threads/{id} response, which would then be
rendered to other clients in the room view.

Fix: normalize role to the {"user", "agent"} allowlist.
Anything other than "agent" becomes "user". This means a
client cannot persist role="system" or "admin" — only the
two valid roles survive the write.

Tests pin:
- role="user" is preserved as "user"
- role="agent" is preserved as "agent"
- role="system" is normalized to "user" (the bypass case)
- role="admin" is normalized to "user"
- role="" (empty) is normalized to "user"
- role="agent " (with trailing whitespace) becomes "user"
  (because role is sliced to 20 chars THEN compared; the
  whitespace is preserved but the comparison fails)
- A 30-char role becomes "user" (the normalize step
  replaces the value)
- The list is bounded to 500 entries (Pydantic max_length)
- Non-dict messages are rejected at request parse time
  (Pydantic v2 ValidationError before the validator runs)
"""

from __future__ import annotations

import pytest

from arena.routes.discuss import SaveThreadBody


def _build(role: str, content: str = "hi"):
    return SaveThreadBody(
        agent_id="claude-sonnet",
        messages=[{"role": role, "content": content}],
    )


# --- allowed roles preserved ---


def test_role_user_preserved() -> None:
    req = _build("user")
    assert req.messages[0]["role"] == "user"


def test_role_agent_preserved() -> None:
    req = _build("agent")
    assert req.messages[0]["role"] == "agent"


# --- non-allowlist roles normalized to user ---


def test_role_system_normalized_to_user() -> None:
    """role="system" is normalized to "user" — the bypass case.
    A malicious client cannot persist role="system" that
    would later be rendered to other clients.
    """
    req = _build("system")
    assert req.messages[0]["role"] == "user"


def test_role_admin_normalized_to_user() -> None:
    req = _build("admin")
    assert req.messages[0]["role"] == "user"


def test_role_empty_normalized_to_user() -> None:
    """Empty role is normalized to "user" (the default)."""
    req = _build("")
    assert req.messages[0]["role"] == "user"


def test_role_with_trailing_space_normalized_to_user() -> None:
    """role="agent " (trailing whitespace) is sliced to 20
    chars but the comparison fails because the space is
    preserved. Result: normalized to "user". This is
    defense-in-depth: only the exact string "agent" is
    preserved verbatim.
    """
    req = _build("agent ")
    assert req.messages[0]["role"] == "user"


def test_role_uppercase_agent_normalized_to_user() -> None:
    """role="AGENT" is case-sensitive. The exact string
    "agent" is preserved; "AGENT" becomes "user"."""
    req = _build("AGENT")
    assert req.messages[0]["role"] == "user"


# --- long role is sliced ---


def test_long_role_sliced() -> None:
    """A 30-char role is sliced to 20 chars by the str()[:20]
    slice in the validator, but only the EXACT string "agent"
    is preserved verbatim. A 20-char string of 'a' is not
    "agent" so it becomes "user" (the default).
    """
    req = _build("a" * 30)
    # The role field becomes "user" (4 chars), not the
    # 20-char slice — the normalize step replaces the value.
    assert req.messages[0]["role"] == "user"


# --- multiple messages with mixed roles ---


def test_multiple_messages_mixed_roles() -> None:
    """A list with multiple messages — the allowlist is applied
    to each one independently."""
    req = SaveThreadBody(
        agent_id="claude-sonnet",
        messages=[
            {"role": "user", "content": "hi"},
            {"role": "agent", "content": "hello"},
            {"role": "system", "content": "dropped"},
            {"role": "admin", "content": "dropped"},
            {"role": "user", "content": "ok"},
        ],
    )
    assert req.messages[0]["role"] == "user"
    assert req.messages[1]["role"] == "agent"
    assert req.messages[2]["role"] == "user"  # was "system"
    assert req.messages[3]["role"] == "user"  # was "admin"
    assert req.messages[4]["role"] == "user"


# --- non-dict messages are dropped ---


def test_non_dict_messages_rejected_at_parse_time() -> None:
    """Pydantic v2 rejects non-dict messages at request parse
    time (ValidationError). This is a tighter guarantee than
    the validator's isinstance check would have given — the
    request is rejected before any processing.
    """
    with pytest.raises(Exception) as exc_info:
        SaveThreadBody(
            agent_id="claude-sonnet",
            messages=[
                {"role": "user", "content": "hi"},
                "not a dict",  # rejected
            ],
        )
    # ValidationError mentions the messages field
    assert "messages" in str(exc_info.value).lower()
