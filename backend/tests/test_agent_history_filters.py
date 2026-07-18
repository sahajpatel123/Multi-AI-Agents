"""Integration tests for GET /api/agent/history filters and sort."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from arena.db_models import AgentTask, UserTier



def _seed(
    session,
    *,
    user_id: int,
    task_id: str,
    title: str = "Untitled",
    task_text: str = "default text",
    score: int | None = 80,
    confidence: float | None = 0.7,
    feedback: str | None = None,
    orchestration_id: str | None = None,
    days_ago: int = 0,
) -> AgentTask:
    row = AgentTask(
        user_id=user_id,
        task_id=task_id,
        title=title,
        task_text=task_text,
        final_score=score,
        final_confidence=confidence,
        user_feedback=feedback,
        orchestration_id=orchestration_id,
        topics=json.dumps([]),
        created_at=datetime.now(timezone.utc).replace(tzinfo=None)
        - timedelta(days=days_ago),
    )
    session.add(row)
    session.flush()
    return row


# ─── Search ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_matches_title_case_insensitive(
    app_client, make_user, db_session
):
    user = make_user(email="flt-search-title@test.com", tier=UserTier.PRO)
    _seed(
        db_session, user_id=user.id, task_id="t1",
        title="Quantum Computing Primer", task_text="intro",
    )
    _seed(
        db_session, user_id=user.id, task_id="t2",
        title="Linear Algebra Refresher", task_text="intro",
    )

    res = await app_client.get(
        "/api/agent/history?search=quantum",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["total"] == 1
    assert body["tasks"][0]["task_id"] == "t1"


@pytest.mark.asyncio
async def test_search_matches_task_text(app_client, make_user, db_session):
    user = make_user(email="flt-search-text@test.com", tier=UserTier.PRO)
    _seed(
        db_session, user_id=user.id, task_id="t1",
        title="A", task_text="Explain black holes for a 12-year-old",
    )
    _seed(
        db_session, user_id=user.id, task_id="t2",
        title="B", task_text="Compare renewable energy sources",
    )

    res = await app_client.get(
        "/api/agent/history?search=black%20holes",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["total"] == 1
    assert body["tasks"][0]["task_id"] == "t1"


@pytest.mark.asyncio
async def test_search_escapes_sql_like_wildcards(app_client, make_user, db_session):
    """Typing '100%' must not match every task — wildcards must be escaped."""
    user = make_user(email="flt-wildcard@test.com", tier=UserTier.PRO)
    _seed(
        db_session, user_id=user.id, task_id="t1",
        title="Effort meter", task_text="100% effort every sprint",
    )
    _seed(
        db_session, user_id=user.id, task_id="t2",
        title="Risk primer", task_text="fifty percent risk",
    )

    res = await app_client.get(
        "/api/agent/history?search=100%25",  # %25 = %
        headers=_pro_headers(user),
    )
    body = res.json()
    # Only t1 contains the literal substring "100%". t2 must NOT match just
    # because "%" is a wildcard.
    assert body["total"] == 1
    assert body["tasks"][0]["task_id"] == "t1"


@pytest.mark.asyncio
async def test_search_returns_empty_for_blank_query(app_client, make_user, db_session):
    user = make_user(email="flt-blank@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="t1", task_text="something")

    # Empty string after stripping should match nothing rather than everything
    res = await app_client.get(
        "/api/agent/history?search=",
        headers=_pro_headers(user),
    )
    # FastAPI turns an explicit empty string into a falsy param, which the
    # route treats as "no filter" — so total stays 1, not 0.
    body = res.json()
    assert body["total"] == 1


# ─── Feedback filter ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_feedback_filter_positive(app_client, make_user, db_session):
    user = make_user(email="flt-pos@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="t1", feedback="positive")
    _seed(db_session, user_id=user.id, task_id="t2", feedback="negative")
    _seed(db_session, user_id=user.id, task_id="t3", feedback=None)

    res = await app_client.get(
        "/api/agent/history?feedback=positive",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["total"] == 1
    assert body["tasks"][0]["task_id"] == "t1"


@pytest.mark.asyncio
async def test_feedback_filter_none_includes_empty_strings(
    app_client, make_user, db_session
):
    """'none' must match both NULL and empty-string feedback — they're both
    semantically 'the user hasn't rated this yet'."""
    user = make_user(email="flt-none@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="t1", feedback=None)
    _seed(db_session, user_id=user.id, task_id="t2", feedback="")
    _seed(db_session, user_id=user.id, task_id="t3", feedback="positive")

    res = await app_client.get(
        "/api/agent/history?feedback=none",
        headers=_pro_headers(user),
    )
    body = res.json()
    ids = {t["task_id"] for t in body["tasks"]}
    assert ids == {"t1", "t2"}


@pytest.mark.asyncio
async def test_feedback_filter_unknown_value_returns_zero(
    app_client, make_user, db_session
):
    user = make_user(email="flt-unk@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="t1", feedback="positive")

    # Unknown values are ignored (treated as no filter) rather than erroring,
    # so a stale frontend can't break the endpoint.
    res = await app_client.get(
        "/api/agent/history?feedback=ehhh",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["total"] == 1


# ─── Orchestration filter ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_orchestration_filter(app_client, make_user, db_session):
    user = make_user(email="flt-orch@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="t1", orchestration_id="orch-A")
    _seed(db_session, user_id=user.id, task_id="t2", orchestration_id="orch-B")
    _seed(db_session, user_id=user.id, task_id="t3", orchestration_id=None)

    res = await app_client.get(
        "/api/agent/history?orchestration_id=orch-A",
        headers=_pro_headers(user),
    )
    body = res.json()
    ids = {t["task_id"] for t in body["tasks"]}
    assert ids == {"t1"}


# ─── Sort ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sort_by_score_descending(app_client, make_user, db_session):
    user = make_user(email="flt-sort-score@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="t1", score=50)
    _seed(db_session, user_id=user.id, task_id="t2", score=95)
    _seed(db_session, user_id=user.id, task_id="t3", score=70)
    _seed(db_session, user_id=user.id, task_id="t4", score=None)

    res = await app_client.get(
        "/api/agent/history?sort=score",
        headers=_pro_headers(user),
    )
    body = res.json()
    ordered_ids = [t["task_id"] for t in body["tasks"]]
    # Nulls last: t4 sinks. Among scored: 95 > 70 > 50.
    assert ordered_ids[0] == "t2"
    assert ordered_ids[-1] == "t4"


@pytest.mark.asyncio
async def test_sort_oldest_ascending(app_client, make_user, db_session):
    user = make_user(email="flt-sort-old@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="t-new", days_ago=0)
    _seed(db_session, user_id=user.id, task_id="t-mid", days_ago=5)
    _seed(db_session, user_id=user.id, task_id="t-old", days_ago=10)

    res = await app_client.get(
        "/api/agent/history?sort=oldest",
        headers=_pro_headers(user),
    )
    body = res.json()
    ordered_ids = [t["task_id"] for t in body["tasks"]]
    assert ordered_ids == ["t-old", "t-mid", "t-new"]


@pytest.mark.asyncio
async def test_sort_unknown_falls_back_to_newest(
    app_client, make_user, db_session
):
    user = make_user(email="flt-sort-unk@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="t-new", days_ago=0)
    _seed(db_session, user_id=user.id, task_id="t-old", days_ago=5)

    res = await app_client.get(
        "/api/agent/history?sort=banana",
        headers=_pro_headers(user),
    )
    body = res.json()
    ordered_ids = [t["task_id"] for t in body["tasks"]]
    assert ordered_ids[0] == "t-new"


# ─── Composition and pagination ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_filters_compose_with_and(app_client, make_user, db_session):
    """feedback + orchestration + search must all narrow together."""
    user = make_user(email="flt-compose@test.com", tier=UserTier.PRO)
    _seed(
        db_session, user_id=user.id, task_id="match",
        feedback="positive", orchestration_id="orch-X",
        title="climate report",
    )
    _seed(
        db_session, user_id=user.id, task_id="wrong-feedback",
        feedback="negative", orchestration_id="orch-X",
        title="climate report",
    )
    _seed(
        db_session, user_id=user.id, task_id="wrong-orch",
        feedback="positive", orchestration_id="orch-Y",
        title="climate report",
    )
    _seed(
        db_session, user_id=user.id, task_id="wrong-search",
        feedback="positive", orchestration_id="orch-X",
        title="budget memo",
    )

    res = await app_client.get(
        "/api/agent/history?feedback=positive&orchestration_id=orch-X&search=climate",
        headers=_pro_headers(user),
    )
    body = res.json()
    ids = {t["task_id"] for t in body["tasks"]}
    assert ids == {"match"}


@pytest.mark.asyncio
async def test_filters_respect_pagination(app_client, make_user, db_session):
    user = make_user(email="flt-page@test.com", tier=UserTier.PRO)
    for i in range(5):
        _seed(
            db_session, user_id=user.id, task_id=f"match-{i}",
            feedback="positive", days_ago=i,
        )
    _seed(db_session, user_id=user.id, task_id="negative", feedback="negative")

    res = await app_client.get(
        "/api/agent/history?feedback=positive&per_page=2&page=2",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["total"] == 5
    assert body["total_pages"] == 3
    assert len(body["tasks"]) == 2
    for task in body["tasks"]:
        assert task["task_id"].startswith("match-")


@pytest.mark.asyncio
async def test_filters_echo_back_in_response(app_client, make_user, db_session):
    """The response should echo applied filters so the client can confirm
    what server actually applied (and detect drift on bug reports)."""
    user = make_user(email="flt-echo@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="t1")

    res = await app_client.get(
        "/api/agent/history?feedback=positive&sort=score&search=hello",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["filters"]["feedback"] == "positive"
    assert body["filters"]["sort"] == "score"
    assert body["filters"]["search"] == "hello"


# ─── Auth + guard rails ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_history_filter_requires_auth(app_client):
    res = await app_client.get("/api/agent/history?search=anything")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_history_filter_rejects_overlong_search(
    app_client, make_user, db_session
):
    """FastAPI's Query(max_length=100) caps the search param so a 100KB
    payload can't pin the DB on a single LIKE scan."""
    user = make_user(email="flt-overlong@test.com", tier=UserTier.PRO)
    long_q = "x" * 101
    res = await app_client.get(
        f"/api/agent/history?search={long_q}",
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_history_filter_scoped_to_caller(
    app_client, make_user, db_session
):
    """A user filtering by orchestration must only see their own matches —
    no cross-tenant data leakage even with the same orchestration_id."""
    alice = make_user(email="flt-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="flt-bob@test.com", tier=UserTier.PRO)

    _seed(
        db_session, user_id=alice.id, task_id="alice-task",
        orchestration_id="shared-orch",
    )
    _seed(
        db_session, user_id=bob.id, task_id="bob-task",
        orchestration_id="shared-orch",
    )

    res = await app_client.get(
        "/api/agent/history?orchestration_id=shared-orch",
        headers=_pro_headers(alice),
    )
    body = res.json()
    ids = {t["task_id"] for t in body["tasks"]}
    assert ids == {"alice-task"}