"""Contradiction detector — identifies when agents contradict their previous statements"""

import asyncio
from difflib import SequenceMatcher
from typing import Optional

import anthropic

from arena.config import get_settings
from arena.models.schemas import AgentResponse
from arena.core.memory import get_memory_manager


class ContradictionReport:
    """Report of a detected contradiction"""
    
    def __init__(
        self,
        contradiction_detected: bool,
        contradicting_agent_id: str = "",
        previous_statement: str = "",
        current_statement: str = "",
        severity: str = "low",  # low, medium, high
    ):
        self.contradiction_detected = contradiction_detected
        self.contradicting_agent_id = contradicting_agent_id
        self.previous_statement = previous_statement
        self.current_statement = current_statement
        self.severity = severity


class ContradictionDetector:
    """
    Detects contradictions in agent responses.
    Uses lightweight similarity checks first, LLM fallback for borderline cases.
    """
    
    def __init__(self):
        settings = get_settings()
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.model = settings.default_model
    
    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate similarity between two texts using SequenceMatcher."""
        return SequenceMatcher(None, text1.lower(), text2.lower()).ratio()
    
    def _extract_core_claim(self, text: str) -> str:
        """Extract the core claim from a response (first 2 sentences)."""
        sentences = text.split(". ")
        return ". ".join(sentences[:2]) + "." if len(sentences) > 1 else text
    
    async def _llm_check_contradiction(
        self,
        previous: str,
        current: str,
        agent_name: str,
    ) -> tuple[bool, str]:
        """
        Use LLM to check if two statements contradict each other.
        Returns (is_contradiction, severity).
        """
        prompt = f"""Compare these two statements from {agent_name}:

PREVIOUS STATEMENT:
{previous}

CURRENT STATEMENT:
{current}

Do these statements contradict each other? Consider:
- Direct contradictions (saying opposite things)
- Implicit contradictions (different conclusions from same facts)
- NOT contradictions: adding nuance, clarifying, or addressing different aspects

Respond with ONLY valid JSON:
{{"contradicts": true/false, "severity": "low/medium/high", "reason": "brief explanation"}}"""

        try:
            result = await asyncio.wait_for(
                self.client.messages.create(
                    model=self.model,
                    max_tokens=200,
                    temperature=0.0,
                    system="You are a logical consistency checker. Be strict but fair.",
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=10.0,
            )
            
            import json
            text = result.content[0].text.strip()
            
            # Handle code blocks
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
                text = text.strip()
            
            data = json.loads(text)
            return data.get("contradicts", False), data.get("severity", "low")
            
        except Exception:
            # On error, assume no contradiction
            return False, "low"
    
    async def check_agent_consistency(
        self,
        agent_id: str,
        current_response: AgentResponse,
        session_id: str,
    ) -> Optional[ContradictionReport]:
        """
        Check if an agent's current response contradicts its previous responses
        in the same session.
        """
        memory = get_memory_manager()
        previous_responses = memory.short_term.get_agent_memory(session_id, agent_id)
        
        if not previous_responses:
            # No previous responses to compare against
            return None
        
        current_claim = self._extract_core_claim(current_response.verdict)
        
        # Check against each previous response
        for prev_response in previous_responses:
            prev_claim = self._extract_core_claim(prev_response)
            
            # Quick similarity check
            similarity = self._calculate_similarity(current_claim, prev_claim)
            
            # If very similar (>0.6), likely not a contradiction
            if similarity > 0.6:
                continue
            
            # If very different (<0.4), likely not related
            if similarity < 0.4:
                continue
            
            # Borderline case (0.4-0.6) — use LLM to check
            from arena.core.agents import AGENTS
            agent_name = AGENTS[agent_id].name
            
            is_contradiction, severity = await self._llm_check_contradiction(
                prev_claim,
                current_claim,
                agent_name,
            )
            
            if is_contradiction:
                return ContradictionReport(
                    contradiction_detected=True,
                    contradicting_agent_id=agent_id,
                    previous_statement=prev_claim,
                    current_statement=current_claim,
                    severity=severity,
                )
        
        return None
    
    async def check_winner_consistency(
        self,
        winner_id: str,
        winner_response: AgentResponse,
        session_id: str,
    ) -> Optional[ContradictionReport]:
        """
        Check if the current winner contradicts a previous winner on the same topic.
        This is a lighter check — only compares against previous winners.
        """
        memory = get_memory_manager()
        session = memory.short_term.get_session(session_id)
        
        if not session or len(session.turns) < 2:
            # Need at least 2 turns to compare
            return None
        
        current_claim = self._extract_core_claim(winner_response.verdict)
        
        # Check against previous winners
        for turn in session.turns[:-1]:  # Exclude current turn
            if turn.winner_id == winner_id:
                # Same agent won before — check consistency
                prev_winner_response = turn.agent_responses.get(winner_id)
                if prev_winner_response:
                    prev_claim = self._extract_core_claim(prev_winner_response.verdict)
                    similarity = self._calculate_similarity(current_claim, prev_claim)
                    
                    # Only check borderline cases
                    if 0.4 <= similarity <= 0.6:
                        from arena.core.agents import AGENTS
                        agent_name = AGENTS[winner_id].name
                        
                        is_contradiction, severity = await self._llm_check_contradiction(
                            prev_claim,
                            current_claim,
                            agent_name,
                        )
                        
                        if is_contradiction:
                            return ContradictionReport(
                                contradiction_detected=True,
                                contradicting_agent_id=winner_id,
                                previous_statement=prev_claim,
                                current_statement=current_claim,
                                severity=severity,
                            )
        
        return None
    
    async def check_all_agents(
        self,
        responses: list[AgentResponse],
        session_id: str,
    ) -> dict[str, Optional[ContradictionReport]]:
        """
        Check all agents for contradictions in parallel.
        Returns a dict mapping agent_id to ContradictionReport (or None).
        """
        tasks = [
            self.check_agent_consistency(resp.agent_id, resp, session_id)
            for resp in responses
        ]
        
        results = await asyncio.gather(*tasks)
        
        return {
            resp.agent_id: report
            for resp, report in zip(responses, results)
        }


# ──────────────────────────────────────────────────────────────
# Global singleton
# ──────────────────────────────────────────────────────────────

_detector: Optional[ContradictionDetector] = None

def get_contradiction_detector() -> ContradictionDetector:
    """Get the global contradiction detector instance."""
    global _detector
    if _detector is None:
        _detector = ContradictionDetector()
    return _detector
