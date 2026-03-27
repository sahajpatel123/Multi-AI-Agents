"""Background scheduler: run due watchlist agent pipelines."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from arena.core.blackboard import AgentStatus, create_blackboard
from arena.core.tier_config import has_feature, normalize_tier
from arena.database import SessionLocal
from arena.db_models import User, WatchlistItem

logger = logging.getLogger("arena.watchlist")


def _utc_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def run_due_watchlist() -> None:
    """Pick up to 10 due active items and start pipelines (one session per sweep)."""
    db = SessionLocal()
    try:
        now = _utc_naive()
        due = (
            db.query(WatchlistItem)
            .filter(WatchlistItem.is_active.is_(True), WatchlistItem.next_run_at <= now)
            .order_by(WatchlistItem.next_run_at.asc())
            .limit(10)
            .all()
        )
        for item in due:
            try:
                user = db.query(User).filter(User.id == item.user_id).first()
                if not user:
                    continue
                tier = normalize_tier(user.tier.value if hasattr(user.tier, "value") else str(user.tier))
                if not has_feature(tier, "agent_watchlist"):
                    continue

                q = (item.question or "").strip()
                if not q or len(q) > 2000:
                    logger.warning("[WATCHLIST] skip item id=%s: bad question", item.id)
                    continue

                bb = create_blackboard(user_id=item.user_id, task=q)
                bb.status = AgentStatus.RUNNING
                bb.expertise_level = (item.expertise_level or "curious").strip().lower() or "curious"
                bb.expertise_domain = (item.expertise_domain or "").strip()[:512]

                item.latest_task_id = bb.task_id
                item.last_run_at = now
                item.next_run_at = now + timedelta(hours=int(item.interval_hours))
                item.run_count = int(item.run_count or 0) + 1
                db.commit()

                from arena.routes.agent import run_agent_pipeline_background

                asyncio.create_task(
                    run_agent_pipeline_background(
                        bb.task_id,
                        item.user_id,
                        q,
                        bb.expertise_level,
                        bb.expertise_domain,
                        orchestration_id=None,
                        watchlist_item_id=item.id,
                    )
                )
            except Exception as e:
                logger.exception("[WATCHLIST] run failed item id=%s: %s", getattr(item, "id", "?"), e)
                try:
                    db.rollback()
                except Exception:
                    pass
    finally:
        db.close()


async def schedule_watchlist_checks() -> None:
    """Hourly sweep for due watchlist items."""
    while True:
        try:
            await run_due_watchlist()
        except Exception:
            logger.exception("[WATCHLIST] scheduler cycle failed")
        await asyncio.sleep(3600)
