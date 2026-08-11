"""Integration tests for GET /api/analytics/activity/export.md.

The activity Markdown export is the human-readable sibling of the CSV/JSON
activity exports: it renders the same aggregation as a portable report with
summary metrics and a per-day table.
"""

from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta

import pytest

from arena.core.datetime_utils import utcnow_naive
from arena.db_models import UsageRecord, UserTier


def _seed_records(db, user_id: int, events: list[tuple[int, str]]) -> None:
    """Insert one UsageRecord per (days_ago, mode) tuple at noon UTC."""
    today = utcnow_naive().date()
    for days_ago, mode in events:
        target_day = today - timedelta(days=days_ago)
        ts = datetime.combine(target_day, time(12, 0))
        db.add(
            UsageRecord(
                user_id=user_id,
                request_id=str(uuid.uuid4()),
                mode=mode,
                input_tokens=1,
                output_tokens=1,
                estimated_cost_usd=0.0,
                total_processing_ms=10,
                timestamp=ts,
            )
        )
    db.commit()


def _table_rows(text: str) -> list[list[str]]:
    """Return per-day table rows (excluding the Markdown header separators)."""
    rows = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("|") and not stripped.startswith("| ---"):
            rows.append(
                [cell.strip() for cell in stripped.strip("|").split("|")]
            )
    return rows


# ─── Auth + parameter validation ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_markdown_requires_auth(app_client):
    res = await app_client.get("/api/analytics/activity/export.md")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_activity_markdown_rejects_zero_days(app_client, make_user):
    user = make_user(email="actmd-zero@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity/export.md?days=0", headers=_pro_headers(user)
    )
    assert res.status_code == 422


# ─── Core shape ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_markdown_is_zero_for_new_user(app_client, make_user):
    user = make_user(email="actmd-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity/export.md?days=7",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/markdown")
    text = res.text
    assert "# Arena — activity timeline" in text
    assert "## Summary" in text
    assert "- **Prompts:** 0" in text
    assert "- **Active days:** 0" in text
    assert "- **Busiest day:** none (0 actions)" in text
    rows = _table_rows(text)
    assert rows[0][0] == "Date"
    data_rows = rows[1:]
    assert len(data_rows) == 7
    assert all(int(row[1]) == 0 for row in data_rows)


@pytest.mark.asyncio
async def test_activity_markdown_rows_match_json_timeline(
    app_client, make_user, db_session
):
    """The Markdown table must not drift from the JSON activity timeline."""
    user = make_user(email="actmd-json@test.com", tier=UserTier.PRO)
    _seed_records(
        db_session,
        user.id,
        [
            (0, "arena"),
            (0, "debate"),
            (1, "discuss"),
            (2, "agent"),
            (2, "arena"),
        ],
    )

    md_res = await app_client.get(
        "/api/analytics/activity/export.md?days=7",
        headers=_pro_headers(user),
    )
    json_res = await app_client.get(
        "/api/analytics/activity?days=7",
        headers=_pro_headers(user),
    )
    assert md_res.status_code == 200
    assert json_res.status_code == 200

    rows = _table_rows(md_res.text)[1:]
    json_rows = json_res.json()["activity"]
    assert len(rows) == len(json_rows)
    for row, json_row in zip(rows, json_rows):
        assert row[0] == json_row["date"]
        assert int(row[1]) == json_row["prompts"]
        assert int(row[2]) == json_row["debates"]
        assert int(row[3]) == json_row["discusses"]
        assert int(row[4]) == json_row["agent_runs"]


@pytest.mark.asyncio
async def test_activity_markdown_summary_matches_json_rollup(
    app_client, make_user, db_session
):
    """Summary bullets must equal the JSON endpoint's rollup fields."""
    user = make_user(email="actmd-summary@test.com", tier=UserTier.PRO)
    _seed_records(
        db_session,
        user.id,
        [(0, "arena"), (0, "debate"), (1, "agent"), (1, "arena"), (3, "discuss")],
    )

    md_res = await app_client.get(
        "/api/analytics/activity/export.md?days=7",
        headers=_pro_headers(user),
    )
    json_body = (
        await app_client.get(
            "/api/analytics/activity?days=7",
            headers=_pro_headers(user),
        )
    ).json()
    text = md_res.text

    assert f"- **Prompts:** {json_body['totals']['prompts']}" in text
    assert f"- **Debates:** {json_body['totals']['debates']}" in text
    assert f"- **Discusses:** {json_body['totals']['discusses']}" in text
    assert f"- **Agent runs:** {json_body['totals']['agent_runs']}" in text
    assert f"- **Active days:** {json_body['active_days']}" in text
    assert f"- **Current streak:** {json_body['current_streak']}" in text
    assert f"- **Longest streak:** {json_body['longest_streak']}" in text
    assert f"{json_body['busiest_day'] or 'none'}" in text
    assert f"{json_body['busiest_day_count']} actions" in text


# ─── Filename + headers ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_markdown_filename_includes_window(app_client, make_user):
    user = make_user(email="actmd-name@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity/export.md?days=7",
        headers=_pro_headers(user),
    )
    cd = res.headers["content-disposition"]
    assert cd.startswith("attachment; filename=")
    assert "arena-activity-" in cd
    assert ".md" in cd
    today = utcnow_naive().date()
    assert (today - timedelta(days=6)).isoformat() in cd
    assert today.isoformat() in cd


@pytest.mark.asyncio
async def test_activity_markdown_has_security_headers(app_client, make_user):
    user = make_user(email="actmd-sec@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity/export.md?days=7",
        headers=_pro_headers(user),
    )
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-content-type-options"] == "nosniff"


# ─── Rate limiting ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_markdown_uses_separate_rate_limit_scope(
    app_client, make_user, monkeypatch
):
    """Markdown exports must not consume the dashboard or other export budgets."""
    from arena.core import rate_limits

    keys: list[str] = []
    real_hit = rate_limits.rate_limiter.hit

    def recording_hit(key, *, limit, window_seconds, message):
        keys.append(key)
        return real_hit(key, limit=limit, window_seconds=window_seconds, message=message)

    monkeypatch.setattr(rate_limits.rate_limiter, "hit", recording_hit)

    user = make_user(email="actmd-rate@test.com", tier=UserTier.PRO)
    headers = _pro_headers(user)
    md_res = await app_client.get(
        "/api/analytics/activity/export.md?days=7", headers=headers
    )
    json_res = await app_client.get(
        "/api/analytics/activity/export.json?days=7", headers=headers
    )
    dashboard_res = await app_client.get(
        "/api/analytics/activity?days=7", headers=headers
    )
    assert md_res.status_code == 200
    assert json_res.status_code == 200
    assert dashboard_res.status_code == 200
    assert f"user:analytics_activity_markdown:{user.id}" in keys
    assert f"user:analytics_activity_json:{user.id}" in keys
    assert f"user:analytics_activity:{user.id}" in keys
    assert keys.count(f"user:analytics_activity_markdown:{user.id}") == 1


@pytest.mark.asyncio
async def test_activity_markdown_rate_limited(app_client, make_user, monkeypatch):
    """The Markdown export rejects callers who exhaust its hourly budget."""
    from arena.core import rate_limits

    hits = {"n": 0}
    real_hit = rate_limits.rate_limiter.hit

    def limited_hit(key, *, limit, window_seconds, message):
        if key.startswith("user:analytics_activity_markdown:"):
            hits["n"] += 1
            if hits["n"] > 0:
                from fastapi import HTTPException, status

                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "error": "rate_limit_exceeded",
                        "message": message,
                        "retry_after": 1,
                    },
                )
            return
        return real_hit(key, limit=limit, window_seconds=window_seconds, message=message)

    monkeypatch.setattr(rate_limits.rate_limiter, "hit", limited_hit)

    user = make_user(email="actmd-rl@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity/export.md?days=7",
        headers=_pro_headers(user),
    )
    assert res.status_code == 429, res.text
