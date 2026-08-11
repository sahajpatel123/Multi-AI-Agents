"""Integration tests for GET /api/analytics/activity/export.json.

The activity JSON export is the machine-readable sibling of the activity CSV
export: it downloads the exact /analytics/activity payload so dashboards,
archival scripts, and BI pipelines consume one stable contract.
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


# ─── Auth + parameter validation ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_json_requires_auth(app_client):
    res = await app_client.get("/api/analytics/activity/export.json")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_activity_json_rejects_zero_days(app_client, make_user):
    user = make_user(email="actjson-zero@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity/export.json?days=0",
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_activity_json_is_zero_for_new_user(app_client, make_user):
    user = make_user(email="actjson-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity/export.json?days=7",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/json")

    body = res.json()
    assert body["window_days"] == 7
    assert len(body["activity"]) == 7
    assert all(bucket["prompts"] == 0 for bucket in body["activity"])
    assert all(bucket["debates"] == 0 for bucket in body["activity"])
    assert all(bucket["discusses"] == 0 for bucket in body["activity"])
    assert all(bucket["agent_runs"] == 0 for bucket in body["activity"])
    assert body["totals"] == {
        "prompts": 0,
        "debates": 0,
        "discusses": 0,
        "agent_runs": 0,
    }
    assert body["active_days"] == 0
    assert body["busiest_day"] is None


# ─── Core shape ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_json_matches_dashboard_endpoint(
    app_client, make_user, db_session
):
    """The export must be byte-identical to /analytics/activity's payload."""
    user = make_user(email="actjson-match@test.com", tier=UserTier.PRO)
    _seed_records(
        db_session,
        user.id,
        [
            (0, "arena"),
            (0, "debate"),
            (1, "discuss"),
            (2, "agent"),
            (2, "arena"),
            (4, "debate"),
        ],
    )

    export_res = await app_client.get(
        "/api/analytics/activity/export.json?days=7",
        headers=_pro_headers(user),
    )
    dashboard_res = await app_client.get(
        "/api/analytics/activity?days=7",
        headers=_pro_headers(user),
    )
    assert export_res.status_code == 200
    assert dashboard_res.status_code == 200
    assert export_res.json() == dashboard_res.json()


@pytest.mark.asyncio
async def test_activity_json_row_order_is_chronological(
    app_client, make_user, db_session
):
    """Buckets stay oldest-first, matching the JSON activity contract."""
    user = make_user(email="actjson-order@test.com", tier=UserTier.PRO)
    _seed_records(db_session, user.id, [(0, "arena"), (2, "debate")])

    res = await app_client.get(
        "/api/analytics/activity/export.json?days=7",
        headers=_pro_headers(user),
    )
    dates = [bucket["date"] for bucket in res.json()["activity"]]
    assert dates == sorted(dates)
    assert dates[-1] == utcnow_naive().date().isoformat()


# ─── Filename + headers ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_json_filename_includes_window(app_client, make_user):
    user = make_user(email="actjson-name@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity/export.json?days=7",
        headers=_pro_headers(user),
    )
    cd = res.headers["content-disposition"]
    assert cd.startswith("attachment; filename=")
    assert "arena-activity-" in cd
    assert ".json" in cd
    assert utcnow_naive().date().isoformat() in cd


@pytest.mark.asyncio
async def test_activity_json_has_security_headers(app_client, make_user):
    user = make_user(email="actjson-sec@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/analytics/activity/export.json?days=7",
        headers=_pro_headers(user),
    )
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-content-type-options"] == "nosniff"


# ─── Rate limiting ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activity_json_uses_separate_rate_limit_scope(
    app_client, make_user, monkeypatch
):
    """JSON exports must not consume the dashboard or CSV export budgets."""
    from arena.core import rate_limits

    keys: list[str] = []
    real_hit = rate_limits.rate_limiter.hit

    def recording_hit(key, *, limit, window_seconds, message):
        keys.append(key)
        return real_hit(key, limit=limit, window_seconds=window_seconds, message=message)

    monkeypatch.setattr(rate_limits.rate_limiter, "hit", recording_hit)

    user = make_user(email="actjson-rate@test.com", tier=UserTier.PRO)
    headers = _pro_headers(user)
    json_res = await app_client.get(
        "/api/analytics/activity/export.json?days=7", headers=headers
    )
    csv_res = await app_client.get(
        "/api/analytics/activity/export.csv?days=7", headers=headers
    )
    dashboard_res = await app_client.get(
        "/api/analytics/activity?days=7", headers=headers
    )
    assert json_res.status_code == 200
    assert csv_res.status_code == 200
    assert dashboard_res.status_code == 200
    assert f"user:analytics_activity_json:{user.id}" in keys
    assert f"user:analytics_activity_csv:{user.id}" in keys
    assert f"user:analytics_activity:{user.id}" in keys
    assert keys.count(f"user:analytics_activity_json:{user.id}") == 1
