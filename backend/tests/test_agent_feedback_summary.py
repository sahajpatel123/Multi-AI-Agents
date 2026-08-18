"""Agent feedback daily summary endpoint and aggregator contract."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

import csv
import io
import json
from datetime import datetime, timedelta, timezone

import pytest

from arena.core import agent_metrics
from arena.core.agent_metrics import compute_user_feedback_summary
from arena.core.auth import create_access_token
from arena.db_models import AgentTask, AnswerFeedback, UserTier
from arena.routes import agent as agent_routes


def _make_feedback(*, user_id, suffix, verdict, days_ago=0):
    now = utcnow_naive()
    return AnswerFeedback(
        user_id=user_id,
        task_id=f"task-fb-{suffix}",
        verdict=verdict,
        note=f"note-{suffix}",
        created_at=now - timedelta(days=days_ago),
    )


def test_feedback_summary_zero_state_for_new_user(db_session, make_user):
    user = make_user(email="fb-sum-zero@test.com", tier=UserTier.PRO)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    payload = compute_user_feedback_summary(db=db_session, user=user)
    assert payload["total"] == 0
    assert payload["verdicts"] == {"correct": 0, "partial": 0, "wrong": 0}
    assert payload["rate"] == 0
    assert payload["window_days"] == 30
    assert len(payload["daily_trend"]) == 30
    assert sum(entry["count"] for entry in payload["daily_trend"]) == 0


def test_feedback_summary_tallies_verdicts(db_session, make_user):
    user = make_user(email="fb-sum-tally@test.com", tier=UserTier.PRO)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    for verdict, count in [("correct", 3), ("partial", 2), ("wrong", 1)]:
        for i in range(count):
            db_session.add(
                _make_feedback(
                    user_id=user.id,
                    suffix=f"{verdict}-{i}",
                    verdict=verdict,
                    days_ago=i,
                )
            )
    db_session.commit()

    payload = compute_user_feedback_summary(db=db_session, user=user)
    assert payload["total"] == 6
    assert payload["verdicts"] == {"correct": 3, "partial": 2, "wrong": 1}
    # Accuracy rate = correct / total. Was previously always 1.0 (total/total).
    assert payload["rate"] == round(3 / 6, 4)


def test_feedback_summary_daily_trend_pads_to_window(db_session, make_user):
    user = make_user(email="fb-sum-trend@test.com", tier=UserTier.PRO)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    db_session.add(_make_feedback(user_id=user.id, suffix="today", verdict="correct", days_ago=0))
    db_session.add(_make_feedback(user_id=user.id, suffix="yesterday", verdict="wrong", days_ago=1))
    db_session.commit()

    payload = compute_user_feedback_summary(
        db=db_session, user=user, window_days=7
    )
    assert len(payload["daily_trend"]) == 7
    days = [entry["date"] for entry in payload["daily_trend"]]
    assert days == sorted(days)
    counts = [entry["count"] for entry in payload["daily_trend"]]
    assert sum(counts) == 2


def test_feedback_summary_ignores_other_users_data(db_session, make_user):
    a = make_user(email="fb-sum-scope-a@test.com", tier=UserTier.PRO)
    b = make_user(email="fb-sum-scope-b@test.com", tier=UserTier.PRO)
    db_session.add_all([a, b])
    db_session.commit()
    db_session.refresh(a)
    db_session.refresh(b)

    for i in range(4):
        db_session.add(_make_feedback(user_id=a.id, suffix=f"a-{i}", verdict="correct"))
    for i in range(2):
        db_session.add(_make_feedback(user_id=b.id, suffix=f"b-{i}", verdict="wrong"))
    db_session.commit()

    payload = compute_user_feedback_summary(db=db_session, user=a)
    assert payload["total"] == 4
    assert payload["verdicts"] == {"correct": 4, "partial": 0, "wrong": 0}


@pytest.mark.asyncio
async def test_feedback_summary_endpoint_returns_payload(app_client, make_user, db_session):
    user = make_user(email="fb-sum-endpoint@test.com", tier=UserTier.PRO)
    for i in range(3):
        db_session.add(
            _make_feedback(user_id=user.id, suffix=f"e-{i}", verdict="correct")
        )
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get("/api/agent/feedback/summary", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3
    assert body["verdicts"]["correct"] == 3
    assert body["window_days"] == 30
    assert len(body["daily_trend"]) == 30


@pytest.mark.asyncio
async def test_feedback_summary_endpoint_requires_auth(app_client):
    res = await app_client.get("/api/agent/feedback/summary")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_feedback_summary_endpoint_window_is_clamped(app_client, make_user):
    user = make_user(email="fb-sum-cap@test.com", tier=UserTier.PRO)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/feedback/summary?window_days=365", headers=headers
    )
    assert res.status_code == 422  # capped at 90
    res = await app_client.get(
        "/api/agent/feedback/summary?window_days=14", headers=headers
    )
    assert res.status_code == 200
    assert len(res.json()["daily_trend"]) == 14


@pytest.mark.asyncio
async def test_feedback_summary_csv_export_preserves_the_selected_window(
    app_client, make_user, db_session
):
    user = make_user(email="fb-sum-csv@test.com", tier=UserTier.PRO)
    db_session.add(_make_feedback(user_id=user.id, suffix="today", verdict="correct"))
    db_session.add(
        _make_feedback(
            user_id=user.id,
            suffix="yesterday",
            verdict="wrong",
            days_ago=1,
        )
    )
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/feedback/summary/export.csv?window_days=7",
        headers=headers,
    )
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "arena-feedback-activity-" in res.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(res.text)))
    assert len(rows) == 7
    assert rows[-1]["date"] == utcnow_naive().date().isoformat()
    assert rows[-1]["feedback_count"] == "1"
    assert rows[-1]["correct_count"] == "1"
    assert rows[-1]["partial_count"] == "0"
    assert rows[-1]["wrong_count"] == "0"
    assert rows[-2]["feedback_count"] == "1"
    assert rows[-2]["correct_count"] == "0"
    assert rows[-2]["wrong_count"] == "1"
    assert all(row["date"] for row in rows)


@pytest.mark.asyncio
async def test_feedback_summary_csv_filename_matches_window_end_at_utc_midnight(
    app_client, make_user, monkeypatch
):
    user = make_user(email="fb-sum-csv-midnight@test.com", tier=UserTier.PRO)
    aggregation_now = datetime(2026, 8, 18, 23, 59, 59)
    next_day = datetime(2026, 8, 19, 0, 0, 1)
    monkeypatch.setattr(agent_metrics, "utcnow_naive", lambda: aggregation_now)
    monkeypatch.setattr(agent_routes, "utcnow_naive", lambda: next_day)

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/feedback/summary/export.csv?window_days=7",
        headers=headers,
    )

    assert res.status_code == 200
    assert (
        'filename="arena-feedback-activity-'
        f'{user.id}-7d-20260818.csv"'
    ) in res.headers["content-disposition"]


@pytest.mark.asyncio
async def test_feedback_summary_json_export_matches_summary_contract(
    app_client, make_user, db_session
):
    user = make_user(email="fb-sum-json@test.com", tier=UserTier.PRO)
    db_session.add(_make_feedback(user_id=user.id, suffix="today", verdict="correct"))
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/feedback/summary/export.json?window_days=7",
        headers=headers,
    )

    assert res.status_code == 200
    assert "application/json" in res.headers["content-type"]
    assert 'filename="arena-feedback-activity-' in res.headers["content-disposition"]
    body = res.json()
    assert body["window_days"] == 7
    assert body["verdicts"] == {"correct": 1, "partial": 0, "wrong": 0}
    assert len(body["daily_trend"]) == 7
    assert body["daily_trend"][-1]["count"] == 1
    assert body["daily_trend"][-1]["verdicts"] == {
        "correct": 1,
        "partial": 0,
        "wrong": 0,
    }
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["cache-control"] == "no-store, no-cache, must-revalidate, private"


@pytest.mark.asyncio
async def test_feedback_summary_json_filename_matches_window_end_at_utc_midnight(
    app_client, make_user, monkeypatch
):
    user = make_user(email="fb-sum-json-midnight@test.com", tier=UserTier.PRO)
    aggregation_now = datetime(2026, 8, 18, 23, 59, 59)
    next_day = datetime(2026, 8, 19, 0, 0, 1)
    monkeypatch.setattr(agent_metrics, "utcnow_naive", lambda: aggregation_now)
    monkeypatch.setattr(agent_routes, "utcnow_naive", lambda: next_day)

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/feedback/summary/export.json?window_days=7",
        headers=headers,
    )

    assert res.status_code == 200
    assert (
        'filename="arena-feedback-activity-'
        f"{user.id}-7d-20260818.json"
    ) in res.headers["content-disposition"]


@pytest.mark.asyncio
async def test_feedback_summary_markdown_export_contains_summary_and_daily_trend(
    app_client, make_user, db_session
):
    user = make_user(email="fb-sum-md@test.com", tier=UserTier.PRO)
    db_session.add(_make_feedback(user_id=user.id, suffix="correct", verdict="correct"))
    db_session.add(_make_feedback(user_id=user.id, suffix="wrong", verdict="wrong"))
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/feedback/summary/export.md?window_days=7",
        headers=headers,
    )

    assert res.status_code == 200
    assert "text/markdown" in res.headers["content-type"]
    assert 'filename="arena-feedback-activity-' in res.headers["content-disposition"]
    assert "# Arena — feedback activity" in res.text
    assert "## Lifetime verdict breakdown" in res.text
    assert "| Correct | 1 |" in res.text
    assert "| Wrong | 1 |" in res.text
    assert "Accuracy: **50.0%**" in res.text
    assert "## Daily activity (7-day window, UTC)" in res.text
    assert "| Date | Ratings | Correct | Partial | Wrong |" in res.text
    assert "| 2026-" in res.text
    assert "_Exported from Arena_" in res.text
    assert res.headers["x-content-type-options"] == "nosniff"


@pytest.mark.asyncio
async def test_feedback_summary_markdown_export_handles_empty_window(
    app_client, make_user
):
    user = make_user(email="fb-sum-md-empty@test.com", tier=UserTier.PRO)
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}

    res = await app_client.get(
        "/api/agent/feedback/summary/export.md?window_days=1",
        headers=headers,
    )

    assert res.status_code == 200
    assert "| Total | 0 |" in res.text
    assert "Accuracy: **0.0%**" in res.text
    assert res.text.endswith("_Exported from Arena_\n")


@pytest.mark.asyncio
async def test_feedback_summary_markdown_filename_matches_window_end_at_utc_midnight(
    app_client, make_user, monkeypatch
):
    user = make_user(email="fb-sum-md-midnight@test.com", tier=UserTier.PRO)
    aggregation_now = datetime(2026, 8, 18, 23, 59, 59)
    next_day = datetime(2026, 8, 19, 0, 0, 1)
    monkeypatch.setattr(agent_metrics, "utcnow_naive", lambda: aggregation_now)
    monkeypatch.setattr(agent_routes, "utcnow_naive", lambda: next_day)

    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}
    res = await app_client.get(
        "/api/agent/feedback/summary/export.md?window_days=7",
        headers=headers,
    )

    assert res.status_code == 200
    assert (
        'filename="arena-feedback-activity-'
        f"{user.id}-7d-20260818.md"
    ) in res.headers["content-disposition"]


def test_feedback_summary_markdown_escapes_table_values():
    payload = {
        "window_days": 1,
        "verdicts": {"correct": 1, "partial": 0, "wrong": 0},
        "total": 1,
        "rate": 1.0,
        "daily_trend": [{
            "date": "2026-08-18|injected",
            "count": "1\n| forged",
            "verdicts": {"correct": 1, "partial": 0, "wrong": 0},
        }],
    }

    report = agent_routes._feedback_summary_markdown(payload)

    assert r"2026-08-18\|injected" in report
    assert r"1 \| forged" in report
    assert "\n| forged" not in report


@pytest.mark.asyncio
async def test_feedback_summary_json_export_requires_auth(app_client):
    res = await app_client.get("/api/agent/feedback/summary/export.json")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_feedback_summary_csv_export_requires_auth(app_client):
    res = await app_client.get("/api/agent/feedback/summary/export.csv")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_feedback_summary_markdown_export_requires_auth(app_client):
    res = await app_client.get("/api/agent/feedback/summary/export.md")
    assert res.status_code == 401


# ─── Accuracy rate pinning (cycle-34 bug) ────────────────────────────────────
# Bug: rate was computed as total/total, always 1.0 for any non-zero feedback.
# Fix: rate = correct / total (accuracy). Tests below pin the new contract
# so the bug can't return — a regression to total/total would produce 1.0
# in test_accuracy_rate_pins_correct_over_total below.


def test_accuracy_rate_is_zero_when_no_feedback(db_session, make_user):
    user = make_user(email="fb-acc-zero@test.com", tier=UserTier.PRO)
    db_session.add(user); db_session.commit(); db_session.refresh(user)
    payload = compute_user_feedback_summary(db=db_session, user=user)
    assert payload["total"] == 0
    assert payload["rate"] == 0


def test_accuracy_rate_is_one_when_all_correct(db_session, make_user):
    user = make_user(email="fb-acc-all-correct@test.com", tier=UserTier.PRO)
    db_session.add(user); db_session.commit(); db_session.refresh(user)
    for i in range(5):
        db_session.add(_make_feedback(user_id=user.id, suffix=f"c-{i}", verdict="correct"))
    db_session.commit()

    payload = compute_user_feedback_summary(db=db_session, user=user)
    assert payload["total"] == 5
    assert payload["rate"] == 1.0


def test_accuracy_rate_is_zero_when_all_wrong(db_session, make_user):
    user = make_user(email="fb-acc-all-wrong@test.com", tier=UserTier.PRO)
    db_session.add(user); db_session.commit(); db_session.refresh(user)
    for i in range(3):
        db_session.add(_make_feedback(user_id=user.id, suffix=f"w-{i}", verdict="wrong"))
    db_session.commit()

    payload = compute_user_feedback_summary(db=db_session, user=user)
    assert payload["total"] == 3
    assert payload["rate"] == 0


def test_accuracy_rate_pins_correct_over_total(db_session, make_user):
    """The cycle-34 regression guard.

    3 correct, 2 partial, 1 wrong out of 6 must give accuracy 0.5.
    If rate regresses to total/total, this would fail (would be 1.0).
    """
    user = make_user(email="fb-acc-mixed@test.com", tier=UserTier.PRO)
    db_session.add(user); db_session.commit(); db_session.refresh(user)
    for verdict, count in [("correct", 3), ("partial", 2), ("wrong", 1)]:
        for i in range(count):
            db_session.add(
                _make_feedback(
                    user_id=user.id,
                    suffix=f"{verdict}-{i}",
                    verdict=verdict,
                )
            )
    db_session.commit()

    payload = compute_user_feedback_summary(db=db_session, user=user)
    assert payload["total"] == 6
    assert payload["rate"] == round(3 / 6, 4)  # = 0.5; NOT 1.0
