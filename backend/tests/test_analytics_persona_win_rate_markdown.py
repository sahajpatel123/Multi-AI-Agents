"""Integration tests for GET /api/analytics/persona-win-rate/export.md.

The Markdown export is the human-readable sibling of the win-rate CSV
export: it renders the same aggregation as a portable report with window
facts, honesty counters, and a per-persona table so a user can paste the
report into notes or docs without opening a spreadsheet.
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
    hours_ago: int = 1,
    fallback_used: bool = False,
) -> ScoringAudit:
    """Seed one scored exchange for the current user."""
    rec = ScoringAudit(
        session_id=str(uuid.uuid4()),
        user_id=user_id,
        prompt_snippet="x",
        winner_agent_id="agent-1",
        winner_persona_id=winner_persona_id,
        winner_score=80,
        scores={"agent-1": 80},
        persona_ids_used=panel,
        fallback_used=fallback_used,
        created_at=utcnow_naive() - timedelta(hours=hours_ago),
    )
    db.add(rec)
    db.flush()
    return rec


def _table_rows(text: str) -> list[list[str]]:
    """Return Markdown table rows (excluding the header separator)."""
    rows = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("|") and not stripped.startswith("| ---"):
            rows.append([cell.strip() for cell in stripped.strip("|").split("|")])
    return rows


# ─── Auth + parameter validation ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_persona_win_rate_markdown_requires_auth(app_client):
    res = await app_client.get("/api/analytics/persona-win-rate/export.md")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_persona_win_rate_markdown_rejects_zero_window(app_client, make_user):
    user = make_user(email="pwrmd-zero@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.md?window_days=0",
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_persona_win_rate_markdown_rejects_excessive_window(app_client, make_user):
    user = make_user(email="pwrmd-overflow@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.md?window_days=400",
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_persona_win_rate_markdown_rejects_invalid_min_appearances(
    app_client, make_user
):
    user = make_user(email="pwrmd-min@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.md?min_appearances=201",
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


# ─── Report shape ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_persona_win_rate_markdown_defaults_to_90_days(app_client, make_user):
    user = make_user(email="pwrmd-default@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.md",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/markdown")
    assert res.headers["content-disposition"].endswith(".md\"")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert "(90 days, UTC)" in res.text
    assert "## Summary" in res.text
    assert "- **Scored exchanges:** 0" in res.text
    assert "- **Fallback exchanges:** 0" in res.text
    assert (
        "_No scored panels meet the minimum appearance threshold in this "
        "window._" in res.text
    )


@pytest.mark.asyncio
async def test_persona_win_rate_markdown_matches_json_rows(
    app_client, make_user, db_session
):
    """The Markdown table must not drift from the JSON win-rate rows."""
    user = make_user(email="pwrmd-json@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher", "pragmatist", "contrarian"]
    _seed_audit(db_session, user_id=user.id, winner_persona_id="analyst", panel=panel)
    for _ in range(7):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="philosopher",
            panel=panel,
        )
    db_session.commit()

    md_res = await app_client.get(
        "/api/analytics/persona-win-rate/export.md?window_days=30",
        headers=_pro_headers(user),
    )
    json_res = await app_client.get(
        "/api/analytics/persona-win-rate?window_days=30",
        headers=_pro_headers(user),
    )
    assert md_res.status_code == 200
    assert json_res.status_code == 200

    body = json_res.json()
    rows = _table_rows(md_res.text)[1:]
    assert len(rows) == len(body["personas"])

    by_name = {row["name"]: row for row in body["personas"]}
    for row in rows:
        persona_name = row[0]
        json_row = by_name[persona_name]
        assert int(row[1]) == json_row["appearances"]
        assert int(row[2]) == json_row["wins"]
        assert row[3] == f"{round(json_row['win_rate'] * 100)}%"
        if json_row["low_confidence"]:
            assert row[4] == "low sample"
        else:
            assert row[4] == ""

    assert "**Best (confident):** The Philosopher — 88% across 8 panels" in md_res.text
    assert "| The Analyst | 8 | 1 | 12% |  |" in md_res.text
    assert "| The Philosopher | 8 | 7 | 88% |  |" in md_res.text


@pytest.mark.asyncio
async def test_persona_win_rate_markdown_honors_min_appearances(
    app_client, make_user, db_session
):
    user = make_user(email="pwrmd-filter@test.com", tier=UserTier.PRO)
    # Separate panels: the analyst only sits on the low-sample exchange, so
    # min_appearances=5 must drop it without hiding the philosopher.
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=["analyst", "contrarian"],
    )
    for _ in range(5):
        _seed_audit(
            db_session,
            user_id=user.id,
            winner_persona_id="philosopher",
            panel=["philosopher", "pragmatist"],
        )
    db_session.commit()

    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.md?min_appearances=5",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert "The Philosopher" in res.text
    assert "The Analyst" not in res.text
    assert "- **Minimum appearances:** 5" in res.text


@pytest.mark.asyncio
async def test_persona_win_rate_markdown_reports_fallback_exchanges(
    app_client, make_user, db_session
):
    """Fallback scorings are counted in the honesty summary, not the table."""
    user = make_user(email="pwrmd-fallback@test.com", tier=UserTier.PRO)
    panel = ["analyst", "philosopher"]
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="analyst",
        panel=panel,
        fallback_used=True,
    )
    _seed_audit(
        db_session,
        user_id=user.id,
        winner_persona_id="philosopher",
        panel=panel,
    )
    db_session.commit()
    res = await app_client.get(
        "/api/analytics/persona-win-rate/export.md",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert "- **Scored exchanges:** 1" in res.text
    assert "- **Fallback exchanges:** 1" in res.text
    assert "| The Analyst | 1 | 0 | 0% | low sample |" in res.text
    assert "| The Philosopher | 1 | 1 | 100% | low sample |" in res.text
