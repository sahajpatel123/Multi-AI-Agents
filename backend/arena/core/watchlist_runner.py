"""Background scheduler: run due watchlist agent pipelines."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from arena.core.blackboard import AgentStatus, create_blackboard
from arena.core.capabilities import evaluate_capability_gate
from arena.core.telemetry import record_guard_decision
from arena.core.tier_config import get_tier_str, has_feature, normalize_tier
from arena import database as arena_database
from arena.db_models import User, WatchlistItem

logger = logging.getLogger("arena.watchlist")




def _gate_watchlist_question(question: str) -> dict:
    """Apply the same honesty gate used by Agent HTTP entry points.

    Extracted so unit tests can drive the runner decision without starting
    a full pipeline or the async scheduler loop.
    """
    return evaluate_capability_gate(
        capability_id="watchlist.create",
        task_text=question,
    )


async def run_due_watchlist() -> None:
    """Pick up to 10 due active items and start pipelines (one session per sweep)."""
    # Late-bind SessionLocal so tests can monkeypatch arena.database.SessionLocal.
    db = arena_database.SessionLocal()
    try:
        now = utcnow_naive()
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
                tier = normalize_tier(get_tier_str(user))
                if not has_feature(tier, "agent_watchlist"):
                    continue

                q = (item.question or "").strip()
                if not q or len(q) > 2000:
                    logger.warning("[WATCHLIST] skip item id=%s: bad question", item.id)
                    continue

                # Re-apply honesty gate so items saved before the flag flip
                # (or that slipped create-time heuristics) cannot keep running
                # as pure web research theater.
                gate = _gate_watchlist_question(q)
                record_guard_decision(gate["capability_id"], f"watchlist_{gate['decision']}")
                if gate["decision"] == "reject":
                    logger.warning(
                        "[WATCHLIST] skip local-intent item id=%s env=%s "
                        "(needs Condura; honesty on)",
                        item.id,
                        gate["env"].value,
                    )
                    # Advance schedule so we do not spin every sweep; item
                    # stays active for user review / migration flags.
                    item.next_run_at = now + timedelta(hours=int(item.interval_hours or 24))
                    db.commit()
                    continue
                if gate["decision"] == "fallback":
                    logger.info(
                        "[WATCHLIST] local-intent item id=%s env=%s "
                        "(flag off — running web fallback)",
                        item.id,
                        gate["env"].value,
                    )

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
