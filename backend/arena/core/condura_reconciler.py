"""Phase 4 reconciler: flag stale handoff mirrors and purge expired rows.

Two passes per sweep:
1. mark_stale_handoffs — re-tag in-flight rows that haven't seen an event
   in STALE_AFTER_HOURS hours as RECONCILE_NEEDED.
2. purge_expired_handoffs — delete terminal handoff / event rows past their
   retention_class horizon (standard=180d, delegate=365d). Old events are
   removed with the parent handoff via CASCADE.

Both are scheduled by arena.core.condura_scheduler every 6h.
"""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from arena.core.handoff_status import RECONCILE_NEEDED, STREAMING_STATES, TERMINAL_STATES

logger = logging.getLogger(__name__)

# Retention horizons per retention_class tag.
_RETENTION_DAYS: dict[str, int] = {
    "standard": 180,
    "delegate": 365,
}




def mark_stale_handoffs(db: Session, *, older_than_hours: int = 6) -> int:
    from arena.db_models import HandoffRecord

    cutoff = utcnow_naive() - timedelta(hours=older_than_hours)
    rows = (
        db.query(HandoffRecord)
        .filter(
            HandoffRecord.status.in_(STREAMING_STATES),
            HandoffRecord.updated_at < cutoff,
        )
        .all()
    )
    n = 0
    for row in rows:
        row.status = RECONCILE_NEEDED
        row.updated_at = utcnow_naive()
        n += 1
    if n:
        db.commit()
    logger.info("Condura reconciler: marked %s handoffs %s", n, RECONCILE_NEEDED)
    return n


def purge_expired_handoffs(db: Session) -> int:
    """Delete terminal handoff rows past their retention horizon.

    Only deletes rows whose status is in TERMINAL_STATES (complete, failed,
    cancelled, stream_lost, reconcile_needed) and whose created_at is
    older than the retention_class horizon.  HandoffEvent rows are removed
    automatically via CASCADE.

    Returns number of HandoffRecord rows deleted.
    """
    from arena.db_models import HandoffRecord

    now = utcnow_naive()
    total = 0
    for retention_class, days in _RETENTION_DAYS.items():
        horizon = now - timedelta(days=days)
        rows = (
            db.query(HandoffRecord)
            .filter(
                HandoffRecord.retention_class == retention_class,
                HandoffRecord.status.in_(TERMINAL_STATES),
                HandoffRecord.created_at < horizon,
            )
            .all()
        )
        for row in rows:
            db.delete(row)
            total += 1
    if total:
        db.commit()
        logger.info("Condura reconciler: purged %s expired handoff rows", total)
    return total
