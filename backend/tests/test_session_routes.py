"""Integration tests for /api/session list and delete endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from arena.core.auth import create_access_token
from arena.core.memory import get_memory_manager
from arena.models.schemas import SessionData
from arena.db_models import UserTier


@pytest.fixture(autouse=True)
def _clear_short_term_store():
    """The MemoryManager._store is module-level in-memory state that
    persists across tests. Clear it before each test in this file so a
    session seeded in one test doesn't leak into another."""
    memory = get_memory_manager()
    if memory.short_term._store:
        memory.short_term._store.clear()
    yield
    if memory.short_term._store:
        memory.short_term._store.clear()


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _make_session(user_id, *, session_id: str, topics: list[str] | None = None) -> SessionData:
    """Build a SessionData with no turns — the list endpoint reads turn count
    from len(session_data.turns), which is 0 here. We don't need real turns
    to test list/delete routing; the route doesn't deserialize turn contents."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return SessionData(
        session_id=session_id,
        user_id=str(user_id),
        topics=list(topics or []),
        turns=[],
        created_at=now,
        last_active=now,
    )


def _seed_in_memory(user_id, *, session_id: str, topics: list[str] | None = None):
    """Push a SessionData into the ShortTermMemory store so the route can find it.

    MemoryManager wraps ShortTermMemory; the actual store and helper live
    on memory.short_term, not on MemoryManager itself.
    """
    memory = get_memory_manager()
    state = memory.short_term._get_or_create_state(session_id, user_id=str(user_id))
    state["session_data"] = _make_session(user_id, session_id=session_id, topics=topics)
    return state


# ─── List ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_returns_envelope_with_sessions_key(app_client, make_user):
    user = make_user(email="sess-list@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="s1", topics=["ai"])
    _seed_in_memory(user.id, session_id="s2", topics=["ethics"])

    res = await app_client.get("/api/sessions", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert "sessions" in body
    assert isinstance(body["sessions"], list)
    assert body["total"] == 2
    sids = {s["session_id"] for s in body["sessions"]}
    assert sids == {"s1", "s2"}


@pytest.mark.asyncio
async def test_list_omits_foreign_sessions(app_client, make_user):
    """A user must NEVER see another user's sessions in the list."""
    alice = make_user(email="sess-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="sess-bob@test.com", tier=UserTier.PRO)
    _seed_in_memory(alice.id, session_id="alice-1")
    _seed_in_memory(bob.id, session_id="bob-1")

    res = await app_client.get("/api/sessions", headers=_pro_headers(alice))
    body = res.json()
    sids = {s["session_id"] for s in body["sessions"]}
    assert sids == {"alice-1"}


@pytest.mark.asyncio
async def test_list_omits_anonymous_sessions(app_client, make_user):
    """Anonymous (no user_id) sessions must NOT leak to any authenticated caller."""
    user = make_user(email="sess-anon@test.com", tier=UserTier.PRO)
    memory = get_memory_manager()
    # Seed a session owned by 'anonymous'.
    state = memory.short_term._get_or_create_state("anon-sess", user_id="anonymous")
    state["session_data"] = _make_session("anonymous", session_id="anon-sess")
    # Plus one of the caller's.
    _seed_in_memory(user.id, session_id="mine")

    res = await app_client.get("/api/sessions", headers=_pro_headers(user))
    body = res.json()
    sids = {s["session_id"] for s in body["sessions"]}
    assert "anon-sess" not in sids
    assert "mine" in sids


@pytest.mark.asyncio
async def test_list_respects_limit(app_client, make_user):
    user = make_user(email="sess-limit@test.com", tier=UserTier.PRO)
    for i in range(5):
        _seed_in_memory(user.id, session_id=f"s{i}")

    res = await app_client.get("/api/sessions?limit=2", headers=_pro_headers(user))
    body = res.json()
    assert body["total"] == 2
    assert len(body["sessions"]) == 2


@pytest.mark.asyncio
async def test_list_rejects_overlong_limit(app_client, make_user):
    user = make_user(email="sess-bad-limit@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/sessions?limit=999", headers=_pro_headers(user))
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_list_returns_empty_when_no_sessions(app_client, make_user):
    user = make_user(email="sess-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/sessions", headers=_pro_headers(user))
    body = res.json()
    assert body["sessions"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_list_row_includes_topic_and_turn_count(app_client, make_user):
    user = make_user(email="sess-row@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="s1", topics=["ai", "ml"])
    res = await app_client.get("/api/sessions", headers=_pro_headers(user))
    body = res.json()
    row = body["sessions"][0]
    assert row["session_id"] == "s1"
    assert row["topics"] == ["ai", "ml"]
    assert row["primary_topic"] == "ai"
    assert row["turn_count"] == 0  # no turns seeded


# ─── Delete single ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_removes_owned_session(app_client, make_user):
    user = make_user(email="sess-del@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="mine")
    res = await app_client.delete("/api/session/mine", headers=_pro_headers(user))
    assert res.status_code == 200
    assert res.json() == {"status": "deleted", "session_id": "mine"}

    listing = await app_client.get("/api/sessions", headers=_pro_headers(user))
    assert listing.json()["total"] == 0


@pytest.mark.asyncio
async def test_delete_404_for_foreign_session(app_client, make_user):
    alice = make_user(email="sess-del-a@test.com", tier=UserTier.PRO)
    bob = make_user(email="sess-del-b@test.com", tier=UserTier.PRO)
    _seed_in_memory(alice.id, session_id="alice-1")

    res = await app_client.delete("/api/session/alice-1", headers=_pro_headers(bob))
    assert res.status_code == 404

    # Alice's session still exists.
    listing = await app_client.get("/api/sessions", headers=_pro_headers(alice))
    sids = {s["session_id"] for s in listing.json()["sessions"]}
    assert "alice-1" in sids


@pytest.mark.asyncio
async def test_delete_404_for_missing_session(app_client, make_user):
    user = make_user(email="sess-del-miss@test.com", tier=UserTier.PRO)
    res = await app_client.delete("/api/session/never-existed", headers=_pro_headers(user))
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_404_for_anonymous_session(app_client, make_user):
    """Anonymous sessions must look like missing to authenticated callers."""
    user = make_user(email="sess-del-anon@test.com", tier=UserTier.PRO)
    memory = get_memory_manager()
    state = memory.short_term._get_or_create_state("anon-sess", user_id="anonymous")
    state["session_data"] = _make_session("anonymous", session_id="anon-sess")
    res = await app_client.delete("/api/session/anon-sess", headers=_pro_headers(user))
    assert res.status_code == 404


# ─── Bulk delete ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_all_only_removes_owned(app_client, make_user):
    alice = make_user(email="sess-bulk-a@test.com", tier=UserTier.PRO)
    bob = make_user(email="sess-bulk-b@test.com", tier=UserTier.PRO)
    _seed_in_memory(alice.id, session_id="a-1")
    _seed_in_memory(alice.id, session_id="a-2")
    _seed_in_memory(bob.id, session_id="b-1")

    res = await app_client.delete("/api/sessions", headers=_pro_headers(alice))
    assert res.status_code == 200
    assert res.json() == {"status": "deleted", "deleted": 2}

    # Alice has nothing left.
    listing = await app_client.get("/api/sessions", headers=_pro_headers(alice))
    assert listing.json()["total"] == 0

    # Bob's session still exists.
    listing = await app_client.get("/api/sessions", headers=_pro_headers(bob))
    sids = {s["session_id"] for s in listing.json()["sessions"]}
    assert sids == {"b-1"}


@pytest.mark.asyncio
async def test_delete_all_zero_when_nothing_owned(app_client, make_user):
    bob = make_user(email="sess-bulk-empty@test.com", tier=UserTier.PRO)
    alice = make_user(email="sess-bulk-other@test.com", tier=UserTier.PRO)
    _seed_in_memory(alice.id, session_id="a-1")
    res = await app_client.delete("/api/sessions", headers=_pro_headers(bob))
    assert res.status_code == 200
    assert res.json()["deleted"] == 0


# ─── Auth ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_session_endpoints_require_auth(app_client):
    for method, path in [
        ("GET", "/api/sessions"),
        ("DELETE", "/api/session/x"),
        ("DELETE", "/api/sessions"),
    ]:
        res = await app_client.request(method, path)
        assert res.status_code == 401, f"{method} {path} returned {res.status_code}"


@pytest.mark.asyncio
async def test_delete_session_clears_persona_integrity_drift_history(
    app_client, make_user
):
    """Deleting a session must drop the persona_integrity in-memory
    drift history for that session_id. Without this cleanup the
    process-local defaultdict grows unbounded for users who delete
    many sessions over a long-running process.
    """
    user = make_user(email="sess-drift@test.com", tier=UserTier.PRO)
    from arena.core import persona_integrity

    session_id = "drift-target"
    _seed_in_memory(user.id, session_id=session_id)
    # Seed drift history for two agents under this session.
    persona_integrity.record_response("agent_1", "verdict-1", session_id)
    persona_integrity.record_response("agent_2", "verdict-2", session_id)
    assert session_id in persona_integrity._session_history
    assert len(persona_integrity._session_history[session_id]) == 2

    res = await app_client.delete(
        f"/api/session/{session_id}", headers=_pro_headers(user)
    )
    assert res.status_code == 200

    # The persona_integrity history for this session must be gone
    # — the route's delete path now calls clear_session_history()
    # alongside memory.clear_session().
    assert session_id not in persona_integrity._session_history


@pytest.mark.asyncio
async def test_delete_all_sessions_clears_persona_integrity_history(
    app_client, make_user
):
    """Bulk delete must clear drift history for every session the caller
    owned, and only those — foreign sessions keep their history."""
    user = make_user(email="sess-bulk-drift@test.com", tier=UserTier.PRO)
    from arena.core import persona_integrity

    _seed_in_memory(user.id, session_id="keep-history-A")
    _seed_in_memory(user.id, session_id="keep-history-B")
    persona_integrity.record_response("agent_1", "v", "keep-history-A")
    persona_integrity.record_response("agent_1", "v", "keep-history-B")
    # Add an unrelated session that the caller does not own; its
    # history must survive the bulk delete.
    persona_integrity.record_response("agent_1", "v", "not-mine")

    res = await app_client.delete("/api/sessions", headers=_pro_headers(user))
    assert res.status_code == 200
    assert res.json() == {"status": "deleted", "deleted": 2}

    assert "keep-history-A" not in persona_integrity._session_history
    assert "keep-history-B" not in persona_integrity._session_history
    # Foreign session's history is untouched.
    assert "not-mine" in persona_integrity._session_history