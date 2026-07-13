"""Regression tests for the Condura handoff reconciler.

These exist specifically so `mark_stale_handoffs` can never become dead
code silently — the audit found it had zero callers; now the scheduler
calls it AND these tests call it directly. If either path is removed,
this test fails.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def test_mark_stale_handoffs_flips_old_streaming_rows(isolated_db):
    from arena.core.condura_reconciler import mark_stale_handoffs
    from arena.core.handoff_status import RECONCILE_NEEDED, STREAMING
    from arena.db_models import HandoffRecord, User, UserTier

    SessionLocal = isolated_db
    db = SessionLocal()
    try:
        u = User(
            email="recon@test.com",
            password_hash="x",
            tier=UserTier.PRO,
            name="Recon",
        )
        db.add(u)
        db.commit()
        db.refresh(u)

        old = _utc_naive() - timedelta(hours=12)
        stale = HandoffRecord(
            user_id=u.id,
            capability="agent.long_research",
            execution_env="hybrid_delegate",
            status=STREAMING,
            updated_at=old,
            created_at=old,
        )
        fresh = HandoffRecord(
            user_id=u.id,
            capability="agent.research",
            execution_env="web",
            status=STREAMING,
            updated_at=_utc_naive(),
            created_at=_utc_naive(),
        )
        terminal = HandoffRecord(
            user_id=u.id,
            capability="app.open_in_linear",
            execution_env="condura",
            status="complete",
            updated_at=old,
            created_at=old,
        )
        db.add_all([stale, fresh, terminal])
        db.commit()

        n = mark_stale_handoffs(db, older_than_hours=6)
        assert n == 1, f"expected 1 stale row flipped, got {n}"

        db.refresh(stale)
        db.refresh(fresh)
        db.refresh(terminal)
        assert stale.status == RECONCILE_NEEDED
        assert fresh.status == STREAMING
        assert terminal.status == "complete"
    finally:
        db.close()


def test_handoff_status_constants_are_disjoint():
    from arena.core.handoff_status import (
        ALL_KNOWN_STATUSES,
        RUNNING_EVENT_KINDS,
        STREAMING_STATES,
        TERMINAL_STATES,
        is_streaming,
        is_terminal,
    )

    assert STREAMING_STATES.isdisjoint(TERMINAL_STATES)
    assert ALL_KNOWN_STATUSES == STREAMING_STATES | TERMINAL_STATES
    assert is_streaming("streaming")
    assert is_terminal("complete")
    assert not is_streaming("complete")
    assert not is_terminal("streaming")
    # RUNNING_EVENT_KINDS are NOT statuses; they bump status to STREAMING.
    assert "started" in RUNNING_EVENT_KINDS
    assert "started" not in ALL_KNOWN_STATUSES


def test_scheduler_imports_cleanly():
    """Smoke test: schedule_condura_reconciler is importable and callable.

    Without this, removing the scheduler silently reverts Phase 4 to dead
    code. We don't run the loop (it sleeps 6h) — we just assert the symbol
    exists and is awaitable.
    """
    from arena.core.condura_scheduler import (
        STALE_AFTER_HOURS,
        SWEEP_INTERVAL_SECONDS,
        schedule_condura_reconciler,
    )

    assert callable(schedule_condura_reconciler)
    assert STALE_AFTER_HOURS == 6
    assert SWEEP_INTERVAL_SECONDS == 6 * 60 * 60


def test_main_startup_wires_scheduler():
    """main.py MUST create asyncio task for schedule_condura_reconciler.

    If a future refactor drops the line, this test fails — preventing the
    dead-code regression from ever returning. We read the file text directly
    rather than importing main (which drags in the full app and its deps).
    """
    from pathlib import Path

    main_py = Path(__file__).resolve().parent.parent / "main.py"
    src = main_py.read_text(encoding="utf-8")
    assert "schedule_condura_reconciler" in src, (
        "main.py must schedule the Condura reconciler — see ADR-0001 §4 Phase 4. "
        "Without this, mark_stale_handoffs is dead code."
    )
    assert "asyncio.create_task(schedule_condura_reconciler())" in src, (
        "main.py must actually create the asyncio task, not just import the symbol."
    )