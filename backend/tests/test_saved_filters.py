"""Integration tests for /api/saved search, filter, sort, and bulk delete."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import SavedResponse, UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed(
    db,
    *,
    user_id: int,
    prompt: str,
    one_liner: str = "",
    persona_id: str = "analyst",
    score: int | None = 80,
    confidence: int | None = 70,
    session_id: str = "sess-1",
    agent_id: str = "agent-A",
):
    return SavedResponse(
        user_id=user_id,
        session_id=session_id,
        agent_id=agent_id,
        persona_id=persona_id,
        persona_name=persona_id.title(),
        persona_color="#fff",
        prompt=prompt,
        one_liner=one_liner or prompt[:80],
        verdict="verdict body",
        score=score,
        confidence=confidence,
    )


# ─── Envelope shape ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_returns_envelope_with_items_key(app_client, make_user, db_session):
    user = make_user(email="saved-envelope@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=user.id, prompt="hello"))
    db_session.commit()

    res = await app_client.get("/api/saved", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, dict)
    assert "items" in body
    assert isinstance(body["items"], list)
    assert body["total"] >= 1


@pytest.mark.asyncio
async def test_get_empty_envelope_for_free_tier(app_client, make_user):
    """Free tier must see empty list (existing contract) — NOT 403 — so
    silent gates in the UI don't have to special-case."""
    user = make_user(email="saved-free@test.com", tier=UserTier.FREE)
    res = await app_client.get("/api/saved", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert body["items"] == []
    assert body["total"] == 0


# ─── Search ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_matches_prompt(app_client, make_user, db_session):
    user = make_user(email="search-prompt@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=user.id, prompt="quantum computing intro"))
    db_session.add(_seed(db_session, user_id=user.id, prompt="renewable energy basics"))
    db_session.commit()

    res = await app_client.get(
        "/api/saved?search=quantum", headers=_pro_headers(user)
    )
    body = res.json()
    ids = {item["prompt"] for item in body["items"]}
    assert "quantum computing intro" in ids
    assert "renewable energy basics" not in ids


@pytest.mark.asyncio
async def test_search_matches_one_liner(app_client, make_user, db_session):
    user = make_user(email="search-oneliner@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=user.id, prompt="x", one_liner="alpha wins"))
    db_session.add(_seed(db_session, user_id=user.id, prompt="y", one_liner="beta loses"))
    db_session.commit()

    res = await app_client.get(
        "/api/saved?search=alpha", headers=_pro_headers(user)
    )
    body = res.json()
    prompts = {item["prompt"] for item in body["items"]}
    assert prompts == {"x"}


@pytest.mark.asyncio
async def test_search_escapes_like_wildcards(app_client, make_user, db_session):
    """Typing '100%' must NOT match every row."""
    user = make_user(email="search-wild@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=user.id, prompt="100% effort sprint"))
    db_session.add(_seed(db_session, user_id=user.id, prompt="fifty percent"))
    db_session.commit()

    res = await app_client.get(
        "/api/saved?search=100%25", headers=_pro_headers(user)
    )
    body = res.json()
    prompts = {item["prompt"] for item in body["items"]}
    assert prompts == {"100% effort sprint"}


@pytest.mark.asyncio
async def test_search_rejects_overlong_input(app_client, make_user):
    user = make_user(email="search-overlong@test.com", tier=UserTier.PLUS)
    res = await app_client.get(
        f"/api/saved?search={'x' * 200}", headers=_pro_headers(user)
    )
    assert res.status_code == 422


# ─── Filter ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_persona_filter(app_client, make_user, db_session):
    user = make_user(email="filter-persona@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=user.id, prompt="a", persona_id="analyst"))
    db_session.add(_seed(db_session, user_id=user.id, prompt="b", persona_id="philosopher"))
    db_session.commit()

    res = await app_client.get(
        "/api/saved?persona_id=philosopher", headers=_pro_headers(user)
    )
    body = res.json()
    personas = {item["persona_id"] for item in body["items"]}
    assert personas == {"philosopher"}


@pytest.mark.asyncio
async def test_min_score_filter(app_client, make_user, db_session):
    user = make_user(email="filter-score@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=user.id, prompt="a", score=50))
    db_session.add(_seed(db_session, user_id=user.id, prompt="b", score=85))
    db_session.add(_seed(db_session, user_id=user.id, prompt="c", score=95))
    db_session.commit()

    res = await app_client.get(
        "/api/saved?min_score=80", headers=_pro_headers(user)
    )
    body = res.json()
    prompts = {item["prompt"] for item in body["items"]}
    assert prompts == {"b", "c"}


@pytest.mark.asyncio
async def test_min_score_rejects_out_of_range(app_client, make_user):
    user = make_user(email="filter-bad-score@test.com", tier=UserTier.PLUS)
    res = await app_client.get(
        "/api/saved?min_score=200", headers=_pro_headers(user)
    )
    assert res.status_code == 422


# ─── Sort ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sort_by_score_descending(app_client, make_user, db_session):
    user = make_user(email="sort-score@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=user.id, prompt="low", score=30))
    db_session.add(_seed(db_session, user_id=user.id, prompt="high", score=95))
    db_session.add(_seed(db_session, user_id=user.id, prompt="mid", score=70))
    db_session.add(_seed(db_session, user_id=user.id, prompt="none", score=None))
    db_session.commit()

    res = await app_client.get(
        "/api/saved?sort=score", headers=_pro_headers(user)
    )
    body = res.json()
    ordered = [item["prompt"] for item in body["items"]]
    # Nulls last: 'none' sinks. Scored: 95 > 70 > 30.
    assert ordered[0] == "high"
    assert ordered[-1] == "none"


@pytest.mark.asyncio
async def test_sort_unknown_falls_back_to_newest(
    app_client, make_user, db_session
):
    user = make_user(email="sort-unknown@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=user.id, prompt="a"))
    db_session.commit()
    res = await app_client.get(
        "/api/saved?sort=banana", headers=_pro_headers(user)
    )
    # No 400 — unknown sort falls back to newest.
    assert res.status_code == 200


# ─── Composition + pagination ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_filters_compose_with_and(
    app_client, make_user, db_session
):
    user = make_user(email="compose@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=user.id, prompt="quantum primer", persona_id="analyst", score=90))
    db_session.add(_seed(db_session, user_id=user.id, prompt="quantum intro", persona_id="philosopher", score=90))
    db_session.add(_seed(db_session, user_id=user.id, prompt="budget memo", persona_id="analyst", score=90))
    db_session.add(_seed(db_session, user_id=user.id, prompt="quantum draft", persona_id="analyst", score=40))
    db_session.commit()

    res = await app_client.get(
        "/api/saved?search=quantum&persona_id=analyst&min_score=80",
        headers=_pro_headers(user),
    )
    body = res.json()
    prompts = {item["prompt"] for item in body["items"]}
    assert prompts == {"quantum primer"}


@pytest.mark.asyncio
async def test_pagination_works(app_client, make_user, db_session):
    user = make_user(email="page@test.com", tier=UserTier.PLUS)
    for i in range(5):
        db_session.add(_seed(db_session, user_id=user.id, prompt=f"p{i}"))
    db_session.commit()

    res = await app_client.get(
        "/api/saved?per_page=2&page=2", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["total"] == 5
    assert body["total_pages"] == 3
    assert len(body["items"]) == 2


@pytest.mark.asyncio
async def test_filters_echo_back_in_response(
    app_client, make_user, db_session
):
    user = make_user(email="echo@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=user.id, prompt="hi"))
    db_session.commit()
    res = await app_client.get(
        "/api/saved?search=hi&persona_id=analyst&min_score=50&sort=score",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["filters"]["search"] == "hi"
    assert body["filters"]["persona_id"] == "analyst"
    assert body["filters"]["min_score"] == 50
    assert body["filters"]["sort"] == "score"


# ─── Tenant isolation ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_only_returns_caller_items(
    app_client, make_user, db_session
):
    alice = make_user(email="alice-iso@test.com", tier=UserTier.PLUS)
    bob = make_user(email="bob-iso@test.com", tier=UserTier.PLUS)
    db_session.add(_seed(db_session, user_id=alice.id, prompt="alice quantum"))
    db_session.add(_seed(db_session, user_id=bob.id, prompt="bob quantum"))
    db_session.commit()

    res = await app_client.get(
        "/api/saved?search=quantum", headers=_pro_headers(alice)
    )
    body = res.json()
    prompts = {item["prompt"] for item in body["items"]}
    assert prompts == {"alice quantum"}


# ─── Bulk delete ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_delete_removes_owned_rows(
    app_client, make_user, db_session
):
    user = make_user(email="bulk-ok@test.com", tier=UserTier.PLUS)
    r1 = _seed(db_session, user_id=user.id, prompt="a")
    r2 = _seed(db_session, user_id=user.id, prompt="b")
    r3 = _seed(db_session, user_id=user.id, prompt="c")
    db_session.add_all([r1, r2, r3])
    db_session.commit()
    db_session.refresh(r1); db_session.refresh(r2); db_session.refresh(r3)

    res = await app_client.request(
        "DELETE",
        "/api/saved/bulk",
        json={"ids": [r1.id, r2.id, r3.id]},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "deleted"
    assert body["requested"] == 3
    assert body["deleted"] == 3

    # Verify they're gone.
    listing = await app_client.get("/api/saved", headers=_pro_headers(user))
    assert listing.json()["total"] == 0


@pytest.mark.asyncio
async def test_bulk_delete_drops_foreign_ids(
    app_client, make_user, db_session
):
    """Foreign ids must NOT be deleted — only owned rows. The response
    should report requested vs deleted so the UI sees the discrepancy."""
    alice = make_user(email="bulk-alice@test.com", tier=UserTier.PLUS)
    bob = make_user(email="bulk-bob@test.com", tier=UserTier.PLUS)
    alice_row = _seed(db_session, user_id=alice.id, prompt="alice")
    bob_row = _seed(db_session, user_id=bob.id, prompt="bob")
    db_session.add_all([alice_row, bob_row])
    db_session.commit()
    db_session.refresh(alice_row); db_session.refresh(bob_row)

    # Alice tries to delete both her own and Bob's.
    res = await app_client.request(
        "DELETE",
        "/api/saved/bulk",
        json={"ids": [alice_row.id, bob_row.id]},
        headers=_pro_headers(alice),
    )
    body = res.json()
    assert body["requested"] == 2
    assert body["deleted"] == 1  # only her own row

    # Bob's row is still there.
    listing = await app_client.get("/api/saved", headers=_pro_headers(bob))
    assert listing.json()["total"] == 1


@pytest.mark.asyncio
async def test_bulk_delete_rejects_free_tier(app_client, make_user):
    user = make_user(email="bulk-free@test.com", tier=UserTier.FREE)
    res = await app_client.request(
        "DELETE",
        "/api/saved/bulk",
        json={"ids": [1, 2, 3]},
        headers=_pro_headers(user),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_bulk_delete_rejects_empty_list(
    app_client, make_user
):
    user = make_user(email="bulk-empty@test.com", tier=UserTier.PLUS)
    res = await app_client.request(
        "DELETE",
        "/api/saved/bulk",
        json={"ids": []},
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_bulk_delete_rejects_over_cap(
    app_client, make_user
):
    user = make_user(email="bulk-cap@test.com", tier=UserTier.PLUS)
    res = await app_client.request(
        "DELETE",
        "/api/saved/bulk",
        json={"ids": list(range(1, 100))},
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_bulk_delete_dedupes_repeated_ids(
    app_client, make_user, db_session
):
    """If a UI bug fires the same id twice, requested should reflect
    de-duplicated count, not the duplicate count."""
    user = make_user(email="bulk-dup@test.com", tier=UserTier.PLUS)
    r1 = _seed(db_session, user_id=user.id, prompt="a")
    db_session.add(r1)
    db_session.commit()
    db_session.refresh(r1)

    res = await app_client.request(
        "DELETE",
        "/api/saved/bulk",
        json={"ids": [r1.id, r1.id, r1.id]},
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["requested"] == 1  # deduped
    assert body["deleted"] == 1


@pytest.mark.asyncio
async def test_bulk_delete_requires_auth(app_client):
    res = await app_client.request(
        "DELETE",
        "/api/saved/bulk",
        json={"ids": [1]},
    )
    assert res.status_code == 401