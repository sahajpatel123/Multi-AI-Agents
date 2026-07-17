"""Integration tests for /api/discuss thread persistence."""

from __future__ import annotations

import json

import pytest

from arena.core.auth import create_access_token
from arena.db_models import DiscussThread, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed(
    db,
    *,
    user_id: int,
    agent_id: str = "claude-sonnet",
    title: str = "Default Title",
    messages: list | None = None,
    original_prompt: str = "original Q",
    original_verdict: str = "original A",
):
    """Insert a DiscussThread row. SQLite stores JSON columns as TEXT,
    so we serialize the messages list with json.dumps. SQLAlchemy will
    auto-deserialize on read."""
    return DiscussThread(
        user_id=user_id,
        agent_id=agent_id,
        title=title,
        messages=json.dumps(messages or []),
        original_prompt=original_prompt,
        original_verdict=original_verdict,
    )


# ─── List ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_returns_envelope_with_threads_key(app_client, make_user, db_session):
    user = make_user(email="discuss-list@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=user.id, title="t1"))
    db_session.add(_seed(db_session, user_id=user.id, title="t2"))
    db_session.commit()

    res = await app_client.get("/api/discuss/threads", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, dict)
    assert "threads" in body
    assert body["total"] == 2


@pytest.mark.asyncio
async def test_list_omits_messages_array(app_client, make_user, db_session):
    """List rows must NOT include the full messages JSON — that's the
    detail endpoint's job. Stripping keeps the list payload small."""
    user = make_user(email="discuss-strip@test.com", tier=UserTier.PLUS)
    big_messages = [{"role": "user", "content": "x" * 5000, "timestamp": None} for _ in range(20)]
    db_session.add(_seed(db_session, user_id=user.id, messages=big_messages))
    db_session.commit()

    res = await app_client.get("/api/discuss/threads", headers=_pro_headers(user))
    body = res.json()
    row = body["threads"][0]
    assert "messages" not in row
    assert "message_count" in row
    assert row["message_count"] == 20


@pytest.mark.asyncio
async def test_list_free_tier_returns_empty(app_client, make_user, db_session):
    """Free tier must see empty list, not 403 — matches the silent-gate
    contract used by /api/memory/save and /api/saved."""
    user = make_user(email="discuss-free@test.com", tier=UserTier.FREE)
    db_session.add(_seed(db_session, user_id=user.id))
    db_session.commit()
    res = await app_client.get("/api/discuss/threads", headers=_pro_headers(user))
    body = res.json()
    assert body["threads"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_list_scoped_to_caller(app_client, make_user, db_session):
    alice = make_user(email="discuss-alice@test.com", tier=UserTier.PLUS)
    bob = make_user(email="discuss-bob@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=alice.id, title="alice-1"))
    db_session.add(_seed(db_session, user_id=bob.id, title="bob-1"))
    db_session.commit()

    res = await app_client.get("/api/discuss/threads", headers=_pro_headers(alice))
    body = res.json()
    titles = {t["title"] for t in body["threads"]}
    assert titles == {"alice-1"}


@pytest.mark.asyncio
async def test_list_agent_filter(app_client, make_user, db_session):
    user = make_user(email="discuss-agent@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=user.id, agent_id="claude-sonnet"))
    db_session.add(_seed(db_session, user_id=user.id, agent_id="gpt-4o"))
    db_session.commit()

    res = await app_client.get(
        "/api/discuss/threads?agent_id=claude-sonnet", headers=_pro_headers(user)
    )
    body = res.json()
    agents = {t["agent_id"] for t in body["threads"]}
    assert agents == {"claude-sonnet"}


@pytest.mark.asyncio
async def test_list_search_matches_title(app_client, make_user, db_session):
    user = make_user(email="discuss-search@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=user.id, title="quantum primer"))
    db_session.add(_seed(db_session, user_id=user.id, title="budget memo"))
    db_session.commit()

    res = await app_client.get(
        "/api/discuss/threads?search=quantum", headers=_pro_headers(user)
    )
    body = res.json()
    titles = {t["title"] for t in body["threads"]}
    assert titles == {"quantum primer"}


@pytest.mark.asyncio
async def test_list_search_escapes_wildcards(app_client, make_user, db_session):
    user = make_user(email="discuss-wild@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=user.id, title="100% effort"))
    db_session.add(_seed(db_session, user_id=user.id, title="fifty percent"))
    db_session.commit()

    res = await app_client.get(
        "/api/discuss/threads?search=100%25", headers=_pro_headers(user)
    )
    body = res.json()
    titles = {t["title"] for t in body["threads"]}
    assert titles == {"100% effort"}


@pytest.mark.asyncio
async def test_list_pagination(app_client, make_user, db_session):
    user = make_user(email="discuss-page@test.com", tier=UserTier.PLUS)
    for i in range(5):
        db_session.add(_seed(db_session, user_id=user.id, title=f"t{i}"))
    db_session.commit()

    res = await app_client.get(
        "/api/discuss/threads?per_page=2&page=2", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["total"] == 5
    assert body["total_pages"] == 3
    assert len(body["threads"]) == 2


@pytest.mark.asyncio
async def test_list_filters_echo_in_response(app_client, make_user):
    user = make_user(email="discuss-echo@test.com", tier=UserTier.PLUS)
    res = await app_client.get(
        "/api/discuss/threads?agent_id=claude-sonnet&search=hello",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["filters"]["agent_id"] == "claude-sonnet"
    assert body["filters"]["search"] == "hello"


# ─── Detail ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_detail_returns_full_body(app_client, make_user, db_session):
    user = make_user(email="discuss-detail@test.com", tier=UserTier.PLUS)
    row = _seed(
        db_session,
        user_id=user.id,
        title="t1",
        messages=[{"role": "user", "content": "hi", "timestamp": None}],
        original_prompt="ask",
        original_verdict="answer",
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)

    res = await app_client.get(
        f"/api/discuss/threads/{row.id}", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["title"] == "t1"
    assert body["messages"] == [{"role": "user", "content": "hi", "timestamp": None}]
    assert body["original_prompt"] == "ask"
    assert body["original_verdict"] == "answer"


@pytest.mark.asyncio
async def test_detail_404_for_foreign(app_client, make_user, db_session):
    user = make_user(email="discuss-detail-for@test.com", tier=UserTier.PLUS)
    other = make_user(email="discuss-detail-other@test.com", tier=UserTier.PLUS)
    row = _seed(db_session, user_id=other.id)
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    res = await app_client.get(
        f"/api/discuss/threads/{row.id}", headers=_pro_headers(user)
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_detail_404_for_missing(app_client, make_user):
    user = make_user(email="discuss-detail-miss@test.com", tier=UserTier.PLUS)
    res = await app_client.get("/api/discuss/threads/999999", headers=_pro_headers(user))
    assert res.status_code == 404


# ─── Save ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_save_persists_thread(app_client, make_user, db_session):
    user = make_user(email="discuss-save@test.com", tier=UserTier.PLUS)
    res = await app_client.post(
        "/api/discuss/threads",
        json={
            "agent_id": "claude-sonnet",
            "title": "My Thread",
            "messages": [
                {"role": "user", "content": "hello", "timestamp": None},
                {"role": "agent", "content": "hi back", "timestamp": None},
            ],
            "original_prompt": "ask",
            "original_verdict": "answer",
        },
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "saved"
    assert body["thread"]["title"] == "My Thread"
    assert body["thread"]["message_count"] == 2

    # Confirm it's persisted.
    listing = await app_client.get("/api/discuss/threads", headers=_pro_headers(user))
    assert listing.json()["total"] == 1


@pytest.mark.asyncio
async def test_save_rejects_free_tier(app_client, make_user):
    user = make_user(email="discuss-save-free@test.com", tier=UserTier.FREE)
    res = await app_client.post(
        "/api/discuss/threads",
        json={"agent_id": "claude-sonnet", "title": "x", "messages": []},
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_save_rejects_oversized_request_body(app_client, make_user):
    """The request_size middleware caps body at 10KB by default — a
    payload above that 413s before the route handler runs. The
    per-message validator cap is a second layer that catches single-
    message oversized requests that squeak under the global cap."""
    user = make_user(email="discuss-save-big@test.com", tier=UserTier.PLUS)
    res = await app_client.post(
        "/api/discuss/threads",
        json={
            "agent_id": "claude-sonnet",
            "title": "x",
            "messages": [{"role": "user", "content": "y" * 30000, "timestamp": None}],
        },
        headers=_pro_headers(user),
    )
    assert res.status_code == 413


@pytest.mark.asyncio
async def test_save_rejects_empty_agent_id(app_client, make_user):
    user = make_user(email="discuss-save-empty@test.com", tier=UserTier.PLUS)
    res = await app_client.post(
        "/api/discuss/threads",
        json={"agent_id": "", "title": "x", "messages": []},
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


# ─── Delete ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_removes_owned_thread(app_client, make_user, db_session):
    user = make_user(email="discuss-del@test.com", tier=UserTier.PLUS)
    row = _seed(db_session, user_id=user.id)
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)

    res = await app_client.delete(
        f"/api/discuss/threads/{row.id}", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    assert res.json() == {"status": "deleted", "id": row.id}

    listing = await app_client.get("/api/discuss/threads", headers=_pro_headers(user))
    assert listing.json()["total"] == 0


@pytest.mark.asyncio
async def test_delete_404_for_foreign(app_client, make_user, db_session):
    user = make_user(email="discuss-del-for@test.com", tier=UserTier.PLUS)
    other = make_user(email="discuss-del-other@test.com", tier=UserTier.PLUS)
    row = _seed(db_session, user_id=other.id)
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    res = await app_client.delete(
        f"/api/discuss/threads/{row.id}", headers=_pro_headers(user)
    )
    assert res.status_code == 404
    # Row preserved.
    listing = await app_client.get("/api/discuss/threads", headers=_pro_headers(other))
    assert listing.json()["total"] == 1


@pytest.mark.asyncio
async def test_delete_404_for_missing(app_client, make_user):
    user = make_user(email="discuss-del-miss@test.com", tier=UserTier.PLUS)
    res = await app_client.delete(
        "/api/discuss/threads/999999", headers=_pro_headers(user)
    )
    assert res.status_code == 404


# ─── Auth ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_discuss_thread_endpoints_require_auth(app_client):
    for method, path in [
        ("GET", "/api/discuss/threads"),
        ("GET", "/api/discuss/threads/1"),
        ("DELETE", "/api/discuss/threads/1"),
    ]:
        res = await app_client.request(method, path)
        assert res.status_code == 401, f"{method} {path} returned {res.status_code}"
    # POST needs a body.
    res = await app_client.request(
        "POST", "/api/discuss/threads",
        json={"agent_id": "x", "messages": []},
    )
    assert res.status_code == 401