"""Migration scan covers watchlist + live agent tasks."""

from __future__ import annotations


def test_migration_scan_flags_local_watchlist(isolated_db):
    from arena.core.migration import audit_existing_state_for_condura_impact, list_open_flags_for_user
    from arena.db_models import User, UserTier, WatchlistItem
    from datetime import datetime, timedelta

    SessionLocal = isolated_db
    db = SessionLocal()
    try:
        u = User(
            email="mig@test.com",
            password_hash="x",
            tier=UserTier.PRO,
            name="Mig",
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        now = datetime.utcnow()
        db.add(
            WatchlistItem(
                user_id=u.id,
                question="Open Linear and create a ticket from this research",
                interval_hours=24,
                next_run_at=now + timedelta(hours=24),
                is_active=True,
            )
        )
        db.add(
            WatchlistItem(
                user_id=u.id,
                question="Research the B2B SaaS market",
                interval_hours=24,
                next_run_at=now + timedelta(hours=24),
                is_active=True,
            )
        )
        db.commit()
        result = audit_existing_state_for_condura_impact(db)
        assert result["flags_created"] >= 1
        flags = list_open_flags_for_user(db, u.id)
        assert any(f["kind"] == "watchlist_item" for f in flags)
    finally:
        db.close()
