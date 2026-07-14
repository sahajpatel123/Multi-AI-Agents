"""Nightly scheduler for Condura handoff reconciliation.

Mirrors the watchlist_runner / live_scheduler pattern: opens an own DB
session per tick, calls condura_reconciler.mark_stale_handoffs() and
condura_reconciler.purge_expired_handoffs(), then sleeps until the next tick.

Reconciliation is browser-mediated by design (no server path to the user's
loopback). This job only flags stale mirror rows and prunes expired ones
so the UI doesn't accumulate drift. See ADR-0001 §4 Phase 4.
"""

from __future__ import annotations

import asyncio
import logging

from arena.core.condura_reconciler import mark_stale_handoffs, purge_expired_handoffs
from arena.database import SessionLocal

logger = logging.getLogger("arena.condura_scheduler")

# Sweep cadence. 6h matches the default stale window so a row that's been
# streaming-silent for one full sweep window is caught on the next tick.
SWEEP_INTERVAL_SECONDS = 6 * 60 * 60
STALE_AFTER_HOURS = 6


async def schedule_condura_reconciler() -> None:
    """Run one sweep on startup, then every SWEEP_INTERVAL_SECONDS.

    Bound to the FastAPI startup task — killed when the process exits.
    Swallows all exceptions so a transient DB hiccup never crashes the loop.
    """
    while True:
        try:
            db = SessionLocal()
            try:
                marked = mark_stale_handoffs(db, older_than_hours=STALE_AFTER_HOURS)
                purged = purge_expired_handoffs(db)
                if marked or purged:
                    logger.info(
                        "[CONDURA-RECONCILE] sweep: %s stale flagged, %s rows purged",
                        marked,
                        purged,
                    )
            finally:
                db.close()
        except Exception as exc:
            logger.warning("[CONDURA-RECONCILE] sweep failed: %s", exc)
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)