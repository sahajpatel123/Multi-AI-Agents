"""Memory partial failures must not return raw exception strings."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.core.memory import get_memory_manager
from arena.db_models import UserTier
from arena.models.schemas import AgentResponse, ScoredAgent


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed(session_id: str, user_id: str) -> None:
    mem = get_memory_manager()
    try:
        mem.clear_session(session_id)
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
    mem.short_term.add_turn(
        session_id=session_id,
        prompt="Q",
        prompt_category="question",
        scored_responses=[scored],
        winner_id="agent_1",
        winner_persona_id=None,
        user_id=user_id,
    )


@pytest.mark.asyncio
async def test_partial_memory_error_is_stable_code(app_client, make_user, monkeypatch):
    user = make_user(email="mem-leak@test.com", tier=UserTier.PLUS)
    sid = "mem-leak-sess"
    _seed(sid, str(user.id))

    async def _boom(*_a, **_k):
        raise RuntimeError("SECRET_DB_URL=postgres://internal/fail")

    monkeypatch.setattr(
        "arena.core.memory.SessionCompressor.compress_session",
        _boom,
        raising=False,
    )
    # compress_session is on the compressor instance; patch the method on the class
    # or on the live compressor.
    mem = get_memory_manager()
    monkeypatch.setattr(mem.compressor, "compress_session", _boom)

    res = await app_client.post(
        "/api/memory/save",
        headers=_headers(user),
        json={"session_id": sid, "trigger": "manual"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    # May be partial if compression fails but persistence of fallback works.
    if body.get("status") == "partial":
        err = body.get("error") or ""
        assert "SECRET_DB_URL" not in err
        assert "postgres" not in err.lower()
        assert err in {"compression_failed", "persistence_failed"}
        assert "message" in body
