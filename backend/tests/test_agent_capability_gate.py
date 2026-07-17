"""HTTP + runner integration for Condura honest rejection.

Drives shipped entry points:
- POST /api/agent/run (real FastAPI route + _enforce_capability_gate)
- watchlist_runner._gate_watchlist_question / decision path
- live_thread_checker._gate_live_task_text
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from arena.db_models import UserTier


@pytest.mark.asyncio
async def test_agent_run_409_when_honesty_on_local_intent(
    app_client, make_user, auth_headers, monkeypatch
):
    monkeypatch.setenv("CONDURA_HONEST_REJECTION_ENABLED", "true")
    user = make_user(email="pro-gate@test.com", tier=UserTier.PRO)
    headers = auth_headers(for_user=user)

    res = await app_client.post(
        "/api/agent/run",
        headers=headers,
        json={
            "task": "Open Linear and create a ticket from this research",
            "expertise_level": "curious",
        },
    )
    assert res.status_code == 409, res.text
    body = res.json()
    # FastAPI wraps HTTPException.detail
    detail = body.get("detail", body)
    assert detail["error"] == "requires_local_execution"
    assert detail["execution_environment"] in {"condura", "hybrid_delegate"}
    assert detail["handoff_spec"] == "arena.handoff.v1"
    assert "install_url" in detail


@pytest.mark.asyncio
async def test_agent_run_409_for_save_local_demo_phrasing(
    app_client, make_user, auth_headers, monkeypatch
):
    monkeypatch.setenv("CONDURA_HONEST_REJECTION_ENABLED", "true")
    user = make_user(email="pro-save@test.com", tier=UserTier.PRO)
    headers = auth_headers(for_user=user)

    res = await app_client.post(
        "/api/agent/run",
        headers=headers,
        json={
            "task": (
                "Write a concise research report on AI regulation, then save the report to "
                "~/Documents/brief.md on my machine."
            ),
            "expertise_level": "curious",
        },
    )
    assert res.status_code == 409, res.text
    detail = res.json().get("detail", res.json())
    assert detail["error"] == "requires_local_execution"


@pytest.mark.asyncio
async def test_agent_run_allows_web_research_when_honesty_on(
    app_client, make_user, auth_headers, monkeypatch
):
    monkeypatch.setenv("CONDURA_HONEST_REJECTION_ENABLED", "true")
    user = make_user(email="pro-web@test.com", tier=UserTier.PRO)
    headers = auth_headers(for_user=user)

    # Patch background pipeline so we do not run the full LLM stack.
    with patch(
        "arena.routes.agent.run_agent_pipeline_background",
        new_callable=AsyncMock,
    ):
        res = await app_client.post(
            "/api/agent/run",
            headers=headers,
            json={
                "task": "Research the B2B SaaS market size and growth trends",
                "expertise_level": "curious",
            },
        )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body.get("status") == "running"
    assert body.get("task_id")


@pytest.mark.asyncio
async def test_agent_run_fallback_no_409_when_flag_off(
    app_client, make_user, auth_headers, monkeypatch
):
    monkeypatch.delenv("CONDURA_HONEST_REJECTION_ENABLED", raising=False)
    user = make_user(email="pro-fallback@test.com", tier=UserTier.PRO)
    headers = auth_headers(for_user=user)

    with patch(
        "arena.routes.agent.run_agent_pipeline_background",
        new_callable=AsyncMock,
    ):
        res = await app_client.post(
            "/api/agent/run",
            headers=headers,
            json={
                "task": "Open Linear and create a ticket from this research",
                "expertise_level": "curious",
            },
        )
    # Flag off: staged-rollout fallback — allow web path (no hard 409).
    assert res.status_code == 200, res.text
    assert res.json().get("status") == "running"


def test_watchlist_gate_rejects_local_when_honesty_on(monkeypatch):
    from arena.core.watchlist_runner import _gate_watchlist_question

    monkeypatch.setenv("CONDURA_HONEST_REJECTION_ENABLED", "true")
    g = _gate_watchlist_question("Open Linear and create a ticket from this research")
    assert g["decision"] == "reject"
    assert g["error_body"]["error"] == "requires_local_execution"

    g2 = _gate_watchlist_question("Research quarterly AI regulation changes")
    assert g2["decision"] == "allow"


def test_watchlist_gate_fallback_when_flag_off(monkeypatch):
    from arena.core.watchlist_runner import _gate_watchlist_question

    monkeypatch.delenv("CONDURA_HONEST_REJECTION_ENABLED", raising=False)
    g = _gate_watchlist_question("Open Linear and create a ticket")
    assert g["decision"] == "fallback"


@pytest.mark.asyncio
async def test_run_due_watchlist_skips_local_intent_when_honesty_on(
    isolated_db, monkeypatch
):
    """Background runner must not start a pipeline for local-intent items."""
    from arena.core import watchlist_runner
    from arena.db_models import User, UserTier, WatchlistItem

    monkeypatch.setenv("CONDURA_HONEST_REJECTION_ENABLED", "true")
    SessionLocal = isolated_db
    db = SessionLocal()
    try:
        u = User(
            email="wl-gate@test.com",
            password_hash="x",
            tier=UserTier.PRO,
            name="WL",
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        item = WatchlistItem(
            user_id=u.id,
            question="Open Linear and create a ticket from this research",
            interval_hours=24,
            next_run_at=now - timedelta(minutes=1),
            is_active=True,
            expertise_level="curious",
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        item_id = item.id
        old_next = item.next_run_at
    finally:
        db.close()

    started: list = []

    async def _fake_pipeline(*args, **kwargs):
        started.append(args)

    monkeypatch.setattr(
        "arena.routes.agent.run_agent_pipeline_background",
        _fake_pipeline,
    )

    await watchlist_runner.run_due_watchlist()

    assert started == [], "local-intent watchlist item must not start web pipeline"

    db = SessionLocal()
    try:
        row = db.query(WatchlistItem).filter(WatchlistItem.id == item_id).first()
        assert row is not None
        assert row.is_active is True
        # Schedule advanced so the runner does not spin forever
        assert row.next_run_at is not None
        assert row.next_run_at > old_next
        assert row.latest_task_id is None or row.run_count in (0, None)
    finally:
        db.close()


def test_live_gate_rejects_local_when_honesty_on(monkeypatch):
    from arena.core.live_thread_checker import _gate_live_task_text

    monkeypatch.setenv("CONDURA_HONEST_REJECTION_ENABLED", "true")
    g = _gate_live_task_text("save the report to ~/Documents/out.md on my machine")
    assert g["decision"] == "reject"

    g2 = _gate_live_task_text("What changed in EU AI Act guidance this month?")
    assert g2["decision"] == "allow"


@pytest.mark.asyncio
async def test_check_live_task_skips_researcher_on_local_intent(
    isolated_db, monkeypatch
):
    from arena.core import live_thread_checker
    from arena.db_models import AgentTask, User, UserTier

    monkeypatch.setenv("CONDURA_HONEST_REJECTION_ENABLED", "true")
    SessionLocal = isolated_db
    db = SessionLocal()
    try:
        u = User(
            email="live-gate@test.com",
            password_hash="x",
            tier=UserTier.PRO,
            name="Live",
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        task = AgentTask(
            user_id=u.id,
            task_id="task-live-local-1",
            task_text="Open Linear and create a ticket from this research",
            final_answer="prior",
            is_live=True,
            live_next_check=now - timedelta(minutes=5),
        )
        db.add(task)
        db.commit()
        db.refresh(task)

        called = {"n": 0}

        async def _no_researcher(_task):
            called["n"] += 1
            return "should-not-run"

        monkeypatch.setattr(
            live_thread_checker,
            "run_researcher_for_live_task",
            _no_researcher,
        )

        result = await live_thread_checker.check_live_task(task, db)
        assert result is False
        assert called["n"] == 0
        db.refresh(task)
        assert task.live_last_checked is not None
        assert task.live_next_check is not None
        assert task.live_next_check > now
    finally:
        db.close()
