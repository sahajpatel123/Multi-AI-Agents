"""Integration tests for GET /api/analytics/persona-stats/{persona_id}/by-category.

Companion to /analytics/persona-stats — returns the FULL per-category
distribution instead of collapsing to a single "best" field.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import ScoringAudit, UserTier


def _seed_audit(
    db,
    *,
    user_id: int,
    winner_persona_id: str,
    panel: list[str],
    category: str | None = "question",
    hours_ago: int = 1,
    fallback_used: bool = False,
) -> ScoringAudit:
    rec = ScoringAudit(
        session_id=str(uuid.uuid4()),
        user_id=user_id,
        prompt_snippet="x",
        winner_agent_id="agent-1",
        winner_persona_id=winner_persona_id,
        winner_score=80,
        scores={"agent-1": 80},
        persona_ids_used=panel,
        prompt_category=category,
        fallback_used=fallback_used,
        created_at=utcnow_naive() - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


# ─── Happy path ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_by_category_returns_persona_metadata(
    app_client, make_user, db_session
):
    user = make_user(email="pbc-meta@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["persona_id"] == "analyst"
    assert body["name"] == "The Analyst"
    assert body["total_appearances"] == 1
    assert body["total_wins"] == 1


@pytest.mark.asyncio
async def test_by_category_groups_by_category(app_client, make_user, db_session):
    user = make_user(email="pbc-groups@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # 3 question wins, 1 task win, 2 task losses
    for _ in range(3):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            category="question",
        )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        category="task",
    )
    for _ in range(2):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="philosopher",
            panel=panel,
            category="task",
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    body = res.json()
    by_cat = {row["category"]: row for row in body["categories"]}
    assert by_cat["question"]["appearances"] == 3
    assert by_cat["question"]["wins"] == 3
    assert by_cat["question"]["win_rate"] == 1.0
    assert by_cat["task"]["appearances"] == 3
    assert by_cat["task"]["wins"] == 1
    assert by_cat["task"]["win_rate"] == round(1 / 3, 4)


@pytest.mark.asyncio
async def test_by_category_recognized_categories_sorted_first(
    app_client, make_user, db_session
):
    """Recognized PromptCategory values appear first, in enum order."""
    user = make_user(email="pbc-order@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # Seed in reverse order so the assertion is meaningful.
    for cat in ["debate", "statement", "task", "question"]:
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            category=cat,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    categories = [row["category"] for row in res.json()["categories"]]
    # Enum order: question, task, statement, debate.
    assert categories == ["question", "task", "statement", "debate"]


@pytest.mark.asyncio
async def test_by_category_unknown_category_sorted_alphabetically(
    app_client, make_user, db_session
):
    """A category string that isn't in PromptCategory lands after the
    recognized ones, sorted alphabetically."""
    user = make_user(email="pbc-unknown@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for cat in ["zeta_thing", "alpha_thing", "question"]:
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            category=cat,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    categories = [row["category"] for row in res.json()["categories"]]
    assert categories == ["question", "alpha_thing", "zeta_thing"]


# ─── Uncategorized bucket ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_by_category_null_category_is_uncategorized_bucket(
    app_client, make_user, db_session
):
    """A row with prompt_category=None is bucketed as '(uncategorized)'
    so the parent total reconciles."""
    user = make_user(email="pbc-uncat@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst"],
        category=None,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["uncategorized_appearances"] == 1
    assert body["uncategorized_wins"] == 1
    by_cat = {row["category"]: row for row in body["categories"]}
    assert by_cat["(uncategorized)"]["appearances"] == 1
    assert by_cat["(uncategorized)"]["is_uncategorized"] is True
    assert by_cat["(uncategorized)"]["is_known_category"] is False


@pytest.mark.asyncio
async def test_by_category_uncategorized_pinned_last(
    app_client, make_user, db_session
):
    """The '(uncategorized)' row always lands at the end of the list,
    after both known and unknown categories."""
    user = make_user(email="pbc-uncat-last@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for cat in [None, "alpha_thing", "question"]:
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            category=cat,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    categories = [row["category"] for row in res.json()["categories"]]
    assert categories == ["question", "alpha_thing", "(uncategorized)"]


# ─── Honesty rules ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_by_category_fallback_wins_excluded(app_client, make_user, db_session):
    """A fallback winner (scorer LLM failed, index 0 wins) is arbitrary.
    The appearance still counts (the persona was on the panel) but the
    win does not — same rule as the parent endpoint. Same total
    appearances (4) as if those rows were real wins, but only 1 win
    credited (the real one)."""
    user = make_user(email="pbc-fb@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    for _ in range(3):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=["analyst"],
            fallback_used=True,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["total_appearances"] == 4
    assert body["total_wins"] == 1  # only the real win, not the 3 fallback ones


@pytest.mark.asyncio
async def test_by_category_excludes_no_panel_rows(
    app_client, make_user, db_session
):
    user = make_user(email="pbc-nopanel@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=None,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["total_appearances"] == 0
    assert body["total_wins"] == 0
    assert body["categories"] == []


# ─── Tenant + auth + input ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_by_category_scoped_to_caller(app_client, make_user, db_session):
    alice = make_user(email="pbc-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="pbc-bob@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=alice.id, winner_persona_id="analyst", panel=["analyst"]
    )
    for _ in range(3):
        _seed_audit(
            db_session, user_id=bob.id, winner_persona_id="analyst", panel=["analyst"]
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(alice),
    )
    body = res.json()
    assert body["total_appearances"] == 1
    assert body["total_wins"] == 1


@pytest.mark.asyncio
async def test_by_category_requires_auth(app_client):
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category"
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_by_category_unknown_persona_404(app_client, make_user):
    user = make_user(email="pbc-404@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/retired_mind/by-category",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_by_category_window_bounds_rejected(
    app_client, make_user
):
    user = make_user(email="pbc-bounds@test.com", tier=UserTier.PRO)
    for qs in ("window_days=0", "window_days=400"):
        res = await app_client.get(
            f"/api/analytics/persona-stats/analyst/by-category?{qs}",
            headers=_pro_headers(user),
        )
        assert res.status_code == 422, qs


# ─── Empty / new user ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_by_category_empty_for_new_user(app_client, make_user):
    user = make_user(email="pbc-new@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    body = res.json()
    assert body["total_appearances"] == 0
    assert body["total_wins"] == 0
    assert body["categories"] == []
    assert body["uncategorized_appearances"] == 0
    assert body["uncategorized_wins"] == 0


@pytest.mark.asyncio
async def test_by_category_totals_reconcile_to_parent(
    app_client, make_user, db_session
):
    """total_appearances / total_wins here must equal the same fields
    on the parent /persona-stats/{id} endpoint. Pinning this prevents
    the two endpoints from silently drifting apart."""
    user = make_user(email="pbc-recon@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for cat in ["question", "task", "debate", "statement", None]:
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst" if cat != "task" else "philosopher",
            panel=panel,
            category=cat,
        )
    db_session.commit()

    by_cat_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    parent_res = await app_client.get(
        "/api/analytics/persona-stats/analyst",
        headers=_pro_headers(user),
    )
    by_cat_body = by_cat_res.json()
    parent_body = parent_res.json()
    # Parent counts ALL appearances (incl. fallback); this endpoint
    # excludes fallback wins but still counts fallback appearances,
    # so total_appearances must match the parent.
    assert by_cat_body["total_appearances"] == parent_body["appearances"]
    # Wins count: parent excludes fallback, this endpoint excludes
    # fallback → match.
    assert by_cat_body["total_wins"] == parent_body["wins"]


@pytest.mark.asyncio
async def test_by_category_is_known_category_flag(app_client, make_user, db_session):
    user = make_user(email="pbc-known-flag@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for cat in ["question", "weird_legacy_category"]:
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            category=cat,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    by_cat = {row["category"]: row for row in res.json()["categories"]}
    assert by_cat["question"]["is_known_category"] is True
    assert by_cat["weird_legacy_category"]["is_known_category"] is False


# ─── Edge cases (polish pass) ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_by_category_all_four_recognized_categories(
    app_client, make_user, db_session
):
    """All four PromptCategory values in one response, each with its
    own win rate. Pins the per-category math across the full enum."""
    user = make_user(email="pbc-all4@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # 2/2 question wins, 1/2 task wins, 0/2 statement, 2/2 debate wins.
    for _ in range(2):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            category="question",
        )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        category="task",
    )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="philosopher",
        panel=panel,
        category="task",
    )
    for _ in range(2):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="philosopher",
            panel=panel,
            category="statement",
        )
    for _ in range(2):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            category="debate",
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    by_cat = {row["category"]: row for row in res.json()["categories"]}
    # 4 recognized categories, in enum order, none flagged as uncategorized.
    categories = [row["category"] for row in res.json()["categories"]]
    assert categories == ["question", "task", "statement", "debate"]
    assert by_cat["question"]["win_rate"] == 1.0  # 2/2
    assert by_cat["task"]["win_rate"] == 0.5  # 1/2
    assert by_cat["statement"]["win_rate"] == 0.0  # 0/2
    assert by_cat["debate"]["win_rate"] == 1.0  # 2/2
    # Appearances per category: 2 + 2 + 2 + 2 = 8. Wins: 2 + 1 + 0 + 2 = 5.
    assert res.json()["total_appearances"] == 8
    assert res.json()["total_wins"] == 5
    # Statement has 0 wins — must NOT be the "best" anywhere.
    assert by_cat["statement"]["wins"] == 0


@pytest.mark.asyncio
async def test_by_category_mixed_known_unknown_uncategorized(
    app_client, make_user, db_session
):
    """All three category flavors in one response, in the right slots.
    Pin the sort order: known → unknown alphabetical → uncategorized."""
    user = make_user(email="pbc-mixed@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # Seed in a deliberately mixed order.
    for cat in [None, "alpha_thing", "question", "zeta_thing", "task", ""]:
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            category=cat,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    body = res.json()
    categories = [row["category"] for row in body["categories"]]
    # 4 known → 2 unknown alphabetical → 1 uncategorized last.
    assert categories == [
        "question",
        "task",
        "alpha_thing",
        "zeta_thing",
        "(uncategorized)",
    ]
    # Uncat bucket holds both null and empty-string rows.
    by_cat = {row["category"]: row for row in body["categories"]}
    assert by_cat["(uncategorized)"]["appearances"] == 2
    assert body["uncategorized_appearances"] == 2
    # All wins here are real (no fallback), so every appearance is a win.
    assert by_cat["(uncategorized)"]["wins"] == 2


@pytest.mark.asyncio
async def test_by_category_fallback_reconciliation(
    app_client, make_user, db_session
):
    """Fallback wins: appearance counts, no win credit. Pin the math
    across multiple categories simultaneously so a future 'fix' to the
    fallback rule can't silently break one category and not another."""
    user = make_user(email="pbc-fb-recon@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # 1 real question win, 2 fallback question wins.
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        category="question",
    )
    for _ in range(2):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            category="question",
            fallback_used=True,
        )
    # 1 real task win, 1 fallback task win.
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        category="task",
    )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        category="task",
        fallback_used=True,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    by_cat = {row["category"]: row for row in res.json()["categories"]}
    # question: 3 appearances (1 real + 2 fallback), 1 win.
    assert by_cat["question"]["appearances"] == 3
    assert by_cat["question"]["wins"] == 1
    assert by_cat["question"]["win_rate"] == round(1 / 3, 4)
    # task: 2 appearances (1 real + 1 fallback), 1 win.
    assert by_cat["task"]["appearances"] == 2
    assert by_cat["task"]["wins"] == 1
    assert by_cat["task"]["win_rate"] == 0.5
    # Total: 5 appearances, 2 wins.
    assert res.json()["total_appearances"] == 5
    assert res.json()["total_wins"] == 2


@pytest.mark.asyncio
async def test_by_category_win_rate_rounding(
    app_client, make_user, db_session
):
    """win_rate is rounded to 4 decimals so it fits cleanly in a JSON
    number without 16-digit float noise. Pin the rounding behavior."""
    user = make_user(email="pbc-round@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # 1 win / 3 appearances = 0.3333... → rounds to 0.3333.
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        category="question",
    )
    for _ in range(2):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="philosopher",
            panel=panel,
            category="question",
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    by_cat = {row["category"]: row for row in res.json()["categories"]}
    rate = by_cat["question"]["win_rate"]
    assert rate == round(1 / 3, 4)
    assert rate == 0.3333
    # And the total_appearances still reconciles.
    assert by_cat["question"]["appearances"] == 3


@pytest.mark.asyncio
async def test_by_category_window_365_accepts_max(
    app_client, make_user, db_session
):
    """le=365 is reachable — the 422 is only above the cap, not at it."""
    user = make_user(email="pbc-365@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst"],
        hours_ago=24 * 300,  # 300 days ago — inside 365-day window
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category?window_days=365",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["window_days"] == 365
    assert body["total_appearances"] == 1


@pytest.mark.asyncio
async def test_by_category_long_category_string_handled(
    app_client, make_user, db_session
):
    """A category string can be arbitrarily long (the column is unbounded).
    The endpoint must accept and surface it without truncation or 500."""
    user = make_user(email="pbc-long@test.com", tier=UserTier.PRO)
    long_cat = "x" * 200
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst"],
        category=long_cat,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    body = res.json()
    by_cat = {row["category"]: row for row in body["categories"]}
    assert by_cat[long_cat]["appearances"] == 1
    assert by_cat[long_cat]["is_known_category"] is False  # not in the enum


@pytest.mark.asyncio
async def test_by_category_per_category_appearances_sum_to_total(
    app_client, make_user, db_session
):
    """Pin: sum(categories[].appearances) == total_appearances. A future
    optimization that filters categories must not silently drop rows."""
    user = make_user(email="pbc-sum@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # Mix known, unknown, null.
    for cat, n in [("question", 3), ("task", 2), ("legacy", 1), (None, 4)]:
        for _ in range(n):
            _seed_audit(
                db_session,
                user_id=user.id,
                winner_persona_id="analyst",
                panel=panel,
                category=cat,
            )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category",
        headers=_pro_headers(user),
    )
    body = res.json()
    summed = sum(row["appearances"] for row in body["categories"])
    assert summed == body["total_appearances"]
    # 3 + 2 + 1 + 4 = 10.
    assert body["total_appearances"] == 10
