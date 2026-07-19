"""Metrics route — /api/metrics

Admin-gated. Returns JSON aggregates for ops/observability:
- request counts by mode (arena | agent) over the last 24h and 7d
- p50/p95 latency from total_processing_ms over the last 24h
- token + USD cost totals
- persona win rates (who actually wins most often)
- scoring fallback rate
- error counts (rows where fallback_used=true or persona_drift)
- per-tier request volume (last 24h)
- hourly request volume time-series (last 24h, zero-filled)
- error count + rate (fallback + slow requests, last 24h)
- Cache-Control: private, max-age=15 so dashboards can re-poll cheaply

Lightweight on purpose: returns a single JSON payload, no Prometheus. This is
deliberately behind a separate admin check so it can be hit by an internal
dashboard or a curl from ops without exposing detail to regular users.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required_orm
from arena.core.rate_limits import enforce_user_rate_limit
from arena.database import get_db
from arena.db_models import ScoringAudit, UsageRecord, User, UserTier
from arena.core.datetime_utils import utcnow_naive

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


def _admin_only(user: User) -> None:
    """Lightweight admin gate — shared with Condura metrics."""
    from arena.core.admin_gate import require_admin_email

    require_admin_email(getattr(user, "email", None))


def _percentile(values: list[int], pct: float) -> int:
    """Linear-interpolated percentile; tolerant of small samples."""
    if not values:
        return 0
    sorted_vals = sorted(values)
    idx = max(0, min(len(sorted_vals) - 1, int(round((pct / 100.0) * (len(sorted_vals) - 1)))))
    return sorted_vals[idx]


@router.get("")
async def get_metrics(
    response: Response,
    user: User = Depends(get_current_user_required_orm),
    db: Session = Depends(get_db),
) -> dict:
    _admin_only(user)
    # Even admins are capped — heavy aggregates should not be free to hammer.
    enforce_user_rate_limit(
        user.id,
        scope="metrics_admin",
        limit=30,
        window_seconds=60,
        message="Too many metrics polls. Limit is 30 per minute.",
    )

    # Cache-Control: ops dashboards re-hit this on a fixed cadence (typically
    # 30s), and the underlying UsageRecord scan is the heaviest query in the
    # route. 15s keeps the UI responsive without letting a slow dashboard hold
    # an unbounded result in client memory. ``private`` prevents shared caches
    # from accidentally leaking admin data; ``s-maxage`` lets a CDN serve
    # multiple admins from one origin hit.
    response.headers["Cache-Control"] = "private, max-age=15, s-maxage=15"

    now = utcnow_naive()
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
    user_rows = (
        db.query(User.tier, func.count(User.id))
        .group_by(User.tier)
        .all()
    )
    user_counts = {str(row[0]): int(row[1]) for row in user_rows}

    # ── Request volume by tier (last 24h) ───────────────────────────────────
    # Join through User so we can answer "how much load is the Pro tier
    # generating right now?" without a second hop. UsageRecord.user_id is
    # nullable for guest IPs, so we COALESCE to GUEST rather than discard
    # those rows — losing guest volume from the breakdown would hide the
    # segment that's usually growing fastest.
    tier_rows = (
        db.query(
            func.coalesce(User.tier, UserTier.GUEST).label("tier"),
            func.count(UsageRecord.id).label("count"),
        )
        .outerjoin(User, UsageRecord.user_id == User.id)
        .filter(UsageRecord.timestamp >= last_24h)
        .group_by("tier")
        .all()
    )
    volume_by_tier_24h = {
        str(row.tier.value if hasattr(row.tier, "value") else row.tier): int(row.count)
        for row in tier_rows
    }

    # ── Hourly request volume, last 24h ─────────────────────────────────────
    # Bucket by hour so a dashboard can render a sparkline without a second
    # request. strftime works on both SQLite (test) and Postgres (prod);
    # %H extracts the hour component. The Python loop below zero-fills sparse
    # buckets so the frontend never has to.
    hourly_label = func.strftime("%Y-%m-%dT%H:00:00", UsageRecord.timestamp)
    hourly_rows = (
        db.query(hourly_label.label("hour"), func.count(UsageRecord.id).label("count"))
        .filter(UsageRecord.timestamp >= last_24h)
        .group_by("hour")
        .all()
    )
    counts_by_hour = {row.hour: int(row.count) for row in hourly_rows}

    hourly_volume = []
    # Floor now to the current hour so the rightmost bucket always represents
    # "this hour, so far" — visually clearer than a partial bucket, and
    # matches what strftime rounds DOWN to for any record in this hour.
    # We walk offsets oldest-first so series[0] is the chronologically-first
    # bucket (23h ago) and series[-1] is "right now" — the natural order
    # for a sparkline / chart X-axis.
    anchor = now.replace(minute=0, second=0, microsecond=0)
    for offset in range(23, -1, -1):
        bucket = anchor - timedelta(hours=offset)
        key = bucket.strftime("%Y-%m-%dT%H:00:00")
        hourly_volume.append({
            "hour": key,
            "requests": counts_by_hour.get(key, 0),
        })
    # Frontends reading this want "newest first" for tables, "oldest first"
    # for charts — both are reasonable. Return newest-first so a dashboard
    # that just dumps the list shows recent activity at the top.
    hourly_volume.reverse()

    # ── Scoring error rate (last 24h) ───────────────────────────────────────
    # Two failure modes counted as "errors":
    #   1. fallback_used=true on ScoringAudit — the LLM judge failed and we
    #      degraded to deterministic scoring. Still served a result, but
    #      quality is unverified.
    #   2. Latency > 30s — almost certainly a hung pipeline the client gave
    #      up on. Surface before users start tweeting.
    error_24h = (
        db.query(func.count(ScoringAudit.id))
        .filter(
            ScoringAudit.created_at >= last_24h,
            ScoringAudit.fallback_used == True,  # noqa: E712
        )
        .scalar()
        or 0
    )
    slow_24h = (
        db.query(func.count(UsageRecord.id))
        .filter(
            UsageRecord.timestamp >= last_24h,
            UsageRecord.total_processing_ms > 30000,
        )
        .scalar()
        or 0
    )
    total_24h = (
        db.query(func.count(UsageRecord.id))
        .filter(UsageRecord.timestamp >= last_24h)
        .scalar()
        or 0
    )
    error_count_24h = int(error_24h) + int(slow_24h)
    error_rate_24h = (error_count_24h / total_24h) if total_24h else 0.0

    return {
        "as_of": now.isoformat(),
        "window_hours": 24,
        "request_volume_by_mode_7d": volume_by_mode,
        "request_volume_by_tier_24h": volume_by_tier_24h,
        "hourly_request_volume_24h": hourly_volume,
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
        "error_count_24h": error_count_24h,
        "error_rate_24h": round(error_rate_24h, 4),
        "user_count_by_tier": user_counts,
    }