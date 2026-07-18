"""Regression tests for the Condura handoff reconciler.

These exist specifically so `mark_stale_handoffs` can never become dead
code silently — the audit found it had zero callers; now the scheduler
calls it AND these tests call it directly. If either path is removed,
this test fails.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from arena.core.datetime_utils import utcnow_naive




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

        old = utcnow_naive() - timedelta(hours=12)
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
            updated_at=utcnow_naive(),
            created_at=utcnow_naive(),
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


def test_purge_expired_handoffs_deletes_only_terminal_old_rows(isolated_db):
    from arena.core.condura_reconciler import purge_expired_handoffs
    from arena.core.handoff_status import COMPLETE, STREAMING
    from arena.db_models import HandoffRecord, User, UserTier

    SessionLocal = isolated_db
    db = SessionLocal()
    try:
        u = User(
            email="purge@test.com",
            password_hash="x",
            tier=UserTier.PRO,
            name="Purge",
        )
        db.add(u)
        db.commit()
        db.refresh(u)

        very_old = utcnow_naive() - timedelta(days=200)
        recent = utcnow_naive()
        expired = HandoffRecord(
            user_id=u.id,
            capability="agent.long_research",
            execution_env="hybrid_delegate",
            status=COMPLETE,
            retention_class="standard",
            created_at=very_old,
            updated_at=very_old,
        )
        expired_delegate = HandoffRecord(
            user_id=u.id,
            capability="agent.long_research",
            execution_env="hybrid_delegate",
            status=COMPLETE,
            retention_class="delegate",
            created_at=very_old,
            updated_at=very_old,
        )
        still_fresh = HandoffRecord(
            user_id=u.id,
            capability="agent.research",
            execution_env="web",
            status=COMPLETE,
            retention_class="standard",
            created_at=recent,
            updated_at=recent,
        )
        in_flight = HandoffRecord(
            user_id=u.id,
            capability="app.open_in_linear",
            execution_env="condura",
            status=STREAMING,
            retention_class="standard",
            created_at=very_old,
            updated_at=very_old,
        )
        db.add_all([expired, expired_delegate, still_fresh, in_flight])
        db.commit()

        n = purge_expired_handoffs(db)
        # expired: standard + >180d → deleted ✓
        # expired_delegate: delegate + <365d → NOT deleted (only ~200d old)
        # still_fresh: recent → not deleted ✓
        # in_flight: streaming → not deleted (not terminal) ✓
        assert n == 1, f"expected 1 expired row purged, got {n}"

        all_ids = {r.id for r in db.query(HandoffRecord).all()}
        assert expired.id not in all_ids
        assert expired_delegate.id in all_ids  # delegate gets 365d
        assert still_fresh.id in all_ids
        assert in_flight.id in all_ids
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