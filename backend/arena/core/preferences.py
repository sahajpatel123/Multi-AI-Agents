"""User preference inference and CRUD helpers."""

from __future__ import annotations

from collections import Counter
from typing import Any

from sqlalchemy.orm import Session

from arena.db_models import UserPreference


def _ensure_preferences(user_id: int, db: Session) -> UserPreference:
    preferences = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    if preferences:
        return preferences

    preferences = UserPreference(user_id=user_id)
    db.add(preferences)
    db.commit()
    db.refresh(preferences)
    return preferences


async def get_user_preferences(user_id: int, db: Session) -> UserPreference:
    return _ensure_preferences(user_id, db)


async def update_user_preferences(user_id: int, updates: dict[str, Any], db: Session) -> UserPreference:
    preferences = _ensure_preferences(user_id, db)
    for key, value in updates.items():
        if hasattr(preferences, key):
            setattr(preferences, key, value)
    db.add(preferences)
    db.commit()
    db.refresh(preferences)
    return preferences


async def infer_preferences_from_session(user_id: int, session_data: dict[str, Any], db: Session) -> None:
    preferences = _ensure_preferences(user_id, db)
    exchanges = list(session_data.get("exchanges") or [])
    summary = session_data.get("summary") or {}

    if exchanges:
        avg_prompt_length = sum(len(exchange.get("prompt", "")) for exchange in exchanges) / len(exchanges)
        if avg_prompt_length < 60:
            preferences.preferred_depth = "brief"
        elif avg_prompt_length < 180:
            preferences.preferred_depth = "moderate"
        else:
            preferences.preferred_depth = "deep"

    winning_personas = [
        exchange.get("winner_persona_id")
        for exchange in exchanges
        if exchange.get("winner_persona_id")
    ]
    if winning_personas:
        preferences.trusted_persona_id = Counter(winning_personas).most_common(1)[0][0]
    elif summary.get("trusted_persona"):
        preferences.trusted_persona_id = summary["trusted_persona"]

    topics = list(preferences.topic_interests or [])
    for topic in summary.get("main_topics", []):
        if topic and topic not in topics:
            topics.append(topic)
    preferences.topic_interests = topics[-12:]

    preferences.total_prompts = int(preferences.total_prompts or 0) + len(exchanges)

    panel_counter: Counter[tuple[str, ...]] = Counter()
    for exchange in exchanges:
        panel = tuple(
            response.get("persona_id")
            for response in exchange.get("all_responses", [])
            if response.get("persona_id")
        )
        if len(panel) == 4:
            panel_counter[panel] += 1
    if panel_counter:
        preferences.most_used_panel = list(panel_counter.most_common(1)[0][0])

    db.add(preferences)
    db.commit()
