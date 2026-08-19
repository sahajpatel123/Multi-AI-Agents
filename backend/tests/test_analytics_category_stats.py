"""Integration tests for GET /api/analytics/category-stats.

All-categories aggregate: how the caller's exchanges distribute
across prompt categories, plus per-category best persona.
"""

from __future__ import annotations

import csv
import io
import json
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
    score: int = 80,
    hours_ago: int = 1,
    fallback_used: bool = False,
) -> ScoringAudit:
    rec = ScoringAudit(
        session_id=str(uuid.uuid4()),
        user_id=user_id,
        prompt_snippet="x",
        winner_agent_id="agent-1",
        winner_persona_id=winner_persona_id,
        winner_score=score,
        scores={"agent-1": score},
        persona_ids_used=panel,
        prompt_category=category,
        fallback_used=fallback_used,
        created_at=utcnow_naive() - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


def _parse_csv(text: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(text)))


# ─── Happy path ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_category_stats_empty_for_new_user(app_client, make_user):
    user = make_user(email="cat-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    body = res.json()
    assert res.status_code == 200
    assert body["categories"] == []
    assert body["total_appearances"] == 0
    assert body["total_wins"] == 0
    assert body["most_active_category"] is None


@pytest.mark.asyncio
async def test_category_stats_groups_by_category(app_client, make_user, db_session):
    user = make_user(email="cat-group@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # 3 question wins, 1 task win.
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
        winner_persona_id="philosopher",
        panel=panel,
        category="task",
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    body = res.json()
    by_cat = {r["category"]: r for r in body["categories"]}
    assert by_cat["question"]["appearances"] == 3
    assert by_cat["question"]["wins"] == 3
    assert by_cat["question"]["win_rate"] == 1.0
    assert by_cat["task"]["appearances"] == 1
    assert by_cat["task"]["wins"] == 1
    assert by_cat["task"]["win_rate"] == 1.0


@pytest.mark.asyncio
async def test_category_stats_sort_order(app_client, make_user, db_session):
    """Recognized PromptCategory values appear first in enum order,
    then unknown categories alphabetically, then uncategorized last."""
    user = make_user(email="cat-sort@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for cat in [None, "alpha_thing", "task", "question"]:
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            category=cat,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    categories = [r["category"] for r in res.json()["categories"]]
    assert categories == ["question", "task", "alpha_thing", "(uncategorized)"]


@pytest.mark.asyncio
async def test_category_stats_avg_winning_score(app_client, make_user, db_session):
    user = make_user(email="cat-avg@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for score in [80, 90, 100]:
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="analyst",
            panel=panel,
            category="question",
            score=score,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    by_cat = {r["category"]: r for r in res.json()["categories"]}
    assert by_cat["question"]["avg_winning_score"] == 90.0


@pytest.mark.asyncio
async def test_category_stats_best_persona(app_client, make_user, db_session):
    """best_persona_id is the persona with the most wins in the category,
    with ties broken by appearances, then persona_id."""
    user = make_user(email="cat-best@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher", "pragmatist"]
    # In "question": analyst wins 3, philosopher wins 1, pragmatist 0.
    for _ in range(3):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
            category="question",
        )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel,
        category="question",
    )
    # In "task": philosopher wins 2 of 3.
    for _ in range(2):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel,
            category="task",
        )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
        category="task",
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    by_cat = {r["category"]: r for r in res.json()["categories"]}
    assert by_cat["question"]["best_persona_id"] == "analyst"
    assert by_cat["task"]["best_persona_id"] == "philosopher"


@pytest.mark.asyncio
async def test_category_stats_most_active(app_client, make_user, db_session):
    user = make_user(email="cat-active@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for _ in range(5):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
            category="question",
        )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel,
        category="task",
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    assert res.json()["most_active_category"] == "question"


# ─── Honesty rules ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_category_stats_excludes_fallback_wins(
    app_client, make_user, db_session
):
    """Fallback wins are arbitrary — exclude from wins but count
    the appearance. Same rule as the by-category endpoint."""
    user = make_user(email="cat-fb@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
        category="question",
    )
    for _ in range(3):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
            category="question", fallback_used=True,
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    by_cat = {r["category"]: r for r in res.json()["categories"]}
    assert by_cat["question"]["wins"] == 1
    assert by_cat["question"]["appearances"] == 4


@pytest.mark.asyncio
async def test_category_stats_null_category_is_uncategorized(
    app_client, make_user, db_session
):
    user = make_user(email="cat-null@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"],
        category=None,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    by_cat = {r["category"]: r for r in res.json()["categories"]}
    assert by_cat["(uncategorized)"]["appearances"] == 1
    assert by_cat["(uncategorized)"]["is_uncategorized"] is True
    assert by_cat["(uncategorized)"]["is_known_category"] is False


# ─── Tenant + auth + input ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_category_stats_scoped_to_caller(app_client, make_user, db_session):
    alice = make_user(email="cat-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="cat-bob@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=alice.id, winner_persona_id="analyst", panel=["analyst"],
        category="question",
    )
    for _ in range(4):
        _seed_audit(
            db_session, user_id=bob.id, winner_persona_id="analyst", panel=["analyst"],
            category="question",
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(alice)
    )
    body = res.json()
    assert body["total_appearances"] == 1
    assert body["total_wins"] == 1


@pytest.mark.asyncio
async def test_category_stats_requires_auth(app_client):
    res = await app_client.get("/api/analytics/category-stats")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_category_stats_window_bounds_rejected(app_client, make_user):
    user = make_user(email="cat-bounds@test.com", tier=UserTier.PRO)
    for qs in ("window_days=0", "window_days=400"):
        res = await app_client.get(
            f"/api/analytics/category-stats?{qs}", headers=_pro_headers(user)
        )
        assert res.status_code == 422, qs


# ─── Reconciliation ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_category_stats_totals_match_sum_of_rows(
    app_client, make_user, db_session
):
    """total_appearances and total_wins must equal the sum across
    the categories[] array. Pin the rollup invariant so a future
    pre-aggregation can't drift."""
    user = make_user(email="cat-recon@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for cat in ("question", "task", "debate"):
        for _ in range(3):
            _seed_audit(
                db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
                category=cat,
            )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    body = res.json()
    summed_apps = sum(r["appearances"] for r in body["categories"])
    summed_wins = sum(r["wins"] for r in body["categories"])
    assert body["total_appearances"] == summed_apps
    assert body["total_wins"] == summed_wins
    # 3 categories × 3 exchanges = 9.
    assert body["total_appearances"] == 9
    assert body["total_wins"] == 9


@pytest.mark.asyncio
async def test_category_stats_window_excludes_older_exchanges(
    app_client, make_user, db_session
):
    user = make_user(email="cat-window@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"],
        category="question", hours_ago=24,
    )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"],
        category="question", hours_ago=24 * 30,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats?window_days=7", headers=_pro_headers(user)
    )
    body = res.json()
    assert body["total_appearances"] == 1
    assert body["total_wins"] == 1


# ─── Hardening / Symmetry ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_category_stats_response_shape_parity(
    app_client, make_user, db_session
):
    """Category-stats rows share the same base field shape as
    by-category persona-stats rows. Future changes to one endpoint
    must be reflected in the other."""
    user = make_user(email="cat-shape@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for _ in range(2):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
            category="question",
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    body = res.json()
    row = body["categories"][0]
    # Base fields shared with by-category persona-stats rows.
    for field in ("category", "is_known_category", "is_uncategorized",
                  "appearances", "wins", "win_rate"):
        assert field in row, f"missing shared field {field}"


@pytest.mark.asyncio
async def test_category_stats_best_persona_cross_verify(
    app_client, make_user, db_session
):
    """best_persona_id must be the persona with the most wins in
    that category. Tie-break is appearances then persona_id."""
    user = make_user(email="cat-verify@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    # analyst wins 2, philosopher wins 2, pragmatist wins 1.
    for _ in range(2):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
            category="question",
        )
    for _ in range(2):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel,
            category="question",
        )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="pragmatist", panel=panel,
        category="question",
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    by_cat = {r["category"]: r for r in res.json()["categories"]}
    best = by_cat["question"]["best_persona_id"]
    # Tie on wins (2 each): philosopher has 2 apps, analyst has 2 apps,
    # but philosopher > analyst alphabetically so analyst wins the tie.
    # Actually: analyst < philosopher alphabetically, so analyst wins the tie-break.
    assert best == "analyst"


@pytest.mark.asyncio
async def test_category_stats_most_active_cross_verify(
    app_client, make_user, db_session
):
    """most_active_category must equal the category with the highest
    appearances count."""
    user = make_user(email="cat-most@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for _ in range(5):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
            category="question",
        )
    for _ in range(3):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel,
            category="task",
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    body = res.json()
    max_cat = max(body["categories"], key=lambda r: r["appearances"])
    assert body["most_active_category"] == max_cat["category"]


@pytest.mark.asyncio
async def test_category_stats_window_days_1_reachable(
    app_client, make_user, db_session
):
    """window_days=1 (the ge=1 minimum) is reachable and returns
    a valid response — not just a cap that exists because le=365."""
    user = make_user(email="cat-d1@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"],
        category="question", hours_ago=1,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats?window_days=1", headers=_pro_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["total_appearances"] >= 0


# ─── CSV export ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_rows_match_json(app_client, make_user, db_session):
    """CSV rows (excluding header and footer) must match the JSON
    categories array row-for-row so the export and the API
    response can never drift."""
    user = make_user(email="cat-csv@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for _ in range(2):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
            category="question", score=80,
        )
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel,
        category="task", score=90,
    )
    db_session.commit()

    json_res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    csv_res = await app_client.get(
        "/api/analytics/category-stats/export.csv", headers=_pro_headers(user)
    )

    json_categories = json_res.json()["categories"]
    rows = _parse_csv(csv_res.text)
    # header + data rows + footer
    assert len(rows) == 1 + len(json_categories) + 1
    header = rows[0]
    assert header == [
        "category", "is_known_category", "is_uncategorized",
        "appearances", "wins", "win_rate",
        "avg_winning_score", "last_exchange_at", "best_persona_id",
    ]
    for i, jrow in enumerate(json_categories):
        crow = rows[1 + i]
        assert crow[0] == jrow["category"]
        assert crow[1] == "true" if jrow["is_known_category"] else "false"
        assert crow[2] == "true" if jrow["is_uncategorized"] else "false"
        assert int(crow[3]) == jrow["appearances"]
        assert int(crow[4]) == jrow["wins"]
        assert float(crow[5]) == jrow["win_rate"]
        assert crow[6] == (
            str(jrow["avg_winning_score"]) if jrow["avg_winning_score"] is not None else ""
        )
        assert crow[7] == (jrow["last_exchange_at"] or "")
        assert crow[8] == (jrow["best_persona_id"] or "")


@pytest.mark.asyncio
async def test_csv_footer_matches_json_rollup(app_client, make_user, db_session):
    """CSV footer rollup (# total_appearances, total_wins) must
    match the JSON top-level totals."""
    user = make_user(email="cat-csv-ftr@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for _ in range(3):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
            category="question",
        )
    db_session.commit()

    json_res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    csv_res = await app_client.get(
        "/api/analytics/category-stats/export.csv", headers=_pro_headers(user)
    )

    json_body = json_res.json()
    rows = _parse_csv(csv_res.text)
    footer = rows[-1]
    assert f"# total_appearances={json_body['total_appearances']}" in footer[0]
    assert f"total_wins={json_body['total_wins']}" in footer[1]


@pytest.mark.asyncio
async def test_csv_scoped_to_caller(app_client, make_user, db_session):
    """CSV export must be scoped to the authenticated caller —
    another user's data must not appear."""
    alice = make_user(email="cat-csv-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="cat-csv-bob@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    _seed_audit(
        db_session, user_id=alice.id, winner_persona_id="analyst", panel=panel,
        category="question",
    )
    for _ in range(4):
        _seed_audit(
            db_session, user_id=bob.id, winner_persona_id="analyst", panel=panel,
            category="question",
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats/export.csv", headers=_pro_headers(alice)
    )
    rows = _parse_csv(res.text)
    # header + 1 data row (question) + footer
    assert len(rows) == 3
    assert rows[1][3] == "1"  # alice's 1 appearance in question


@pytest.mark.asyncio
async def test_csv_sort_order_matches_json(app_client, make_user, db_session):
    """CSV data rows must be sorted identically to the JSON
    categories array — recognized PromptCategory values in enum
    order, then unknown alphabetically, then uncategorized last."""
    user = make_user(email="cat-sort-csv@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for cat in [None, "alpha_thing", "task", "question"]:
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
            category=cat,
        )
    db_session.commit()

    json_res = await app_client.get(
        "/api/analytics/category-stats", headers=_pro_headers(user)
    )
    csv_res = await app_client.get(
        "/api/analytics/category-stats/export.csv", headers=_pro_headers(user)
    )

    json_cats = [r["category"] for r in json_res.json()["categories"]]
    csv_rows = _parse_csv(csv_res.text)
    data_rows = csv_rows[1:-1]  # strip header + footer
    csv_cats = [row[0] for row in data_rows]
    assert csv_cats == json_cats


@pytest.mark.asyncio
async def test_csv_footer_matches_sum_of_data_rows(
    app_client, make_user, db_session
):
    """CSV footer total must equal the arithmetic sum of data
    rows so a future pre-aggregation optimization can't silently
    break the reconciliation invariant."""
    user = make_user(email="cat-ftr-sum@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    for _ in range(3):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="analyst", panel=panel,
            category="question",
        )
    for _ in range(2):
        _seed_audit(
            db_session, user_id=user.id, winner_persona_id="philosopher", panel=panel,
            category="task",
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats/export.csv", headers=_pro_headers(user)
    )
    rows = _parse_csv(res.text)
    data_rows = rows[1:-1]  # strip header + footer
    footer = rows[-1]
    sum_apps = sum(int(r[3]) for r in data_rows)
    sum_wins = sum(int(r[4]) for r in data_rows)
    assert f"# total_appearances={sum_apps}" in footer[0]
    assert f"total_wins={sum_wins}" in footer[1]


@pytest.mark.asyncio
async def test_csv_header_only_when_no_data(app_client, make_user):
    """When a user has no exchanges in the window, the CSV
    must return just the header and the footer — never a crash
    on empty iteration."""
    user = make_user(email="cat-empty-csv@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/category-stats/export.csv", headers=_pro_headers(user)
    )
    rows = _parse_csv(res.text)
    assert len(rows) == 2  # header + footer only
    assert rows[0][0] == "category"
    assert rows[1][0].startswith("# total_appearances=0")


@pytest.mark.asyncio
async def test_csv_security_headers(app_client, make_user, db_session):
    """CSV responses must carry the same security headers as
    JSON analytics responses — X-Content-Type-Options blocks
    MIME sniffing and Cache-Control prevents stale file reuse."""
    user = make_user(email="cat-headers@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"],
        category="question",
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/category-stats/export.csv", headers=_pro_headers(user)
    )
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("cache-control") == "no-store"
    assert "attachment" in res.headers.get("content-disposition", "")


@pytest.mark.asyncio
async def test_json_export_matches_dashboard_payload_and_headers(
    app_client, make_user, db_session
):
    """The JSON download is an archival copy of the dashboard contract."""
    user = make_user(email="cat-json@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        category="question",
        score=91,
    )
    db_session.commit()

    dashboard = await app_client.get(
        "/api/analytics/category-stats?window_days=7", headers=_pro_headers(user)
    )
    exported = await app_client.get(
        "/api/analytics/category-stats/export.json?window_days=7",
        headers=_pro_headers(user),
    )

    assert dashboard.status_code == 200
    assert exported.status_code == 200
    assert json.loads(exported.text) == dashboard.json()
    assert exported.headers["content-type"].startswith("application/json")
    assert exported.headers.get("x-content-type-options") == "nosniff"
    assert exported.headers.get("cache-control") == "no-store"
    assert exported.headers["content-disposition"].startswith(
        'attachment; filename="arena-category-stats-'
    )
    assert exported.headers["content-disposition"].endswith('.json"')


@pytest.mark.asyncio
async def test_markdown_export_matches_dashboard_rollups_and_rows(
    app_client, make_user, db_session
):
    """The Markdown report should be a readable projection of the same payload."""
    user = make_user(email="cat-md@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        category="question",
        score=91,
    )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="philosopher",
        panel=panel,
        category="task",
        score=84,
    )
    db_session.commit()

    dashboard = await app_client.get(
        "/api/analytics/category-stats?window_days=7", headers=_pro_headers(user)
    )
    exported = await app_client.get(
        "/api/analytics/category-stats/export.md?window_days=7",
        headers=_pro_headers(user),
    )

    assert dashboard.status_code == 200
    assert exported.status_code == 200
    body = dashboard.json()
    text = exported.text
    assert "# Arena — category stats" in text
    assert f"- **Total appearances:** {body['total_appearances']}" in text
    assert f"- **Total wins:** {body['total_wins']}" in text
    assert f"- **Most active category:** {body['most_active_category']}" in text
    for row in body["categories"]:
        assert (
            f"| {row['category']} | {row['appearances']} | {row['wins']} | "
            f"{row['win_rate'] * 100:.1f}% |"
        ) in text


@pytest.mark.asyncio
async def test_markdown_export_empty_report_has_stable_headers(app_client, make_user):
    user = make_user(email="cat-md-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/category-stats/export.md?window_days=7",
        headers=_pro_headers(user),
    )

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/markdown")
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-content-type-options"] == "nosniff"
    assert "**Window:**" in res.text
    assert "- **Most active category:** none" in res.text
    assert "_No categories recorded in this window._" in res.text
    assert res.text.rstrip().endswith("_Exported from Arena_")
    assert res.headers["content-disposition"].startswith(
        'attachment; filename="arena-category-stats-'
    )
    assert res.headers["content-disposition"].endswith('.md"')


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("path", "scope"),
    [
        ("/api/analytics/category-stats/export.csv", "analytics_category_stats_csv"),
        ("/api/analytics/category-stats/export.json", "analytics_category_stats_json"),
        (
            "/api/analytics/category-stats/export.md",
            "analytics_category_stats_markdown",
        ),
    ],
)
async def test_category_stats_exports_use_only_their_own_rate_limit_scope(
    app_client, make_user, monkeypatch, path, scope
):
    """A download must not consume the dashboard refresh budget."""
    from arena.core import rate_limits

    keys: list[str] = []
    real_hit = rate_limits.rate_limiter.hit

    def recording_hit(key, *, limit, window_seconds, message):
        keys.append(key)
        return real_hit(
            key,
            limit=limit,
            window_seconds=window_seconds,
            message=message,
        )

    monkeypatch.setattr(rate_limits.rate_limiter, "hit", recording_hit)

    user = make_user(email=f"{scope}-budget@test.com", tier=UserTier.PRO)
    res = await app_client.get(path, headers=_pro_headers(user))

    assert res.status_code == 200, res.text
    user_keys = [key for key in keys if key.startswith("user:")]
    assert user_keys == [f"user:{scope}:{user.id}"]
