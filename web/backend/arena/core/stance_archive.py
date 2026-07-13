"""Agent stance persistence helpers."""

from __future__ import annotations

import re
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from arena.db_models import AgentStance

STANCE_STOP_WORDS = {
    "the",
    "a",
    "an",
    "is",
    "are",
    "what",
    "how",
    "why",
    "when",
    "where",
    "should",
    "could",
    "would",
    "tell",
    "me",
    "about",
    "do",
    "does",
    "i",
    "my",
    "in",
    "of",
    "to",
    "and",
    "or",
    "it",
    "this",
    "that",
}


def _now_utc() -> datetime:
    return datetime.now(UTC)


def extract_topic(prompt: str) -> str:
    words = re.findall(r"[A-Za-z0-9']+", prompt)
    filtered = [
        word
        for word in words
        if word.lower() not in STANCE_STOP_WORDS and len(word) > 1
    ]
    if not filtered:
        return "general topic"

    normalized: list[str] = []
    for word in filtered[:4]:
        lower = word.lower()
        if lower.endswith("ing") and len(lower) > 5:
            normalized.append(lower)
        elif word.isupper() or word[0].isupper():
            normalized.append(word)
        else:
            normalized.append(lower)

    topic = " ".join(normalized).strip()
    return topic[:50] if topic else "general topic"


def _normalize_topic(topic: str) -> str:
    normalized = re.sub(r"\s+", " ", topic.strip().lower())
    return normalized[:50]


def summarize_stance_text(text: str) -> str:
    cleaned = " ".join(text.strip().split())
    if len(cleaned) <= 200:
        return cleaned
    truncated = cleaned[:197].rsplit(" ", 1)[0].strip()
    return f"{truncated}..." if truncated else cleaned[:200]


async def save_agent_stance(
    user_id: int,
    persona_id: str,
    topic: str,
    stance: str,
    confidence: int,
    session_id: str,
    prompt_snippet: str,
    db: Session,
) -> None:
    normalized_topic = _normalize_topic(topic)
    existing = (
        db.query(AgentStance)
        .filter(
            AgentStance.user_id == user_id,
            AgentStance.persona_id == persona_id,
            AgentStance.topic_normalized == normalized_topic,
        )
        .first()
    )

    if existing:
        existing.topic = topic[:50]
        existing.stance = summarize_stance_text(stance)
        existing.confidence = max(0, min(100, int(confidence)))
        existing.session_id = session_id
        existing.prompt_snippet = prompt_snippet[:100]
        existing.updated_at = _now_utc().replace(tzinfo=None)
        db.add(existing)
    else:
        db.add(
            AgentStance(
                user_id=user_id,
                persona_id=persona_id,
                topic=topic[:50],
                topic_normalized=normalized_topic,
                stance=summarize_stance_text(stance),
                confidence=max(0, min(100, int(confidence))),
                session_id=session_id,
                prompt_snippet=prompt_snippet[:100],
            )
        )

    db.commit()


async def get_agent_stance(
    user_id: int,
    persona_id: str,
    topic: str,
    db: Session,
) -> dict | None:
    normalized_topic = _normalize_topic(topic)
    existing = (
        db.query(AgentStance)
        .filter(
            AgentStance.user_id == user_id,
            AgentStance.persona_id == persona_id,
            AgentStance.topic_normalized == normalized_topic,
        )
        .first()
    )
    if not existing:
        return None

    return {
        "persona_id": existing.persona_id,
        "topic": existing.topic,
        "stance": existing.stance,
        "confidence": existing.confidence,
        "session_id": existing.session_id,
        "prompt_snippet": existing.prompt_snippet,
        "created_at": existing.created_at,
        "updated_at": existing.updated_at,
    }


async def get_all_stances_for_user(
    user_id: int,
    db: Session,
    limit: int = 50,
) -> list[dict]:
    rows = (
        db.query(AgentStance)
        .filter(AgentStance.user_id == user_id)
        .order_by(AgentStance.updated_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "persona_id": row.persona_id,
            "topic": row.topic,
            "stance": row.stance,
            "confidence": row.confidence,
            "session_id": row.session_id,
            "prompt_snippet": row.prompt_snippet,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
        for row in rows
    ]
