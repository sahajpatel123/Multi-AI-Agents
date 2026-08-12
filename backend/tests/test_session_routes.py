"""Integration tests for /api/session list and delete endpoints."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

from datetime import datetime, timezone

import pytest

from arena.core.memory import get_memory_manager
from arena.models.schemas import SessionData, SessionTurn, AgentResponse
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



def _make_session(user_id, *, session_id: str, topics: list[str] | None = None) -> SessionData:
    """Build a SessionData with no turns — the list endpoint reads turn count
    from len(session_data.turns), which is 0 here. We don't need real turns
    to test list/delete routing; the route doesn't deserialize turn contents."""
    now = utcnow_naive()
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


@pytest.mark.asyncio
async def test_list_row_includes_last_prompt(app_client, make_user):
    """The list row should carry the most recent prompt so the UI can show a
    readable resume title instead of topic keywords alone."""
    user = make_user(email="sess-last-prompt@test.com", tier=UserTier.PRO)
    state = _seed_in_memory(user.id, session_id="s1", topics=["market"])
    state["session_data"].turns = [
        SessionTurn(
            turn_id="turn-1",
            prompt="Should we launch the market experiment now?",
            agent_responses={
                "agent_1": AgentResponse(
                    agent_id="agent_1",
                    agent_number=1,
                    verdict="Yes, bounded experiment.",
                    one_liner="Yes, bounded experiment.",
                    confidence=82,
                    key_assumption="The test stays small.",
                    timestamp="2026-08-12T10:00:00Z",
                )
            },
            winner_id="agent_1",
            timestamp="2026-08-12T10:00:00Z",
        )
    ]

    res = await app_client.get("/api/sessions", headers=_pro_headers(user))
    assert res.status_code == 200
    row = res.json()["sessions"][0]
    assert row["session_id"] == "s1"
    assert row["last_prompt"] == "Should we launch the market experiment now?"
    assert row["turn_count"] == 1


# ─── Rename ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_rename_updates_session_title_in_list(app_client, make_user):
    user = make_user(email="sess-rename@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="mine")

    res = await app_client.patch(
        "/api/session/mine",
        headers=_pro_headers(user),
        json={"title": "   Launch plan review  "},
    )
    assert res.status_code == 200
    assert res.json() == {
        "status": "renamed",
        "session_id": "mine",
        "title": "Launch plan review",
    }

    listing = await app_client.get("/api/sessions", headers=_pro_headers(user))
    row = listing.json()["sessions"][0]
    assert row["title"] == "Launch plan review"


@pytest.mark.asyncio
async def test_rename_collapses_internal_whitespace(app_client, make_user):
    user = make_user(email="sess-rename-space@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="mine")

    res = await app_client.patch(
        "/api/session/mine",
        headers=_pro_headers(user),
        json={"title": "Launch \n  plan\treview"},
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Launch plan review"

    listing = await app_client.get("/api/sessions", headers=_pro_headers(user))
    assert listing.json()["sessions"][0]["title"] == "Launch plan review"


@pytest.mark.asyncio
async def test_rename_404_for_foreign_session(app_client, make_user):
    alice = make_user(email="sess-rename-a@test.com", tier=UserTier.PRO)
    bob = make_user(email="sess-rename-b@test.com", tier=UserTier.PRO)
    _seed_in_memory(alice.id, session_id="alice-1")

    res = await app_client.patch(
        "/api/session/alice-1",
        headers=_pro_headers(bob),
        json={"title": "Not mine"},
    )
    assert res.status_code == 404
    assert res.json()["detail"]["error"] == "not_found"

    listing = await app_client.get("/api/sessions", headers=_pro_headers(alice))
    assert listing.json()["sessions"][0]["title"] is None


@pytest.mark.asyncio
async def test_rename_404_for_missing_session(app_client, make_user):
    user = make_user(email="sess-rename-miss@test.com", tier=UserTier.PRO)
    res = await app_client.patch(
        "/api/session/never-existed",
        headers=_pro_headers(user),
        json={"title": "Ghost"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_rename_rejects_empty_title(app_client, make_user):
    user = make_user(email="sess-rename-empty@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="mine")
    res = await app_client.patch(
        "/api/session/mine",
        headers=_pro_headers(user),
        json={"title": "   "},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_rename_rejects_overlong_title(app_client, make_user):
    user = make_user(email="sess-rename-long@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="mine")
    res = await app_client.patch(
        "/api/session/mine",
        headers=_pro_headers(user),
        json={"title": "x" * 121},
    )
    assert res.status_code == 422


# ─── Duplicate ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_duplicate_creates_independent_copy(app_client, make_user):
    user = make_user(email="sess-dup@test.com", tier=UserTier.PRO)
    state = _seed_in_memory(user.id, session_id="orig", topics=["launch"])
    state["session_title"] = "Launch plan review"
    state["session_pinned"] = True
    state["session_data"].turns = [
        SessionTurn(
            turn_id="turn-1",
            prompt="Should we launch the experiment now?",
            agent_responses={
                "agent_1": AgentResponse(
                    agent_id="agent_1",
                    agent_number=1,
                    verdict="Yes, bounded experiment.",
                    one_liner="Yes, bounded experiment.",
                    confidence=82,
                    key_assumption="The test stays small.",
                    timestamp="2026-08-12T10:00:00Z",
                )
            },
            winner_id="agent_1",
            timestamp="2026-08-12T10:00:00Z",
        )
    ]

    res = await app_client.post(
        "/api/session/orig/duplicate", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "duplicated"
    assert body["session_id"] != "orig"

    dup = body["session"]
    assert dup["title"] == "Launch plan review"
    assert dup["topics"] == ["launch"]
    assert dup["primary_topic"] == "launch"
    assert dup["last_prompt"] == "Should we launch the experiment now?"
    assert dup["turn_count"] == 1
    assert dup["pinned"] is False
    assert dup["last_active"] is not None

    # Both chats appear in the sidebar list.
    listing = await app_client.get("/api/sessions", headers=_pro_headers(user))
    sids = {row["session_id"] for row in listing.json()["sessions"]}
    assert sids == {"orig", body["session_id"]}

    # The copy is a real fork: appending to the original does not change it.
    memory = get_memory_manager()
    dup_state = memory.short_term._store[body["session_id"]]
    orig_state = memory.short_term._store["orig"]
    assert len(dup_state["session_data"].turns) == 1
    assert dup_state["session_pinned"] is False
    # The fork starts its own activity clock and leaves the source pin alone.
    assert dup_state["session_data"].created_at == dup_state["session_data"].last_active
    assert orig_state["session_pinned"] is True
    orig_state["session_data"].turns.append(
        SessionTurn(
            turn_id="turn-2",
            prompt="What about the risk?",
            agent_responses={
                "agent_2": AgentResponse(
                    agent_id="agent_2",
                    agent_number=2,
                    verdict="Keep it small.",
                    one_liner="Keep it small.",
                    confidence=74,
                    key_assumption="The team can move fast.",
                    timestamp="2026-08-12T10:10:00Z",
                )
            },
            winner_id="agent_2",
            timestamp="2026-08-12T10:10:00Z",
        )
    )
    assert len(dup_state["session_data"].turns) == 1


@pytest.mark.asyncio
async def test_duplicate_404_for_foreign_session(app_client, make_user):
    alice = make_user(email="sess-dup-a@test.com", tier=UserTier.PRO)
    bob = make_user(email="sess-dup-b@test.com", tier=UserTier.PRO)
    _seed_in_memory(alice.id, session_id="alice-1")

    res = await app_client.post(
        "/api/session/alice-1/duplicate", headers=_pro_headers(bob)
    )
    assert res.status_code == 404

    listing = await app_client.get("/api/sessions", headers=_pro_headers(alice))
    assert len(listing.json()["sessions"]) == 1


@pytest.mark.asyncio
async def test_duplicate_uses_session_data_owner_when_state_owner_missing(
    app_client, make_user
):
    """Ownership falls back to session_data when the top-level owner is stale."""
    user = make_user(email="sess-dup-fallback@test.com", tier=UserTier.PRO)
    memory = get_memory_manager()
    state = memory.short_term._get_or_create_state("fallback-1", user_id=str(user.id))
    state["session_data"] = _make_session(
        user.id, session_id="fallback-1", topics=["fork"]
    )
    state.pop("user_id", None)  # Simulate a stale/missing top-level owner.

    res = await app_client.post(
        "/api/session/fallback-1/duplicate", headers=_pro_headers(user)
    )
    assert res.status_code == 200

    # A foreign caller still gets the uniform 404 oracle.
    bob = make_user(email="sess-dup-fallback-b@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/session/fallback-1/duplicate", headers=_pro_headers(bob)
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_duplicate_404_for_malformed_state_without_session_data(
    app_client, make_user
):
    """A broken state must 404 like a missing session, never 500."""
    user = make_user(email="sess-dup-broken@test.com", tier=UserTier.PRO)
    memory = get_memory_manager()
    state = memory.short_term._get_or_create_state("broken-1", user_id=str(user.id))
    state["session_data"] = None

    res = await app_client.post(
        "/api/session/broken-1/duplicate", headers=_pro_headers(user)
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_duplicate_404_for_missing_session(app_client, make_user):
    user = make_user(email="sess-dup-miss@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/session/never-existed/duplicate", headers=_pro_headers(user)
    )
    assert res.status_code == 404


# ─── Bulk duplicate ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_duplicate_forks_only_requested_owned_sessions(
    app_client, make_user
):
    """Bulk duplicate must fork exactly the requested owned sessions and
    leave unselected, foreign, and missing sessions alone."""
    alice = make_user(email="sess-bulk-dup-a@test.com", tier=UserTier.PRO)
    bob = make_user(email="sess-bulk-dup-b@test.com", tier=UserTier.PRO)
    state_a = _seed_in_memory(alice.id, session_id="a-1", topics=["launch"])
    state_a["session_title"] = "Launch review"
    state_b = _seed_in_memory(alice.id, session_id="a-2", topics=["risk"])
    state_b["session_title"] = "Risk review"
    _seed_in_memory(alice.id, session_id="a-keep")
    _seed_in_memory(bob.id, session_id="b-1")

    res = await app_client.post(
        "/api/sessions/bulk/duplicate",
        headers=_pro_headers(alice),
        json={"session_ids": ["a-1", "a-2", "b-1", "missing"]},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "duplicated"
    assert body["duplicated"] == 2
    assert len(body["sessions"]) == 2

    dup_titles = {row["title"] for row in body["sessions"]}
    assert dup_titles == {"Launch review", "Risk review"}
    dup_ids = {row["session_id"] for row in body["sessions"]}
    assert dup_ids.isdisjoint({"a-1", "a-2", "a-keep", "b-1"})
    assert all(row["pinned"] is False for row in body["sessions"])

    # The caller now sees originals plus the new forks; Bob's chat is untouched.
    listing = await app_client.get("/api/sessions", headers=_pro_headers(alice))
    sids = {row["session_id"] for row in listing.json()["sessions"]}
    assert sids == {"a-1", "a-2", "a-keep", *dup_ids}

    listing = await app_client.get("/api/sessions", headers=_pro_headers(bob))
    assert {row["session_id"] for row in listing.json()["sessions"]} == {"b-1"}


@pytest.mark.asyncio
async def test_bulk_duplicate_deduplicates_and_accepts_empty_result(
    app_client, make_user
):
    user = make_user(email="sess-bulk-dup-dedup@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="mine", topics=["fork"])

    res = await app_client.post(
        "/api/sessions/bulk/duplicate",
        headers=_pro_headers(user),
        json={"session_ids": ["mine", "mine", "ghost"]},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["duplicated"] == 1
    assert len(body["sessions"]) == 1

    # Only missing/foreign ids are a successful no-op, never an error.
    res = await app_client.post(
        "/api/sessions/bulk/duplicate",
        headers=_pro_headers(user),
        json={"session_ids": ["ghost"]},
    )
    assert res.status_code == 200
    assert res.json()["duplicated"] == 0
    assert res.json()["sessions"] == []


@pytest.mark.asyncio
async def test_bulk_duplicate_rejects_empty_or_overlong_id_lists(
    app_client, make_user
):
    user = make_user(email="sess-bulk-dup-bounds@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="mine")

    res = await app_client.post(
        "/api/sessions/bulk/duplicate",
        headers=_pro_headers(user),
        json={"session_ids": []},
    )
    assert res.status_code == 422

    res = await app_client.post(
        "/api/sessions/bulk/duplicate",
        headers=_pro_headers(user),
        json={"session_ids": [f"x{i}" for i in range(101)]},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_list_skips_malformed_state_without_session_data(app_client, make_user):
    """Listing must not 500 on a malformed state; it skips the broken row."""
    user = make_user(email="sess-list-broken@test.com", tier=UserTier.PRO)
    memory = get_memory_manager()
    state = memory.short_term._get_or_create_state("broken-list", user_id=str(user.id))
    state["session_data"] = None
    _seed_in_memory(user.id, session_id="healthy")

    res = await app_client.get("/api/sessions", headers=_pro_headers(user))
    assert res.status_code == 200
    sids = {row["session_id"] for row in res.json()["sessions"]}
    assert sids == {"healthy"}


# ─── Pin / unpin ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pin_marks_session_in_list(app_client, make_user):
    user = make_user(email="sess-pin@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="mine")

    res = await app_client.patch(
        "/api/session/mine/pin",
        headers=_pro_headers(user),
        json={"pinned": True},
    )
    assert res.status_code == 200
    assert res.json() == {
        "status": "pinned",
        "session_id": "mine",
        "pinned": True,
    }

    listing = await app_client.get("/api/sessions", headers=_pro_headers(user))
    assert listing.json()["sessions"][0]["pinned"] is True


@pytest.mark.asyncio
async def test_unpin_clears_session_flag(app_client, make_user):
    user = make_user(email="sess-unpin@test.com", tier=UserTier.PRO)
    state = _seed_in_memory(user.id, session_id="mine")
    state["session_pinned"] = True

    res = await app_client.patch(
        "/api/session/mine/pin",
        headers=_pro_headers(user),
        json={"pinned": False},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "unpinned"
    assert res.json()["pinned"] is False

    listing = await app_client.get("/api/sessions", headers=_pro_headers(user))
    assert listing.json()["sessions"][0]["pinned"] is False


@pytest.mark.asyncio
async def test_unpinned_sessions_default_to_false_in_list(app_client, make_user):
    user = make_user(email="sess-pin-default@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="mine")

    listing = await app_client.get("/api/sessions", headers=_pro_headers(user))
    assert listing.json()["sessions"][0]["pinned"] is False


@pytest.mark.asyncio
async def test_pin_404_for_foreign_session(app_client, make_user):
    alice = make_user(email="sess-pin-a@test.com", tier=UserTier.PRO)
    bob = make_user(email="sess-pin-b@test.com", tier=UserTier.PRO)
    _seed_in_memory(alice.id, session_id="alice-1")

    res = await app_client.patch(
        "/api/session/alice-1/pin",
        headers=_pro_headers(bob),
        json={"pinned": True},
    )
    assert res.status_code == 404

    listing = await app_client.get("/api/sessions", headers=_pro_headers(alice))
    assert listing.json()["sessions"][0]["pinned"] is False


@pytest.mark.asyncio
async def test_pin_404_for_missing_session(app_client, make_user):
    user = make_user(email="sess-pin-miss@test.com", tier=UserTier.PRO)
    res = await app_client.patch(
        "/api/session/never-existed/pin",
        headers=_pro_headers(user),
        json={"pinned": True},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_pin_rejects_non_boolean_body(app_client, make_user):
    user = make_user(email="sess-pin-bool@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="mine")
    res = await app_client.patch(
        "/api/session/mine/pin",
        headers=_pro_headers(user),
        json={"pinned": "not-a-boolean"},
    )
    assert res.status_code == 422


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


@pytest.mark.asyncio
async def test_delete_selected_only_removes_requested_owned_sessions(
    app_client, make_user
):
    """Bulk delete must remove exactly the requested owned sessions and
    leave unselected and foreign sessions alone."""
    alice = make_user(email="sess-bulk-sel-a@test.com", tier=UserTier.PRO)
    bob = make_user(email="sess-bulk-sel-b@test.com", tier=UserTier.PRO)
    _seed_in_memory(alice.id, session_id="a-1")
    _seed_in_memory(alice.id, session_id="a-2")
    _seed_in_memory(alice.id, session_id="a-keep")
    _seed_in_memory(bob.id, session_id="b-1")

    res = await app_client.request(
        "DELETE",
        "/api/sessions/bulk",
        headers=_pro_headers(alice),
        json={"session_ids": ["a-1", "a-2", "b-1", "missing"]},
    )
    assert res.status_code == 200
    assert res.json() == {
        "status": "deleted",
        "deleted": 2,
        "deleted_ids": ["a-1", "a-2"],
    }

    listing = await app_client.get("/api/sessions", headers=_pro_headers(alice))
    sids = {s["session_id"] for s in listing.json()["sessions"]}
    assert sids == {"a-keep"}

    listing = await app_client.get("/api/sessions", headers=_pro_headers(bob))
    sids = {s["session_id"] for s in listing.json()["sessions"]}
    assert sids == {"b-1"}


@pytest.mark.asyncio
async def test_delete_selected_deduplicates_and_accepts_empty_result(
    app_client, make_user
):
    user = make_user(email="sess-bulk-sel-dedup@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="mine")

    res = await app_client.request(
        "DELETE",
        "/api/sessions/bulk",
        headers=_pro_headers(user),
        json={"session_ids": ["mine", "mine", "ghost"]},
    )
    assert res.status_code == 200
    assert res.json() == {
        "status": "deleted",
        "deleted": 1,
        "deleted_ids": ["mine"],
    }

    # Only missing/foreign ids are a successful no-op, never an error.
    res = await app_client.request(
        "DELETE",
        "/api/sessions/bulk",
        headers=_pro_headers(user),
        json={"session_ids": ["ghost"]},
    )
    assert res.status_code == 200
    assert res.json()["deleted"] == 0
    assert res.json()["deleted_ids"] == []


@pytest.mark.asyncio
async def test_delete_selected_rejects_empty_or_overlong_id_lists(app_client, make_user):
    user = make_user(email="sess-bulk-sel-bounds@test.com", tier=UserTier.PRO)

    res = await app_client.request(
        "DELETE",
        "/api/sessions/bulk",
        headers=_pro_headers(user),
        json={"session_ids": []},
    )
    assert res.status_code == 422

    res = await app_client.request(
        "DELETE",
        "/api/sessions/bulk",
        headers=_pro_headers(user),
        json={"session_ids": [f"x{i}" for i in range(101)]},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_delete_selected_clears_persona_integrity_history(
    app_client, make_user
):
    """Selected bulk delete must drop drift history for removed sessions
    while preserving history for sessions that were not selected."""
    user = make_user(email="sess-bulk-sel-drift@test.com", tier=UserTier.PRO)
    from arena.core import persona_integrity

    _seed_in_memory(user.id, session_id="remove-me")
    _seed_in_memory(user.id, session_id="keep-me")
    persona_integrity.record_response("agent_1", "v", "remove-me")
    persona_integrity.record_response("agent_1", "v", "keep-me")

    res = await app_client.request(
        "DELETE",
        "/api/sessions/bulk",
        headers=_pro_headers(user),
        json={"session_ids": ["remove-me"]},
    )
    assert res.status_code == 200
    assert res.json()["deleted_ids"] == ["remove-me"]

    assert "remove-me" not in persona_integrity._session_history
    assert "keep-me" in persona_integrity._session_history


# ─── Bulk pin / unpin ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_pin_only_updates_requested_owned_sessions(
    app_client, make_user
):
    """Bulk pin must flip exactly the requested owned sessions and leave
    unselected, foreign, and missing sessions alone."""
    alice = make_user(email="sess-bulk-pin-a@test.com", tier=UserTier.PRO)
    bob = make_user(email="sess-bulk-pin-b@test.com", tier=UserTier.PRO)
    _seed_in_memory(alice.id, session_id="a-1")
    _seed_in_memory(alice.id, session_id="a-2")
    _seed_in_memory(alice.id, session_id="a-keep")
    _seed_in_memory(bob.id, session_id="b-1")

    res = await app_client.patch(
        "/api/sessions/bulk/pin",
        headers=_pro_headers(alice),
        json={
            "session_ids": ["a-1", "a-2", "b-1", "missing"],
            "pinned": True,
        },
    )
    assert res.status_code == 200
    assert res.json() == {
        "status": "pinned",
        "updated": 2,
        "updated_ids": ["a-1", "a-2"],
    }

    listing = await app_client.get("/api/sessions", headers=_pro_headers(alice))
    by_id = {row["session_id"]: row for row in listing.json()["sessions"]}
    assert by_id["a-1"]["pinned"] is True
    assert by_id["a-2"]["pinned"] is True
    assert by_id["a-keep"]["pinned"] is False

    listing = await app_client.get("/api/sessions", headers=_pro_headers(bob))
    assert listing.json()["sessions"][0]["pinned"] is False


@pytest.mark.asyncio
async def test_bulk_unpin_clears_selected_flags(app_client, make_user):
    user = make_user(email="sess-bulk-unpin@test.com", tier=UserTier.PRO)
    state_a = _seed_in_memory(user.id, session_id="a-1")
    state_b = _seed_in_memory(user.id, session_id="a-2")
    state_keep = _seed_in_memory(user.id, session_id="keep")
    state_a["session_pinned"] = True
    state_b["session_pinned"] = True
    state_keep["session_pinned"] = True

    res = await app_client.patch(
        "/api/sessions/bulk/pin",
        headers=_pro_headers(user),
        json={"session_ids": ["a-1", "a-2"], "pinned": False},
    )
    assert res.status_code == 200
    assert res.json() == {
        "status": "unpinned",
        "updated": 2,
        "updated_ids": ["a-1", "a-2"],
    }

    listing = await app_client.get("/api/sessions", headers=_pro_headers(user))
    by_id = {row["session_id"]: row for row in listing.json()["sessions"]}
    assert by_id["a-1"]["pinned"] is False
    assert by_id["a-2"]["pinned"] is False
    assert by_id["keep"]["pinned"] is True


@pytest.mark.asyncio
async def test_bulk_pin_deduplicates_and_accepts_empty_result(
    app_client, make_user
):
    user = make_user(email="sess-bulk-pin-dedup@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="mine")

    res = await app_client.patch(
        "/api/sessions/bulk/pin",
        headers=_pro_headers(user),
        json={"session_ids": ["mine", "mine", "ghost"], "pinned": True},
    )
    assert res.status_code == 200
    assert res.json() == {
        "status": "pinned",
        "updated": 1,
        "updated_ids": ["mine"],
    }

    # Only missing/foreign ids are a successful no-op, never an error.
    res = await app_client.patch(
        "/api/sessions/bulk/pin",
        headers=_pro_headers(user),
        json={"session_ids": ["ghost"], "pinned": True},
    )
    assert res.status_code == 200
    assert res.json()["updated"] == 0
    assert res.json()["updated_ids"] == []


@pytest.mark.asyncio
async def test_bulk_pin_rejects_bad_lists_and_pinned_type(app_client, make_user):
    user = make_user(email="sess-bulk-pin-bounds@test.com", tier=UserTier.PRO)
    _seed_in_memory(user.id, session_id="mine")

    res = await app_client.patch(
        "/api/sessions/bulk/pin",
        headers=_pro_headers(user),
        json={"session_ids": [], "pinned": True},
    )
    assert res.status_code == 422

    res = await app_client.patch(
        "/api/sessions/bulk/pin",
        headers=_pro_headers(user),
        json={"session_ids": [f"x{i}" for i in range(101)], "pinned": True},
    )
    assert res.status_code == 422

    res = await app_client.patch(
        "/api/sessions/bulk/pin",
        headers=_pro_headers(user),
        json={"session_ids": ["mine"], "pinned": "not-a-boolean"},
    )
    assert res.status_code == 422


# ─── Auth ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_session_endpoints_require_auth(app_client):
    for method, path in [
        ("GET", "/api/sessions"),
        ("PATCH", "/api/session/x"),
        ("POST", "/api/session/x/duplicate"),
        ("POST", "/api/sessions/bulk/duplicate"),
        ("PATCH", "/api/session/x/pin"),
        ("DELETE", "/api/session/x"),
        ("DELETE", "/api/sessions"),
        ("DELETE", "/api/sessions/bulk"),
        ("PATCH", "/api/sessions/bulk/pin"),
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
