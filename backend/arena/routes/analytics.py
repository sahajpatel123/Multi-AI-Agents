"""Analytics and UX tracking routes."""

from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from arena.core.auth import get_current_user_optional, get_current_user_required
from arena.core.model_router import get_all_routes_summary
from arena.core.observability import log_ux_event
from arena.database import get_db
from arena.db_models import PersonaDriftLog, SavedResponse, ScoringAudit, SessionSummary, UsageRecord, UXEvent, UserPreference
from arena.models.schemas import UserResponse

router = APIRouter(tags=["analytics"])

VALID_EVENT_TYPES = {
    "card_click",
    "deeper_opened",
    "debate_started",
    "discuss_started",
    "response_liked",
    "response_disliked",
    "response_saved",
    "response_shared",
    "response_copied",
    "leaderboard_viewed",
    "personas_viewed",
    "persona_swapped",
    "panel_saved",
    "new_chat_clicked",
}


class UXEventRequest(BaseModel):
    session_id: str
    event_type: str
    persona_id: str | None = None
    agent_id: str | None = None
    metadata: dict | None = None


@router.post("/analytics/event")
async def track_event(
    body: UXEventRequest,
    db: Session = Depends(get_db),
    user: UserResponse | None = Depends(get_current_user_optional),
) -> dict:
    if body.event_type not in VALID_EVENT_TYPES:
        raise HTTPException(status_code=422, detail={"error": "validation_error", "message": "Invalid event_type"})
    try:
        await log_ux_event(
            session_id=body.session_id,
            event_type=body.event_type,
            user_id=user.id if user else None,
            persona_id=body.persona_id,
            agent_id=body.agent_id,
            metadata=body.metadata,
            db=db,
        )
    except Exception:
        pass
    return {"status": "tracked"}


@router.get("/analytics/summary")
async def analytics_summary(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    preference = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    scoring_rows = db.query(ScoringAudit).filter(ScoringAudit.user_id == user.id).all()
    event_rows = db.query(UXEvent).filter(UXEvent.user_id == user.id).all()
    summary_rows = db.query(SessionSummary).filter(SessionSummary.user_id == user.id).all()
    drift_rows = db.query(PersonaDriftLog).filter(PersonaDriftLog.user_id == user.id).all()
    saved_count = db.query(SavedResponse).filter(SavedResponse.user_id == user.id).count()

    persona_wins = Counter(row.winner_persona_id for row in scoring_rows if row.winner_persona_id)
    event_counts = Counter(row.event_type for row in event_rows)
    topic_counts = Counter()
    for row in summary_rows:
        for topic in row.main_topics or []:
            topic_counts[topic] += 1

    persona_engagement: dict[str, dict[str, int]] = defaultdict(lambda: {"deeper_opened": 0, "liked": 0, "saved": 0, "debated": 0})
    for row in event_rows:
        if not row.persona_id:
            continue
        if row.event_type == "deeper_opened":
            persona_engagement[row.persona_id]["deeper_opened"] += 1
        if row.event_type == "response_liked":
            persona_engagement[row.persona_id]["liked"] += 1
        if row.event_type == "response_saved":
            persona_engagement[row.persona_id]["saved"] += 1
        if row.event_type == "debate_started":
            persona_engagement[row.persona_id]["debated"] += 1

    # Count from usage_records instead of user_preferences
    total_prompts = db.query(func.count(UsageRecord.id)).filter(
        UsageRecord.user_id == user_id
    ).scalar() or 0

    total_debates = db.query(func.count(UsageRecord.id)).filter(
        UsageRecord.user_id == user_id,
        UsageRecord.mode == 'debate'
    ).scalar() or 0

    total_discusses = db.query(func.count(UsageRecord.id)).filter(
        UsageRecord.user_id == user_id,
        UsageRecord.mode == 'discuss'
    ).scalar() or 0

    # Calculate avg_session_prompts from usage_records
    distinct_sessions = db.query(func.count(func.distinct(UsageRecord.session_id))).filter(
        UsageRecord.user_id == user_id
    ).scalar() or 1

    avg_session_prompts = round(total_prompts / max(distinct_sessions, 1), 1)

    avg_winning_score = 0.0
    if scoring_rows:
        avg_winning_score = sum(row.winner_score for row in scoring_rows) / len(scoring_rows)

    drift_rate = 0.0
    if drift_rows:
        drift_rate = sum(1 for row in drift_rows if row.drift_detected) / len(drift_rows)

    return {
        "total_prompts": int(total_prompts),
        "total_debates": int(total_debates),
        "total_discusses": int(total_discusses),
        "total_saved": saved_count,
        "persona_wins": dict(persona_wins),
        "top_persona_by_wins": persona_wins.most_common(1)[0][0] if persona_wins else None,
        "most_used_event": event_counts.most_common(1)[0][0] if event_counts else None,
        "avg_session_prompts": round(avg_session_prompts, 1),
        "topic_distribution": [{"topic": topic, "count": count} for topic, count in topic_counts.most_common(10)],
        "persona_engagement": dict(persona_engagement),
        "avg_winning_score": round(avg_winning_score, 1),
        "drift_rate": round(drift_rate, 2),
    }


@router.get("/admin/routes")
async def admin_routes_summary(
    user: UserResponse = Depends(get_current_user_required),
) -> dict:
    return get_all_routes_summary()
