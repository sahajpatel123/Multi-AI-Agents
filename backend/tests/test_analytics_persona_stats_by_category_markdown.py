"""Integration tests for GET /api/analytics/persona-stats/{persona_id}/by-category/export.md.

Markdown export of the per-persona per-category breakdown. Reuses the
JSON route's computation so the report cannot drift from the dashboard.
"""

from __future__ import annotations

import uuid
from datetime import timedelta


def datetime_now_utc_date():
    """UTC calendar date, matching what the export routes stamp into
    filenames (they use utcnow_naive, not local time)."""
    from arena.core.datetime_utils import utcnow_naive

    return utcnow_naive().date()

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


# ─── Core shape ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_md_empty_user_renders_summary_without_rows(app_client, make_user):
    user = make_user(email="pbcm-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.md?window_days=7",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/markdown")
    text = res.text
    # Title + window + summary sections always render.
    assert "# Arena — The Analyst category breakdown" in text
    assert "## Summary" in text
    assert "## Categories" in text
    assert "- **Appearances:** 0" in text
    assert "- **Wins:** 0"
    # No data rows → table header present but no category rows.
    assert "| Category | Appearances | Wins | Win rate |" in text
    assert "*(uncategorized)*" not in text


@pytest.mark.asyncio
async def test_md_rows_match_json_by_category(app_client, make_user, db_session):
    """The report must not drift from the JSON endpoint's categories[]."""
    user = make_user(email="pbcm-json@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
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
    db_session.commit()

    md_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.md?window_days=7",
        headers=_pro_headers(user),
    )
    json_res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category?window_days=7",
        headers=_pro_headers(user),
    )
    assert md_res.status_code == 200
    assert json_res.status_code == 200

    text = md_res.text
    json_body = json_res.json()

    # Summary section mirrors the JSON rollup exactly.
    assert f"- **Appearances:** {json_body['total_appearances']}" in text
    assert f"- **Wins:** {json_body['total_wins']}" in text
    assert (
        f"- **Uncategorized appearances:** {json_body['uncategorized_appearances']}"
        in text
    )
    assert f"- **Uncategorized wins:** {json_body['uncategorized_wins']}" in text
    assert f"- **Categories engaged:** {len(json_body['categories'])}" in text

    # One table row per JSON category, same order, same numbers.
    for json_row in json_body["categories"]:
        expected = (
            f"| {json_row['category']} | {json_row['appearances']} | "
            f"{json_row['wins']} | {json_row['win_rate']:.1%} |"
        )
        assert expected in text


@pytest.mark.asyncio
async def test_md_sort_order_matches_json(app_client, make_user, db_session):
    user = make_user(email="pbcm-order@test.com", tier=UserTier.PRO)
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
        "/api/analytics/persona-stats/analyst/by-category/export.md?window_days=7",
        headers=_pro_headers(user),
    )
    text = res.text
    q = text.index("| question |")
    a = text.index("| alpha_thing |")
    u = text.index("| (uncategorized) *(uncategorized)* |")
    assert q < a < u


@pytest.mark.asyncio
async def test_md_uncategorized_row_is_annotated(app_client, make_user, db_session):
    """The uncategorized row keeps its canonical label and gains the
    italic annotation so readers know it is a catch-all bucket."""
    user = make_user(email="pbcm-uncat@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst"],
        category=None,
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.md?window_days=7",
        headers=_pro_headers(user),
    )
    assert "| (uncategorized) *(uncategorized)* | 1 | 1 | 100.0% |" in res.text


# ─── Filename + headers ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_md_filename_includes_persona_and_window(app_client, make_user):
    user = make_user(email="pbcm-name@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.md?window_days=7",
        headers=_pro_headers(user),
    )
    cd = res.headers["content-disposition"]
    assert cd.startswith("attachment; filename=")
    assert "arena-by-category-analyst-" in cd
    assert ".md" in cd
    # The server stamps UTC dates, so compare against UTC's today —
    # not the local one (they differ whenever this machine is ahead
    # of UTC).
    from datetime import date
    assert datetime_now_utc_date().isoformat() in cd


@pytest.mark.asyncio
async def test_md_has_security_headers(app_client, make_user):
    user = make_user(email="pbcm-sec@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.md?window_days=7",
        headers=_pro_headers(user),
    )
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-content-type-options"] == "nosniff"


# ─── Honesty note ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_md_carries_fallback_honesty_note(app_client, make_user):
    """The fallback-wins-excluded caveat ships in the file itself so the
    report stays honest when pasted somewhere without the dashboard."""
    user = make_user(email="pbcm-honest@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.md?window_days=7",
        headers=_pro_headers(user),
    )
    assert "Wins exclude fallback scorings" in res.text


# ─── Tenant + auth + input ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_md_scoped_to_caller(app_client, make_user, db_session):
    alice = make_user(email="pbcm-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="pbcm-bob@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=alice.id, winner_persona_id="analyst", panel=["analyst"]
    )
    for _ in range(5):
        _seed_audit(
            db_session, user_id=bob.id, winner_persona_id="analyst", panel=["analyst"]
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.md?window_days=7",
        headers=_pro_headers(alice),
    )
    assert "- **Appearances:** 1" in res.text
    assert "- **Wins:** 1" in res.text


@pytest.mark.asyncio
async def test_md_requires_auth(app_client):
    res = await app_client.get(
        "/api/analytics/persona-stats/analyst/by-category/export.md"
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_md_unknown_persona_404(app_client, make_user):
    user = make_user(email="pbcm-404@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-stats/retired_mind/by-category/export.md",
        headers=_pro_headers(user),
    )
    assert res.status_code == 404
    body = res.json()
    assert body["detail"]["error"] == "unknown_persona"


@pytest.mark.asyncio
async def test_md_window_bounds_rejected(app_client, make_user):
    user = make_user(email="pbcm-bounds@test.com", tier=UserTier.PRO)
    for qs in ("window_days=0", "window_days=400"):
        res = await app_client.get(
            f"/api/analytics/persona-stats/analyst/by-category/export.md?{qs}",
            headers=_pro_headers(user),
        )
        assert res.status_code == 422, qs


@pytest.mark.asyncio
async def test_md_window_bounds_reachable(app_client, make_user):
    """Both ends of the 1–365 range are usable, not just declared."""
    user = make_user(email="pbcm-range@test.com", tier=UserTier.PRO)
    for qs in ("window_days=1", "window_days=365"):
        res = await app_client.get(
            f"/api/analytics/persona-stats/analyst/by-category/export.md?{qs}",
            headers=_pro_headers(user),
        )
        assert res.status_code == 200, qs


@pytest.mark.asyncio
async def test_md_uppercase_persona_id_normalized(
    app_client, make_user, db_session
):
    user = make_user(email="pbcm-case@test.com", tier=UserTier.PRO)
    _seed_audit(
        db_session, user_id=user.id, winner_persona_id="analyst", panel=["analyst"]
    )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-stats/ANALYST/by-category/export.md?window_days=7",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    # Filename uses canonical lowercase form.
    assert "arena-by-category-analyst-" in res.headers["content-disposition"]
