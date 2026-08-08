"""Memory save must not claim or wipe another user's live session.

session_id is client-chosen. If POST /api/memory/save only checked the
persisted SessionSummary row, an attacker who learns a victim's live
session_id could:
  1. compress the victim's in-memory exchanges under their own user_id
  2. clear the victim's short-term session

These tests pin the in-memory ownership guard.
"""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.core.memory import get_memory_manager
from arena.db_models import UserTier
from arena.models.schemas import AgentResponse, ScoredAgent


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_live_session(*, session_id: str, user_id: str, prompt: str = "Should I ship?") -> None:
    memory = get_memory_manager()
    memory.clear_session(session_id)
    resp = AgentResponse(
        agent_id="agent_1",
        agent_number=1,
        one_liner="Ship the smallest honest slice.",
        verdict="Ship the smallest honest slice.",
        confidence=70,
        key_assumption="Delivery is the bottleneck.",
    )
    scored = ScoredAgent(response=resp, score=80, is_winner=True)
    memory.short_term.add_turn(
        session_id=session_id,
        prompt=prompt,
        prompt_category="question",
        scored_responses=[scored],
        winner_id="agent_1",
        winner_persona_id=None,
        user_id=user_id,
    )


@pytest.fixture(autouse=True)
def _clear_memory_store():
    memory = get_memory_manager()
    for sid in ("victim-sess-1", "owner-sess-1"):
        try:
            memory.clear_session(sid)
        except Exception:
            pass
    yield
    for sid in ("victim-sess-1", "owner-sess-1"):
        try:
            memory.clear_session(sid)
        except Exception:
            pass


@pytest.mark.asyncio
async def test_save_rejects_other_users_live_session(app_client, make_user):
    victim = make_user(email="mem-victim@test.com", tier=UserTier.PLUS)
    attacker = make_user(email="mem-attacker@test.com", tier=UserTier.PLUS)

    _seed_live_session(session_id="victim-sess-1", user_id=str(victim.id))

    memory = get_memory_manager()
    state = memory.get_session_state("victim-sess-1")
    assert state is not None
    assert state.get("exchanges"), "expected seeded exchanges"
    assert str(state.get("user_id")) == str(victim.id)

    res = await app_client.post(
        "/api/memory/save",
        headers=_auth(attacker),
        json={"session_id": "victim-sess-1", "trigger": "manual"},
    )
    # 404 (not 403) so foreign session_ids are not distinguishable from missing.
    assert res.status_code == 404, res.text
    # Behavior-level envelope pin (cycle-89 pattern).
    detail = res.json().get("detail")
    assert isinstance(detail, dict)
    assert "error" in detail
    assert "message" in detail

    # Victim session must still be intact (not cleared on forbidden).
    still = memory.get_session_state("victim-sess-1")
    assert still is not None
    assert still.get("exchanges"), "attacker must not clear victim session"


@pytest.mark.asyncio
async def test_save_allows_owner_session(app_client, make_user):
    owner = make_user(email="mem-owner@test.com", tier=UserTier.PLUS)
    _seed_live_session(session_id="owner-sess-1", user_id=str(owner.id))

    res = await app_client.post(
        "/api/memory/save",
        headers=_auth(owner),
        json={"session_id": "owner-sess-1", "trigger": "manual"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body.get("status") in {"saved", "partial", "skipped"}
    if body.get("status") in {"saved", "partial"}:
        assert get_memory_manager().get_session_state("owner-sess-1") is None
