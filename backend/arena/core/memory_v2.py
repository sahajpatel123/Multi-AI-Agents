"""Memory system — Phase 1 upgrade with compression, ranking, and injection"""

import json
import re
from datetime import datetime, timezone
from typing import Optional

import anthropic

from arena.config import get_settings
from arena.core.model_router import get_route_for_prompt
from arena.models.schemas import AgentResponse


# ──────────────────────────────────────────────────────────────
# COMPONENT 1 — Short-term memory (upgraded to 10 exchanges)
# ──────────────────────────────────────────────────────────────

MAX_SHORT_TERM_EXCHANGES = 10  # Upgraded from 5 to 10


class ShortTermMemoryV2:
    """
    In-session memory store. Keeps last 10 exchanges per session.
    Structure per session:
    {
      session_id: str,
      exchanges: [list of exchange dicts],
      active_debate_thread: [] | null,
      session_start: datetime
    }
    """
    
    def __init__(self):
        self._store: dict[str, dict] = {}
    
    def add_exchange(
        self,
        session_id: str,
        prompt: str,
        prompt_category: str,
        winner_agent_id: str,
        winner_persona_id: str,
        winner_one_liner: str,
        all_responses: list[dict],
        user_id: Optional[int] = None,
    ) -> None:
        """Add a new exchange to short-term memory, keeping last 10."""
        if session_id not in self._store:
            self._store[session_id] = {
                "session_id": session_id,
                "user_id": user_id,
                "exchanges": [],
                "active_debate_thread": None,
                "session_start": datetime.now(timezone.utc),
            }
        
        session = self._store[session_id]
        
        exchange = {
            "turn": len(session["exchanges"]) + 1,
            "prompt": prompt,
            "prompt_category": prompt_category,
            "winner_agent_id": winner_agent_id,
            "winner_persona_id": winner_persona_id,
            "winner_one_liner": winner_one_liner,
            "all_responses": all_responses,
            "timestamp": datetime.now(timezone.utc),
        }
        
        session["exchanges"].append(exchange)
        
        # Keep only last 10 exchanges
        if len(session["exchanges"]) > MAX_SHORT_TERM_EXCHANGES:
            session["exchanges"] = session["exchanges"][-MAX_SHORT_TERM_EXCHANGES:]
    
    def get_session(self, session_id: str) -> Optional[dict]:
        """Get full session data."""
        return self._store.get(session_id)
    
    def get_exchanges(self, session_id: str) -> list[dict]:
        """Get all exchanges for a session."""
        session = self._store.get(session_id)
        return session["exchanges"] if session else []
    
    def clear_session(self, session_id: str) -> None:
        """Remove a session from short-term memory."""
        self._store.pop(session_id, None)
    
    def get_agent_memory(self, session_id: str, agent_id: str) -> list[str]:
        """Get previous responses from a specific agent (for contradiction detection)."""
        session = self._store.get(session_id)
        if not session:
            return []
        
        responses = []
        for exchange in session["exchanges"]:
            for resp in exchange["all_responses"]:
                if resp.get("agent_id") == agent_id:
                    responses.append(resp.get("one_liner", ""))
        
        return responses


# ──────────────────────────────────────────────────────────────
# COMPONENT 2 — Session Compression Engine
# ──────────────────────────────────────────────────────────────

class SessionCompressor:
    """
    Compresses raw session exchanges into compact summaries
    before storing in long-term DB.
    """
    
    def __init__(self):
        settings = get_settings()
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    
    async def compress_session(
        self,
        session_id: str,
        exchanges: list[dict],
        user_id: Optional[int] = None,
    ) -> dict:
        """
        Compress a session into a structured summary.
        Returns compressed dict ready for DB storage.
        """
        if not exchanges:
            return self._empty_compression(session_id, user_id)
        
        # Step 1: Extract key signals
        main_topics = self._extract_topics_simple(exchanges)
        dominant_category = self._get_dominant_category(exchanges)
        preferred_depth = self._infer_depth_preference(exchanges)
        trusted_persona = self._get_most_winning_persona(exchanges)
        
        # Step 2: LLM compression call
        try:
            exchanges_json = json.dumps(exchanges, default=str, indent=2)
            
            system_prompt = "You are a memory compression system. Compress the following conversation session into a structured summary. Return only valid JSON."
            
            user_prompt = f"""Session exchanges: {exchanges_json}

Return this exact JSON structure:
{{
  "session_id": "{session_id}",
  "main_topics": ["topic1", "topic2"],
  "dominant_category": "question|debate|task",
  "preferred_depth": "brief|moderate|deep",
  "trusted_persona": "persona_id or null",
  "key_positions_taken": [
    {{
      "topic": "str",
      "persona_id": "str",
      "stance": "str (max 20 words)",
      "confidence": 85
    }}
  ],
  "session_summary": "str (max 100 words)",
  "exchange_count": {len(exchanges)},
  "timestamp": "{datetime.now(timezone.utc).isoformat()}"
}}"""
            
            route = get_route_for_prompt(prompt=exchanges_json, task="session_compression")
            response = route["client"].messages.create(
                model=route["model_id"],
                max_tokens=800,
                temperature=0.0,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            
            content = response.content[0].text.strip()
            
            # Step 3: Parse and validate
            if content.startswith("{"):
                compressed = json.loads(content)
                compressed["user_id"] = user_id
                return compressed
            
            # Fallback if not valid JSON
            return self._rule_based_compression(
                session_id, exchanges, user_id, main_topics,
                dominant_category, preferred_depth, trusted_persona
            )
        
        except Exception as e:
            print(f"[SessionCompressor] LLM compression failed: {e}, using rule-based fallback")
            return self._rule_based_compression(
                session_id, exchanges, user_id, main_topics,
                dominant_category, preferred_depth, trusted_persona
            )
    
    def _empty_compression(self, session_id: str, user_id: Optional[int]) -> dict:
        """Return empty compression for sessions with no exchanges."""
        return {
            "session_id": session_id,
            "user_id": user_id,
            "main_topics": [],
            "dominant_category": "question",
            "preferred_depth": "moderate",
            "trusted_persona": None,
            "key_positions_taken": [],
            "session_summary": "Empty session with no exchanges.",
            "exchange_count": 0,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    
    def _rule_based_compression(
        self,
        session_id: str,
        exchanges: list[dict],
        user_id: Optional[int],
        main_topics: list[str],
        dominant_category: str,
        preferred_depth: str,
        trusted_persona: Optional[str],
    ) -> dict:
        """Fallback rule-based compression when LLM fails."""
        main_topic = main_topics[0] if main_topics else "general discussion"
        
        return {
            "session_id": session_id,
            "user_id": user_id,
            "main_topics": main_topics[:3],
            "dominant_category": dominant_category,
            "preferred_depth": preferred_depth,
            "trusted_persona": trusted_persona,
            "key_positions_taken": [],
            "session_summary": f"Session with {len(exchanges)} exchanges. Most discussed: {main_topic}.",
            "exchange_count": len(exchanges),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    
    def _extract_topics_simple(self, exchanges: list[dict]) -> list[str]:
        """Extract topics using simple noun extraction."""
        all_words = []
        for exchange in exchanges[:5]:  # First 5 exchanges
            prompt = exchange.get("prompt", "")
            words = re.findall(r'\b[A-Z][a-z]+\b|\b[a-z]{4,}\b', prompt)
            all_words.extend(words)
        
        # Count frequency
        word_counts = {}
        for word in all_words:
            word_lower = word.lower()
            if word_lower not in {'what', 'when', 'where', 'which', 'should', 'would', 'could', 'think', 'about'}:
                word_counts[word_lower] = word_counts.get(word_lower, 0) + 1
        
        # Return top 3 most common
        sorted_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)
        return [word for word, _ in sorted_words[:3]]
    
    def _get_dominant_category(self, exchanges: list[dict]) -> str:
        """Get most common prompt category."""
        categories = [ex.get("prompt_category", "question") for ex in exchanges]
        if not categories:
            return "question"
        return max(set(categories), key=categories.count)
    
    def _infer_depth_preference(self, exchanges: list[dict]) -> str:
        """Infer user's depth preference from prompt lengths."""
        avg_length = sum(len(ex.get("prompt", "")) for ex in exchanges) / len(exchanges)
        
        if avg_length < 50:
            return "brief"
        elif avg_length < 150:
            return "moderate"
        else:
            return "deep"
    
    def _get_most_winning_persona(self, exchanges: list[dict]) -> Optional[str]:
        """Get persona that won most often."""
        persona_wins = {}
        for exchange in exchanges:
            persona_id = exchange.get("winner_persona_id")
            if persona_id:
                persona_wins[persona_id] = persona_wins.get(persona_id, 0) + 1
        
        if not persona_wins:
            return None
        
        return max(persona_wins.items(), key=lambda x: x[1])[0]


# ──────────────────────────────────────────────────────────────
# COMPONENT 3 — Memory Relevance Ranker
# ──────────────────────────────────────────────────────────────

STOP_WORDS = {
    'the', 'a', 'an', 'is', 'are', 'was', 'what', 'how', 'why', 'when', 'where',
    'tell', 'me', 'about', 'think', 'you', 'your', 'in', 'of', 'to', 'and', 'or',
    'it', 'this', 'that', 'do', 'does', 'i', 'my', 'we', 'our', 'can', 'will'
}


class MemoryRelevanceRanker:
    """
    Ranks long-term memories by relevance to current prompt.
    Returns top 3 most relevant memories for injection.
    """
    
    def __init__(self, db):
        self.db = db
    
    async def rank_memories(
        self,
        current_prompt: str,
        user_id: int,
        limit: int = 3,
    ) -> list[dict]:
        """
        Rank and return top N most relevant memories for this prompt.
        """
        from arena.db_models import SessionSummary
        from sqlalchemy import desc
        
        # Step 1: Fetch recent compressed sessions (last 20 max)
        summaries = self.db.query(SessionSummary)\
            .filter(SessionSummary.user_id == user_id)\
            .order_by(desc(SessionSummary.created_at))\
            .limit(20)\
            .all()
        
        if not summaries:
            return []
        
        # Step 2: Score each memory
        scored_memories = []
        for summary in summaries:
            memory_dict = {
                "session_id": summary.session_id,
                "main_topics": json.loads(summary.main_topics) if summary.main_topics else [],
                "session_summary": summary.session_summary or "",
                "key_positions_taken": json.loads(summary.key_positions_taken) if summary.key_positions_taken else [],
                "timestamp": summary.created_at,
                "dominant_category": summary.dominant_category,
                "trusted_persona": summary.trusted_persona,
            }
            
            score = self._relevance_score(memory_dict, current_prompt)
            scored_memories.append((score, memory_dict))
        
        # Step 3: Sort by score DESC and return top N
        scored_memories.sort(key=lambda x: x[0], reverse=True)
        return [memory for score, memory in scored_memories[:limit] if score > 0]
    
    def _relevance_score(self, memory: dict, prompt: str) -> float:
        """Calculate relevance score for a memory against current prompt."""
        prompt_words = set(prompt.lower().split()) - STOP_WORDS
        
        if not prompt_words:
            return 0.0
        
        score = 0.0
        
        # Check topic overlap (weight: 2.0)
        for topic in memory.get("main_topics", []):
            topic_words = set(topic.lower().split()) - STOP_WORDS
            overlap = len(prompt_words & topic_words)
            score += overlap * 2.0
        
        # Check summary overlap (weight: 1.0)
        summary_words = set(memory.get("session_summary", "").lower().split()) - STOP_WORDS
        overlap = len(prompt_words & summary_words)
        score += overlap * 1.0
        
        # Recency boost (weight: 1.5)
        timestamp = memory.get("timestamp")
        if timestamp:
            if isinstance(timestamp, str):
                timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            
            days_ago = (datetime.now(timezone.utc) - timestamp.replace(tzinfo=timezone.utc)).days
            recency_boost = max(0, 1.0 - (days_ago / 30))
            score += recency_boost * 1.5
        
        return score


# ──────────────────────────────────────────────────────────────
# COMPONENT 4 — Memory Injection Formatter
# ──────────────────────────────────────────────────────────────

MAX_MEMORY_TOKENS = 400  # Max tokens for memory context


def format_memory_for_injection(
    memories: list[dict],
    current_persona_id: str,
) -> str:
    """
    Format top ranked memories into injection string for agent system prompt.
    Returns empty string if no memories.
    """
    if not memories:
        return ""
    
    lines = ["---MEMORY CONTEXT (past sessions)---"]
    
    # Add summaries
    if len(memories) >= 1:
        lines.append(f"[Most relevant: {memories[0].get('session_summary', '')}]")
    if len(memories) >= 2:
        lines.append(f"[Also relevant: {memories[1].get('session_summary', '')}]")
    if len(memories) >= 3:
        lines.append(f"[Background: {memories[2].get('session_summary', '')}]")
    
    lines.append("")
    
    # Add persona-specific stances
    persona_stances = []
    for memory in memories:
        for position in memory.get("key_positions_taken", []):
            if position.get("persona_id") == current_persona_id:
                topic = position.get("topic", "this topic")
                stance = position.get("stance", "")
                confidence = position.get("confidence", 0)
                persona_stances.append(
                    f"Your previous stance on {topic}: {stance} (confidence: {confidence}%)"
                )
    
    if persona_stances:
        lines.extend(persona_stances)
    
    formatted = "\n".join(lines)
    
    # Truncate if over token limit (rough estimate: 4 chars = 1 token)
    max_chars = MAX_MEMORY_TOKENS * 4
    if len(formatted) > max_chars:
        # Truncate but keep persona stances
        if persona_stances:
            stance_text = "\n".join(persona_stances)
            summary_budget = max_chars - len(stance_text) - 100
            truncated_summary = formatted[:summary_budget]
            formatted = truncated_summary + "\n\n" + stance_text
        else:
            formatted = formatted[:max_chars]
    
    return formatted


# ──────────────────────────────────────────────────────────────
# Helper: Topic extraction for stance archive
# ──────────────────────────────────────────────────────────────

def extract_topic(prompt: str) -> str:
    """
    Extract core topic from prompt using simple rule-based extraction.
    Returns normalized topic string (max 50 chars).
    """
    # Remove question words and punctuation
    cleaned = re.sub(r'[?!.,;:]', '', prompt)
    cleaned = re.sub(r'\b(what|when|where|why|how|is|are|should|would|could|do|does|can|will|the|a|an)\b', '', cleaned, flags=re.IGNORECASE)
    
    # Extract meaningful words (4+ chars)
    words = [w for w in cleaned.split() if len(w) >= 4]
    
    # Take first 3-4 words as topic
    topic = ' '.join(words[:4])
    
    # Normalize and truncate
    topic = topic.lower().strip()[:50]
    
    return topic if topic else "general"
