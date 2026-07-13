"""Phase 4 reconciler stub: flag stale handoff mirrors for user rejoin.

True reconciliation is browser-mediated (no server path to Condura).
This job only marks mirror rows that look abandoned so the UI can prompt
the user to reopen Condura with Last-Event-ID resume.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def mark_stale_handoffs(db: Session, *, older_than_hours: int = 6) -> int:
    from arena.db_models import HandoffRecord

    cutoff = _utc_naive() - timedelta(hours=older_than_hours)
    rows = (
        db.query(HandoffRecord)
        .filter(
            HandoffRecord.status.in_(["streaming", "dispatched", "dispatch_pending"]),
            HandoffRecord.updated_at < cutoff,
        )
        .all()
    )
    n = 0
    for row in rows:
        row.status = "reconcile_needed"
        row.updated_at = _utc_naive()
        n += 1
    if n:
        db.commit()
    logger.info("Condura reconciler: marked %s handoffs reconcile_needed", n)
    return n
