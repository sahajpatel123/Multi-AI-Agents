"""GET /api/session/{id} must not leak existence via 403 vs 404."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.core.memory import get_memory_manager
from arena.db_models import UserTier
from arena.models.schemas import AgentResponse, ScoredAgent


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_session(session_id: str, user_id: str) -> None:
    memory = get_memory_manager()
    try:
        memory.clear_session(session_id)
    except Exception:
        pass
    resp = AgentResponse(
        agent_id="agent_1",
        agent_number=1,
        one_liner="ok",
        verdict="ok",
        confidence=50,
        key_assumption="a",
    )
    scored = ScoredAgent(response=resp, score=70, is_winner=True)
    memory.short_term.add_turn(
        session_id=session_id,
        prompt="Q",
        prompt_category="question",
        scored_responses=[scored],
        winner_id="agent_1",
        winner_persona_id=None,
        user_id=user_id,
    )


@pytest.mark.asyncio
async def test_session_get_foreign_is_404(app_client, make_user):
    owner = make_user(email="sess-owner@test.com", tier=UserTier.PLUS)
    attacker = make_user(email="sess-attacker@test.com", tier=UserTier.PLUS)
    _seed_session("oracle-sess-1", str(owner.id))

    missing = await app_client.get(
        "/api/session/does-not-exist-zzzz",
        headers=_headers(attacker),
    )
    foreign = await app_client.get(
        "/api/session/oracle-sess-1",
        headers=_headers(attacker),
    )
    assert missing.status_code == 404
    assert foreign.status_code == 404, (
        f"foreign session must be 404 (not 403); got {foreign.status_code}"
    )


@pytest.mark.asyncio
async def test_session_get_owner_ok(app_client, make_user):
    owner = make_user(email="sess-ok@test.com", tier=UserTier.PLUS)
    _seed_session("oracle-sess-owner", str(owner.id))
    res = await app_client.get(
        "/api/session/oracle-sess-owner",
        headers=_headers(owner),
    )
    assert res.status_code == 200, res.text
