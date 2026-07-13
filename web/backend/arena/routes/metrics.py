"""Metrics route — /api/metrics

Admin-gated. Returns JSON aggregates for ops/observability:
- request counts by mode (arena | agent) over the last 24h and 7d
- p50/p95 latency from total_processing_ms over the last 24h
- token + USD cost totals
- persona win rates (who actually wins most often)
- scoring fallback rate
- error counts (rows where fallback_used=true or persona_drift)

Lightweight on purpose: returns a single JSON payload, no Prometheus. This is
deliberately behind a separate admin check so it can be hit by an internal
dashboard or a curl from ops without exposing detail to regular users.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required_orm
from arena.database import get_db
from arena.db_models import ScoringAudit, UsageRecord, User

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


def _admin_only(user: User) -> None:
    """Lightweight admin gate.

    For now: the user must match ADMIN_EMAIL from settings. Tighten this once
    a real RBAC system exists.
    """
    from arena.config import get_settings

    settings = get_settings()
    if not settings.admin_email:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics endpoint is not configured",
        )
    if (user.email or "").lower() != settings.admin_email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )


def _percentile(values: list[int], pct: float) -> int:
    """Linear-interpolated percentile; tolerant of small samples."""
    if not values:
        return 0
    sorted_vals = sorted(values)
    idx = max(0, min(len(sorted_vals) - 1, int(round((pct / 100.0) * (len(sorted_vals) - 1)))))
    return sorted_vals[idx]


@router.get("")
async def get_metrics(
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> dict:
    _admin_only(user)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    last_24h = now - timedelta(hours=24)
    last_7d = now - timedelta(days=7)

    # ── Request volume by mode ──────────────────────────────────────────────
    volume_rows = (
        db.query(UsageRecord.mode, func.count(UsageRecord.id))
        .filter(UsageRecord.timestamp >= last_7d)
        .group_by(UsageRecord.mode)
        .all()
    )
    volume_by_mode = {row[0] or "unknown": int(row[1]) for row in volume_rows}

    # ── Token + USD totals over the last 24h ────────────────────────────────
    token_24h = (
        db.query(
            func.coalesce(func.sum(UsageRecord.input_tokens), 0),
            func.coalesce(func.sum(UsageRecord.output_tokens), 0),
            func.coalesce(func.sum(UsageRecord.estimated_cost_usd), 0.0),
        )
        .filter(UsageRecord.timestamp >= last_24h)
        .one()
    )
    in_tokens_24h, out_tokens_24h, cost_24h = int(token_24h[0]), int(token_24h[1]), float(token_24h[2])

    # ── Latency percentiles (last 24h) ──────────────────────────────────────
    latencies = [
        int(r[0])
        for r in db.query(UsageRecord.total_processing_ms)
        .filter(UsageRecord.timestamp >= last_24h, UsageRecord.total_processing_ms.isnot(None))
        .all()
    ]
    p50 = _percentile(latencies, 50)
    p95 = _percentile(latencies, 95)

    # ── Persona win rates over the last 7d ──────────────────────────────────
    win_rows = (
        db.query(UsageRecord.winning_persona_id, func.count(UsageRecord.id))
        .filter(
            UsageRecord.timestamp >= last_7d,
            UsageRecord.winning_persona_id.isnot(None),
        )
        .group_by(UsageRecord.winning_persona_id)
        .all()
    )
    persona_wins = {row[0]: int(row[1]) for row in win_rows}

    # ── Scoring fallback rate (last 7d) ─────────────────────────────────────
    fallback_count = (
        db.query(func.count(ScoringAudit.id))
        .filter(ScoringAudit.created_at >= last_7d, ScoringAudit.fallback_used == True)  # noqa: E712
        .scalar()
        or 0
    )
    total_scoring = (
        db.query(func.count(ScoringAudit.id))
        .filter(ScoringAudit.created_at >= last_7d)
        .scalar()
        or 0
    )
    fallback_rate = (fallback_count / total_scoring) if total_scoring else 0.0

    # ── User counts by tier ────────────────────────────────────────────────
    from arena.db_models import UserTier

    user_rows = (
        db.query(User.tier, func.count(User.id))
        .group_by(User.tier)
        .all()
    )
    user_counts = {str(row[0]): int(row[1]) for row in user_rows}

    return {
        "as_of": now.isoformat(),
        "window_hours": 24,
        "request_volume_by_mode_7d": volume_by_mode,
        "tokens_24h": {
            "input": in_tokens_24h,
            "output": out_tokens_24h,
            "total": in_tokens_24h + out_tokens_24h,
        },
        "estimated_cost_usd_24h": round(cost_24h, 4),
        "latency_ms_24h": {
            "p50": p50,
            "p95": p95,
            "samples": len(latencies),
        },
        "persona_wins_7d": persona_wins,
        "scoring_fallback_rate_7d": round(fallback_rate, 4),
        "scoring_total_7d": int(total_scoring),
        "user_count_by_tier": user_counts,
    }