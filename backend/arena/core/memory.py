"""Memory system — short-term (in-session) and long-term (cross-session) storage"""

import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import anthropic

from arena.config import get_settings
from arena.models.schemas import (
    AgentResponse,
    SessionTurn,
    SessionData,
    MemoryContext,
)


# ──────────────────────────────────────────────────────────────
# Short-term memory (in-session)
# ──────────────────────────────────────────────────────────────

class ShortTermMemory:
    """
    In-session memory store. Uses in-memory dict as fallback for Redis.
    Each session stores all turns with full agent responses.
    """
    
    def __init__(self):
        # In-memory fallback (will be Redis in Week 5)
        self._store: dict[str, SessionData] = {}
    
    def get_session(self, session_id: str) -> Optional[SessionData]:
        """Retrieve a session from memory."""
        return self._store.get(session_id)
    
    def save_session(self, session_data: SessionData) -> None:
        """Save or update a session in memory."""
        session_data.last_active = datetime.utcnow()
        self._store[session_id] = session_data
    
    def add_turn(
        self,
        session_id: str,
        prompt: str,
        agent_responses: dict[str, AgentResponse],
        winner_id: str,
    ) -> SessionTurn:
        """Add a new turn to a session."""
        session = self._store.get(session_id)
        if not session:
            session = SessionData(
                session_id=session_id,
                user_id="anonymous",
                turns=[],
                topics=[],
            )
        
        turn = SessionTurn(
            turn_id=str(uuid.uuid4()),
            prompt=prompt,
            agent_responses=agent_responses,
            winner_id=winner_id,
            timestamp=datetime.utcnow(),
        )
        
        session.turns.append(turn)
        session.last_active = datetime.utcnow()
        self._store[session_id] = session
        
        return turn
    
    def get_agent_memory(self, session_id: str, agent_id: str) -> list[str]:
        """
        Get all previous responses from a specific agent in this session.
        Used to prevent contradictions in 1-on-1 mode.
        """
        session = self._store.get(session_id)
        if not session:
            return []
        
        responses = []
        for turn in session.turns:
            if agent_id in turn.agent_responses:
                responses.append(turn.agent_responses[agent_id].verdict)
        
        return responses
    
    def clear_session(self, session_id: str) -> None:
        """Remove a session from memory."""
        self._store.pop(session_id, None)


# ──────────────────────────────────────────────────────────────
# Long-term memory (cross-session)
# ──────────────────────────────────────────────────────────────

class LongTermMemory:
    """
    Cross-session memory store using SQLite (PostgreSQL in Week 5).
    Persists session data and provides context from previous sessions.
    """
    
    def __init__(self, db_path: str = "data/arena_memory.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
    
    def _init_db(self) -> None:
        """Initialize SQLite database schema."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                topics TEXT,
                created_at TEXT NOT NULL,
                last_active TEXT NOT NULL
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS turns (
                turn_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                prompt TEXT NOT NULL,
                agent_responses TEXT NOT NULL,
                winner_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id)
            )
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sessions_user_id 
            ON sessions(user_id, last_active DESC)
        """)
        
        conn.commit()
        conn.close()
    
    def persist_session(self, session_data: SessionData) -> None:
        """Save a session to long-term storage."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Upsert session
        cursor.execute("""
            INSERT OR REPLACE INTO sessions (session_id, user_id, topics, created_at, last_active)
            VALUES (?, ?, ?, ?, ?)
        """, (
            session_data.session_id,
            session_data.user_id,
            json.dumps(session_data.topics),
            session_data.created_at.isoformat(),
            session_data.last_active.isoformat(),
        ))
        
        # Insert turns
        for turn in session_data.turns:
            # Serialize agent_responses dict
            responses_json = json.dumps({
                agent_id: resp.model_dump(mode="json")
                for agent_id, resp in turn.agent_responses.items()
            })
            
            cursor.execute("""
                INSERT OR REPLACE INTO turns (turn_id, session_id, prompt, agent_responses, winner_id, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                turn.turn_id,
                session_data.session_id,
                turn.prompt,
                responses_json,
                turn.winner_id,
                turn.timestamp.isoformat(),
            ))
        
        conn.commit()
        conn.close()
    
    def get_session(self, session_id: str) -> Optional[SessionData]:
        """Retrieve a session from long-term storage."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT session_id, user_id, topics, created_at, last_active
            FROM sessions WHERE session_id = ?
        """, (session_id,))
        
        row = cursor.fetchone()
        if not row:
            conn.close()
            return None
        
        session_id, user_id, topics_json, created_at, last_active = row
        
        # Fetch turns
        cursor.execute("""
            SELECT turn_id, prompt, agent_responses, winner_id, timestamp
            FROM turns WHERE session_id = ?
            ORDER BY timestamp ASC
        """, (session_id,))
        
        turns = []
        for turn_row in cursor.fetchall():
            turn_id, prompt, responses_json, winner_id, timestamp = turn_row
            
            # Deserialize agent_responses
            responses_dict = json.loads(responses_json)
            agent_responses = {
                agent_id: AgentResponse(**resp_data)
                for agent_id, resp_data in responses_dict.items()
            }
            
            turns.append(SessionTurn(
                turn_id=turn_id,
                prompt=prompt,
                agent_responses=agent_responses,
                winner_id=winner_id,
                timestamp=datetime.fromisoformat(timestamp),
            ))
        
        conn.close()
        
        return SessionData(
            session_id=session_id,
            user_id=user_id,
            topics=json.loads(topics_json) if topics_json else [],
            turns=turns,
            created_at=datetime.fromisoformat(created_at),
            last_active=datetime.fromisoformat(last_active),
        )
    
    def get_recent_sessions(self, user_id: str, limit: int = 3) -> list[SessionData]:
        """Get the most recent sessions for a user."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT session_id FROM sessions
            WHERE user_id = ?
            ORDER BY last_active DESC
            LIMIT ?
        """, (user_id, limit))
        
        session_ids = [row[0] for row in cursor.fetchall()]
        conn.close()
        
        sessions = []
        for sid in session_ids:
            session = self.get_session(sid)
            if session:
                sessions.append(session)
        
        return sessions


# ──────────────────────────────────────────────────────────────
# Memory Manager — orchestrates short-term and long-term
# ──────────────────────────────────────────────────────────────

class MemoryManager:
    """
    Unified memory interface combining short-term and long-term storage.
    Handles context injection for agents.
    """
    
    def __init__(self):
        self.short_term = ShortTermMemory()
        self.long_term = LongTermMemory()
        settings = get_settings()
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.model = settings.default_model
    
    def add_turn(
        self,
        session_id: str,
        prompt: str,
        agent_responses: dict[str, AgentResponse],
        winner_id: str,
    ) -> SessionTurn:
        """Add a turn to short-term memory."""
        return self.short_term.add_turn(session_id, prompt, agent_responses, winner_id)
    
    def get_session(self, session_id: str) -> Optional[SessionData]:
        """Get session from short-term, fallback to long-term."""
        session = self.short_term.get_session(session_id)
        if session:
            return session
        return self.long_term.get_session(session_id)
    
    def get_agent_context(self, session_id: str, agent_id: str) -> MemoryContext:
        """
        Build memory context for an agent.
        Includes:
        - Agent's own previous responses in this session
        - Summary of recent sessions (if any)
        """
        previous_responses = self.short_term.get_agent_memory(session_id, agent_id)
        
        # For now, session_summary is empty (will add LLM summarization later)
        session_summary = ""
        
        return MemoryContext(
            agent_id=agent_id,
            previous_responses=previous_responses,
            session_summary=session_summary,
        )
    
    def persist_session(self, session_id: str) -> None:
        """Move a session from short-term to long-term storage."""
        session = self.short_term.get_session(session_id)
        if session:
            # Extract topics via LLM before persisting
            if session.turns and not session.topics:
                session.topics = self._extract_topics_sync(session)
            
            self.long_term.persist_session(session)
    
    def _extract_topics_sync(self, session: SessionData) -> list[str]:
        """
        Extract topics from session prompts using LLM.
        Synchronous version for now (will be async in production).
        """
        if not session.turns:
            return []
        
        prompts = [turn.prompt for turn in session.turns[:5]]  # Max 5 prompts
        prompt_text = "\n- ".join(prompts)
        
        try:
            # Use synchronous client for simplicity
            import anthropic as sync_anthropic
            sync_client = sync_anthropic.Anthropic(api_key=get_settings().anthropic_api_key)
            
            result = sync_client.messages.create(
                model=self.model,
                max_tokens=100,
                temperature=0.0,
                system="Extract 2-4 key topics from these prompts. Return only a JSON array of topic strings.",
                messages=[{
                    "role": "user",
                    "content": f"Prompts:\n- {prompt_text}\n\nTopics (JSON array):",
                }],
            )
            
            text = result.content[0].text.strip()
            # Try to parse JSON
            if text.startswith("["):
                topics = json.loads(text)
                return topics[:4]  # Max 4 topics
            
            return []
        except Exception:
            return []


# ──────────────────────────────────────────────────────────────
# Global singleton
# ──────────────────────────────────────────────────────────────

_memory_manager: Optional[MemoryManager] = None

def get_memory_manager() -> MemoryManager:
    """Get the global memory manager instance."""
    global _memory_manager
    if _memory_manager is None:
        _memory_manager = MemoryManager()
    return _memory_manager
