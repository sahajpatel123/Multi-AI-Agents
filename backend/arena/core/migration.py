"""One-time scan for existing state affected by Condura honest rejection.

Orchestrations are web-only by capability design; no scan needed.
"""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)




def audit_existing_state_for_condura_impact(db: Session) -> dict[str, Any]:
    """Flag WatchlistItem and live AgentTask rows that may need Condura.

    Does not cancel anything. Creates MigrationFlag rows for user review.
    Safe to run multiple times (skips existing unresolved flags).
    """
    from arena.core.capabilities import classify_task_text, requires_local_rejection
    from arena.db_models import AgentTask, MigrationFlag, MigrationKind, WatchlistItem

    created = 0
    watched = 0
    live = 0

    watch_items = db.query(WatchlistItem).filter(WatchlistItem.is_active.is_(True)).all()
    for item in watch_items:
        watched += 1
        env = classify_task_text(item.question or "")
        if not requires_local_rejection(env):
            continue
        exists = (
            db.query(MigrationFlag)
            .filter(
                MigrationFlag.user_id == item.user_id,
                MigrationFlag.kind == MigrationKind.WATCHLIST_ITEM,
                MigrationFlag.ref_id == str(item.id),
                MigrationFlag.resolved_at.is_(None),
            )
            .first()
        )
        if exists:
            continue
        db.add(
            MigrationFlag(
                user_id=item.user_id,
                kind=MigrationKind.WATCHLIST_ITEM,
                ref_id=str(item.id),
                affected_capability=env.value,
                surfaced_at=utcnow_naive(),
            )
        )
        created += 1

    live_tasks = (
        db.query(AgentTask)
        .filter(AgentTask.is_live.is_(True))
        .all()
    )
    for row in live_tasks:
        live += 1
        env = classify_task_text(row.task_text or "")
        if not requires_local_rejection(env):
            # Live tasks that stay web still get a soft notice once if we want;
            # for now only flag true local-intent tasks.
            continue
        exists = (
            db.query(MigrationFlag)
            .filter(
                MigrationFlag.user_id == row.user_id,
                MigrationFlag.kind == MigrationKind.LIVE_AGENT_TASK,
                MigrationFlag.ref_id == str(row.task_id),
                MigrationFlag.resolved_at.is_(None),
            )
            .first()
        )
        if exists:
            continue
        db.add(
            MigrationFlag(
                user_id=row.user_id,
                kind=MigrationKind.LIVE_AGENT_TASK,
                ref_id=str(row.task_id),
                affected_capability=env.value,
                surfaced_at=utcnow_naive(),
            )
        )
        created += 1

    if created:
        db.commit()
    logger.info(
        "Condura migration scan: watchlist=%s live=%s flags_created=%s",
        watched,
        live,
        created,
    )
    return {
        "watchlist_scanned": watched,
        "live_tasks_scanned": live,
        "flags_created": created,
    }


def list_open_flags_for_user(db: Session, user_id: int) -> list[dict[str, Any]]:
    from arena.db_models import MigrationFlag

    rows = (
        db.query(MigrationFlag)
        .filter(
            MigrationFlag.user_id == user_id,
            MigrationFlag.resolved_at.is_(None),
        )
        .order_by(MigrationFlag.surfaced_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "kind": r.kind.value if hasattr(r.kind, "value") else str(r.kind),
            "ref_id": r.ref_id,
            "affected_capability": r.affected_capability,
            "surfaced_at": r.surfaced_at.isoformat() if r.surfaced_at else None,
        }
        for r in rows
    ]


def summarize_flags_for_user(db: Session, user_id: int) -> dict[str, Any]:
    """Aggregate counts of open migration flags by kind and capability.

    Cheaper than /migration-flags when the UI wants a status badge
    ("3 flags pending") instead of the full row list. Single query
    per axis, scoped to the caller's user_id.
    """
    from arena.db_models import MigrationFlag

    open_q = db.query(MigrationFlag).filter(
        MigrationFlag.user_id == user_id,
        MigrationFlag.resolved_at.is_(None),
    )

    total_open = open_q.count()

    # Group by kind. SQL GROUP BY on the enum string is portable
    # across SQLite (test) and Postgres (prod).
    by_kind_rows = (
        db.query(MigrationFlag.kind, func.count(MigrationFlag.id))
        .filter(
            MigrationFlag.user_id == user_id,
            MigrationFlag.resolved_at.is_(None),
        )
        .group_by(MigrationFlag.kind)
        .all()
    )
    by_kind = {
        (k.value if hasattr(k, "value") else str(k)): int(c)
        for k, c in by_kind_rows
    }

    by_capability_rows = (
        db.query(MigrationFlag.affected_capability, func.count(MigrationFlag.id))
        .filter(
            MigrationFlag.user_id == user_id,
            MigrationFlag.resolved_at.is_(None),
        )
        .group_by(MigrationFlag.affected_capability)
        .all()
    )
    by_capability = {cap: int(c) for cap, c in by_capability_rows}

    return {
        "total_open": int(total_open),
        "by_kind": by_kind,
        "by_capability": by_capability,
    }


def resolve_flag(
    db: Session,
    user_id: int,
    flag_id: int,
    decision: str,
) -> bool:
    from arena.db_models import MigrationFlag

    row = (
        db.query(MigrationFlag)
        .filter(
            MigrationFlag.id == flag_id,
            MigrationFlag.user_id == user_id,
            MigrationFlag.resolved_at.is_(None),
        )
        .first()
    )
    if not row:
        return False
    row.resolved_at = utcnow_naive()
    row.user_decision = decision[:64]
    db.commit()
    return True
