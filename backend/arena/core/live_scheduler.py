"""Background scheduler for due live research thread checks."""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import or_
from sqlalchemy.orm import Session

from arena.core.datetime_utils import utcnow_naive
from arena.core.live_thread_checker import check_live_task
from arena.database import SessionLocal
from arena.db_models import AgentTask

logger = logging.getLogger("arena.live_scheduler")


async def run_due_live_checks(db: Session) -> None:
    now = utcnow_naive()
    due = (
        db.query(AgentTask)
        .filter(
            AgentTask.is_live.is_(True),
            or_(
                AgentTask.live_next_check.is_(None),
                AgentTask.live_next_check <= now,
            ),
        )
        .order_by(AgentTask.live_next_check.asc())
        .limit(20)
        .all()
    )
    for task in due:
        try:
            await check_live_task(task, db)
        except Exception as e:
            logger.warning("[LIVE] check failed task id=%s: %s", task.id, e)


async def schedule_live_checks() -> None:
    """Run due checks immediately on first iteration, then every 6 hours."""
    while True:
        try:
            db = SessionLocal()
            try:
                await run_due_live_checks(db)
            finally:
                db.close()
        except Exception:
            logger.exception("[LIVE] scheduler cycle failed")
        await asyncio.sleep(6 * 3600)
