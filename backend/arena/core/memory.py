"""Arena memory system."""

from __future__ import annotations

import ast
import json
import logging
import re
import uuid
from collections import Counter
from datetime import UTC, datetime
from typing import Any

import anthropic
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.core.model_router import get_route_for_prompt
from arena.db_models import SessionSummary
from arena.models.schemas import AgentResponse, MemoryContext, ScoredAgent, SessionData, SessionTurn

logger = logging.getLogger(__name__)

SHORT_TERM_EXCHANGE_LIMIT = 10
MEMORY_INJECTION_TOKEN_LIMIT = 400
MEMORY_STOP_WORDS = {
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "what",
    "how",
    "why",
    "when",
    "where",
    "tell",
    "me",
    "about",
    "think",
    "you",
    "your",
    "in",
    "of",
    "to",
    "and",
    "or",
    "it",
    "this",
    "that",
    "do",
    "does",
    "i",
    "my",
    "we",
    "our",
    "can",
    "will",
    "should",
    "would",
    "could",
    "for",
    "on",
    "with",
    "be",
    "if",
    "at",
    "by",
    "from",
}


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _normalize_text_tokens(text: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[A-Za-z0-9']+", text.lower())
        if token and token not in MEMORY_STOP_WORDS
    ]


def _infer_preferred_depth(exchanges: list[dict[str, Any]]) -> str:
    if not exchanges:
        return "moderate"
    avg_length = sum(len(exchange.get("prompt", "")) for exchange in exchanges) / len(exchanges)
    if avg_length < 60:
        return "brief"
    if avg_length < 180:
        return "moderate"
    return "deep"


def _extract_topics_from_exchanges(exchanges: list[dict[str, Any]], limit: int = 3) -> list[str]:
    counter: Counter[str] = Counter()
    for exchange in exchanges:
        words = _normalize_text_tokens(exchange.get("prompt", ""))
        for word in words:
            if len(word) >= 3:
                counter[word] += 1
    return [word.replace("_", " ") for word, _ in counter.most_common(limit)]


def _summarize_stance_text(text: str, limit: int = 20) -> str:
    words = text.strip().split()
    if len(words) <= limit:
        return " ".join(words)
    return " ".join(words[:limit]).strip()


def _parse_json_like(payload: str) -> dict[str, Any]:
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return ast.literal_eval(payload)


def _coerce_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        except ValueError:
            return _now_utc()
    return _now_utc()


class ShortTermMemory:
    """In-memory session memory for the active chat lifecycle."""

    def __init__(self) -> None:
        self._store: dict[str, dict[str, Any]] = {}

    def _get_or_create_state(self, session_id: str, user_id: str = "anonymous") -> dict[str, Any]:
        state = self._store.get(session_id)
        if state:
            return state

        session_data = SessionData(
            session_id=session_id,
            user_id=user_id,
            turns=[],
            topics=[],
            created_at=_now_utc(),
            last_active=_now_utc(),
        )
        state = {
            "session_id": session_id,
            "user_id": user_id,
            "exchanges": [],
            "active_debate_thread": None,
            "session_start": _now_utc(),
            "session_data": session_data,
        }
        self._store[session_id] = state
        return state

    def get_session_state(self, session_id: str) -> dict[str, Any] | None:
        state = self._store.get(session_id)
        if not state:
            return None

        # Expose only the requested short-term structure plus helper counts.
        return {
            "session_id": state["session_id"],
            "user_id": state["user_id"],
            "exchanges": list(state["exchanges"]),
            "active_debate_thread": state.get("active_debate_thread"),
            "session_start": state["session_start"],
        }

    def get_session(self, session_id: str) -> SessionData | None:
        state = self._store.get(session_id)
        if not state:
            return None
        session_data: SessionData = state["session_data"]
        session_data.last_active = _now_utc()
        return session_data

    def add_turn(
        self,
        *,
        session_id: str,
        prompt: str,
        prompt_category: str,
        scored_responses: list[ScoredAgent],
        winner_id: str,
        winner_persona_id: str | None,
        persona_ids: list[str] | None = None,
        user_id: str = "anonymous",
    ) -> SessionTurn:
        from arena.core.agents import get_persona_id_for_agent

        state = self._get_or_create_state(session_id, user_id=user_id)
        turn_number = len(state["exchanges"]) + 1
        timestamp = _now_utc()

        agent_responses = {
            scored.response.agent_id: scored.response
            for scored in scored_responses
        }

        turn = SessionTurn(
            turn_id=str(uuid.uuid4()),
            prompt=prompt,
            agent_responses=agent_responses,
            winner_id=winner_id,
            timestamp=timestamp,
        )

        winner_response = agent_responses[winner_id]
        exchange = {
            "turn": turn_number,
            "prompt": prompt,
            "prompt_category": prompt_category,
            "winner_agent_id": winner_id,
            "winner_persona_id": winner_persona_id,
            "winner_one_liner": winner_response.one_liner,
            "all_responses": [
                {
                    "agent_id": scored.response.agent_id,
                    "persona_id": get_persona_id_for_agent(scored.response.agent_id, persona_ids),
                    "one_liner": scored.response.one_liner,
                    "score": scored.score,
                    "confidence": scored.response.confidence,
                }
                for scored in scored_responses
            ],
            "timestamp": timestamp,
        }

        state["exchanges"].append(exchange)
        if len(state["exchanges"]) > SHORT_TERM_EXCHANGE_LIMIT:
            state["exchanges"] = state["exchanges"][-SHORT_TERM_EXCHANGE_LIMIT:]

        session_data: SessionData = state["session_data"]
        session_data.turns.append(turn)
        if len(session_data.turns) > SHORT_TERM_EXCHANGE_LIMIT:
            session_data.turns = session_data.turns[-SHORT_TERM_EXCHANGE_LIMIT:]
        session_data.last_active = timestamp

        current_topics = _extract_topics_from_exchanges(state["exchanges"], limit=4)
        session_data.topics = current_topics
        state["user_id"] = user_id
        session_data.user_id = user_id

        return turn

    def get_agent_memory(self, session_id: str, agent_id: str) -> list[str]:
        session = self.get_session(session_id)
        if not session:
            return []

        responses: list[str] = []
        for turn in session.turns:
            if agent_id in turn.agent_responses:
                responses.append(turn.agent_responses[agent_id].verdict)
        return responses

    def clear_session(self, session_id: str) -> None:
        self._store.pop(session_id, None)


class SessionCompressor:
    """Compresses raw session exchanges into compact DB-ready summaries."""

    def __init__(self) -> None:
        pass

    def _build_fallback(
        self,
        session_id: str,
        exchanges: list[dict[str, Any]],
        dominant_category: str,
        trusted_persona: str | None,
    ) -> dict[str, Any]:
        topics = _extract_topics_from_exchanges(exchanges, limit=3)
        main_topic = topics[0] if topics else "general topics"
        return {
            "session_id": session_id,
            "main_topics": topics,
            "dominant_category": dominant_category,
            "preferred_depth": _infer_preferred_depth(exchanges),
            "trusted_persona": trusted_persona,
            "key_positions_taken": [],
            "session_summary": f"Session with {len(exchanges)} exchanges. Most discussed: {main_topic}.",
            "exchange_count": len(exchanges),
            "timestamp": _now_utc().isoformat(),
        }

    async def compress_session(
        self,
        session_id: str,
        exchanges: list[dict[str, Any]],
        user_id: int,
    ) -> dict[str, Any]:
        category_counter = Counter(exchange.get("prompt_category", "question") for exchange in exchanges)
        dominant_category = category_counter.most_common(1)[0][0] if category_counter else "question"
        winner_counter = Counter(exchange.get("winner_persona_id") for exchange in exchanges if exchange.get("winner_persona_id"))
        trusted_persona = winner_counter.most_common(1)[0][0] if winner_counter else None

        if not exchanges:
            return self._build_fallback(session_id, exchanges, dominant_category, trusted_persona)

        exchanges_json = json.dumps(exchanges, default=lambda value: value.isoformat() if isinstance(value, datetime) else str(value))
        system_prompt = (
            "You are a memory compression system.\n"
            "Compress the following conversation session into a structured summary.\n"
            "Return only valid JSON."
        )
        user_prompt = (
            f"Session exchanges: {exchanges_json}\n\n"
            "Return this exact JSON structure:\n"
            "{\n"
            f"  \"session_id\": \"{session_id}\",\n"
            "  \"main_topics\": [\"topic1\", \"topic2\"],\n"
            "  \"dominant_category\": \"question|debate|task\",\n"
            "  \"preferred_depth\": \"brief|moderate|deep\",\n"
            "  \"trusted_persona\": \"persona_id or null\",\n"
            "  \"key_positions_taken\": [\n"
            "    {\n"
            "      \"topic\": \"string\",\n"
            "      \"persona_id\": \"string\",\n"
            "      \"stance\": \"max 20 words\",\n"
            "      \"confidence\": 0\n"
            "    }\n"
            "  ],\n"
            "  \"session_summary\": \"max 100 words\",\n"
            f"  \"exchange_count\": {len(exchanges)},\n"
            "  \"timestamp\": \"ISO datetime\"\n"
            "}"
        )

        try:
            route = get_route_for_prompt(prompt=exchanges_json, task="session_compression")
            result = await route["client"].messages.create(
                model=route["model_id"],
                max_tokens=600,
                temperature=0.0,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            payload = result.content[0].text.strip()
            if payload.startswith("```"):
                lines = payload.splitlines()
                payload = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:]).strip()

            compressed = _parse_json_like(payload)
            compressed["session_id"] = session_id
            compressed["exchange_count"] = int(compressed.get("exchange_count", len(exchanges)))
            compressed["main_topics"] = list(compressed.get("main_topics") or _extract_topics_from_exchanges(exchanges, limit=3))[:3]
            compressed["dominant_category"] = str(compressed.get("dominant_category") or dominant_category)
            depth = str(compressed.get("preferred_depth") or _infer_preferred_depth(exchanges))
            compressed["preferred_depth"] = depth if depth in {"brief", "moderate", "deep"} else "moderate"
            compressed["trusted_persona"] = compressed.get("trusted_persona") or trusted_persona
            compressed["key_positions_taken"] = list(compressed.get("key_positions_taken") or [])
            compressed["session_summary"] = str(compressed.get("session_summary") or self._build_fallback(session_id, exchanges, dominant_category, trusted_persona)["session_summary"])
            compressed["timestamp"] = str(compressed.get("timestamp") or _now_utc().isoformat())
            return compressed
        except Exception as exc:
            logger.warning("Session compression fell back to rule-based summary for %s: %s", session_id, exc)
            return self._build_fallback(session_id, exchanges, dominant_category, trusted_persona)


class MemoryRelevanceRanker:
    """Ranks stored session summaries against the current prompt."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def relevance_score(self, memory: dict[str, Any], prompt: str) -> float:
        prompt_words = set(_normalize_text_tokens(prompt))
        score = 0.0

        for topic in memory.get("main_topics", []):
            topic_words = set(_normalize_text_tokens(str(topic)))
            overlap = len(prompt_words & topic_words)
            score += overlap * 2.0

        summary_words = set(_normalize_text_tokens(memory.get("session_summary", "")))
        overlap = len(prompt_words & summary_words)
        score += overlap * 1.0

        timestamp = _coerce_datetime(memory.get("timestamp"))
        days_ago = (_now_utc() - timestamp).days
        recency_boost = max(0.0, 1.0 - (days_ago / 30))
        score += recency_boost * 1.5
        return score

    async def rank_memories(
        self,
        current_prompt: str,
        user_id: int,
        limit: int = 3,
    ) -> list[dict[str, Any]]:
        rows = (
            self.db.query(SessionSummary)
            .filter(SessionSummary.user_id == user_id)
            .order_by(SessionSummary.created_at.desc())
            .limit(20)
            .all()
        )
        if not rows:
            return []

        ranked: list[tuple[float, dict[str, Any]]] = []
        for row in rows:
            memory = {
                "session_id": row.session_id,
                "main_topics": list(row.main_topics or []),
                "dominant_category": row.dominant_category,
                "preferred_depth": row.preferred_depth,
                "trusted_persona": row.trusted_persona,
                "key_positions_taken": list(row.key_positions_taken or []),
                "session_summary": row.session_summary,
                "exchange_count": row.exchange_count,
                "timestamp": row.compressed_at or row.created_at,
            }
            ranked.append((self.relevance_score(memory, current_prompt), memory))

        ranked.sort(key=lambda item: item[0], reverse=True)
        return [memory for score, memory in ranked[:limit] if score > 0]


def format_memory_for_injection(memories: list[dict[str, Any]], current_persona_id: str) -> str:
    """Format ranked memories into a compact prompt prefix."""
    if not memories:
        return ""

    labels = ["Most relevant", "Also relevant", "Background"]
    summary_lines = [
        f"[{labels[index]}: {memory.get('session_summary', '').strip()}]"
        for index, memory in enumerate(memories[:3])
        if memory.get("session_summary")
    ]

    stance_lines: list[str] = []
    for memory in memories:
        for entry in memory.get("key_positions_taken", []):
            if entry.get("persona_id") == current_persona_id and entry.get("topic") and entry.get("stance"):
                stance_lines.append(
                    f"Your previous stance on {entry['topic']}: {entry['stance']} (confidence: {int(entry.get('confidence', 0))}%)"
                )

    def build(lines: list[str]) -> str:
        body = "\n".join(lines)
        if stance_lines:
            if body:
                body = f"{body}\n\n" + "\n".join(stance_lines)
            else:
                body = "\n".join(stance_lines)
        return f"---MEMORY CONTEXT (past sessions)---\n{body}".strip()

    memory_context = build(summary_lines)
    while summary_lines and len(memory_context.split()) > MEMORY_INJECTION_TOKEN_LIMIT:
        summary_lines.pop()
        memory_context = build(summary_lines)

    if not summary_lines and stance_lines:
        memory_context = build([])

    return memory_context


class LongTermMemory:
    """Compatibility wrapper for persisted memory access."""

    def get_session(self, session_id: str) -> SessionData | None:
        return None


class MemoryManager:
    """Unified memory interface for short-term and long-term helpers."""

    def __init__(self) -> None:
        self.short_term = ShortTermMemory()
        self.long_term = LongTermMemory()
        self.compressor = SessionCompressor()

    def add_turn(
        self,
        *,
        session_id: str,
        prompt: str,
        prompt_category: str,
        scored_responses: list[ScoredAgent],
        winner_id: str,
        winner_persona_id: str | None,
        persona_ids: list[str] | None = None,
        user_id: str = "anonymous",
    ) -> SessionTurn:
        return self.short_term.add_turn(
            session_id=session_id,
            prompt=prompt,
            prompt_category=prompt_category,
            scored_responses=scored_responses,
            winner_id=winner_id,
            winner_persona_id=winner_persona_id,
            persona_ids=persona_ids,
            user_id=user_id,
        )

    def get_session(self, session_id: str) -> SessionData | None:
        session = self.short_term.get_session(session_id)
        if session:
            return session
        return self.long_term.get_session(session_id)

    def get_session_state(self, session_id: str) -> dict[str, Any] | None:
        return self.short_term.get_session_state(session_id)

    def get_agent_context(self, session_id: str, agent_id: str) -> MemoryContext:
        previous_responses = self.short_term.get_agent_memory(session_id, agent_id)
        return MemoryContext(
            agent_id=agent_id,
            previous_responses=previous_responses,
            session_summary="",
        )

    def clear_session(self, session_id: str) -> None:
        self.short_term.clear_session(session_id)


_memory_manager: MemoryManager | None = None


def get_memory_manager() -> MemoryManager:
    global _memory_manager
    if _memory_manager is None:
        _memory_manager = MemoryManager()
    return _memory_manager
