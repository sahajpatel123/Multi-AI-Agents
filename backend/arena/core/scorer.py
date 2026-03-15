"""Scorer - 5th LLM call that evaluates and ranks all agent responses"""

import asyncio
import json
import time
from typing import Any

import anthropic
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.core.agents import get_persona_id_for_agent
from arena.core.observability import log_scoring_result
from arena.models.schemas import AgentResponse, ScoredAgent, IntegrityReport


SCORER_SYSTEM_PROMPT = """You are an impartial judge evaluating multiple AI responses to a user's prompt.

Your job is to score each response on a scale of 0-100 based on:
1. **Relevance** (25%): How directly does it address the user's actual question?
2. **Insight** (25%): Does it offer genuine value, novel perspective, or useful information?
3. **Clarity** (25%): Is it well-structured, clear, and easy to understand?
4. **Intellectual Honesty** (25%): Does it acknowledge limitations, avoid overconfidence, and reason soundly?

You must respond with valid JSON in this exact format:
{
  "scores": {
    "agent_1": <score 0-100>,
    "agent_2": <score 0-100>,
    "agent_3": <score 0-100>,
    "agent_4": <score 0-100>
  },
  "winner": "<agent_id of highest scorer>",
  "reasoning": "Brief explanation of why the winner was chosen"
}

Be fair and objective. Different perspectives have value — don't penalize unconventional views if they're well-reasoned."""


class Scorer:
    """Evaluates and scores agent responses"""
    
    def __init__(self):
        settings = get_settings()
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.model = settings.default_model
        self.max_tokens = 512
        self.timeout = settings.timeout_seconds
    
    def _format_responses_for_scoring(
        self,
        prompt: str,
        responses: list[AgentResponse],
        integrity: IntegrityReport | None = None,
    ) -> str:
        """Format all responses into a single prompt for the scorer"""
        formatted = f"USER'S ORIGINAL PROMPT:\n{prompt}\n\n"
        formatted += "AGENT RESPONSES TO EVALUATE:\n\n"
        
        for resp in responses:
            formatted += f"--- {resp.agent_id.upper()} ---\n"
            formatted += f"Response: {resp.verdict}\n"
            formatted += f"Confidence: {resp.confidence}%\n"
            formatted += f"Key Assumption: {resp.key_assumption}\n\n"
        
        # Include integrity flags so scorer can penalize
        if integrity and integrity.flags:
            formatted += "INTEGRITY WARNINGS (penalize these agents):\n"
            for flag in integrity.flags:
                formatted += f"- {flag}\n"
            formatted += "\n"
        
        return formatted
    
    async def score_responses(
        self,
        prompt: str,
        responses: list[AgentResponse],
        integrity: IntegrityReport | None = None,
        session_id: str | None = None,
        user_id: int | None = None,
        prompt_category: str | None = None,
        persona_ids: list[str] | None = None,
        db: Session | None = None,
        scoring_duration_ms: int | None = None,
    ) -> list[ScoredAgent]:
        """Score all responses and determine winner"""
        
        scoring_prompt = self._format_responses_for_scoring(prompt, responses, integrity)
        started = time.monotonic()
        fallback_used = False
        criteria_breakdown: dict[str, Any] | None = None
        
        try:
            result = await asyncio.wait_for(
                self.client.messages.create(
                    model=self.model,
                    max_tokens=self.max_tokens,
                    temperature=0.0,  # Deterministic scoring
                    system=SCORER_SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": scoring_prompt}],
                ),
                timeout=self.timeout,
            )
            
            content = result.content[0].text.strip()
            
            # Handle potential markdown code blocks
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1]) if lines[-1] == "```" else "\n".join(lines[1:])
                content = content.strip()
            
            data = json.loads(content)
            scores = data.get("scores", {})
            winner_id = data.get("winner", "agent_1")
            criteria_breakdown = data.get("criteria_breakdown")
            
            # Build scored responses
            scored: list[ScoredAgent] = []
            for resp in responses:
                score = scores.get(resp.agent_id, 50)
                scored.append(
                    ScoredAgent(
                        response=resp,
                        score=score,
                        is_winner=(resp.agent_id == winner_id),
                    )
                )
            
            result_scored = scored
            
        except Exception as e:
            # Fallback: return responses with default scores
            fallback_used = True
            result_scored = [
                ScoredAgent(response=resp, score=50, is_winner=(i == 0))
                for i, resp in enumerate(responses)
            ]

        duration = scoring_duration_ms
        if duration is None:
            duration = int((time.monotonic() - started) * 1000)

        if session_id and db is not None and result_scored:
            winner = self.get_winner(result_scored)
            if winner:
                try:
                    await log_scoring_result(
                        session_id=session_id,
                        user_id=user_id,
                        prompt_snippet=prompt[:200],
                        prompt_category=prompt_category,
                        winner_agent_id=winner.response.agent_id,
                        winner_persona_id=get_persona_id_for_agent(winner.response.agent_id, persona_ids),
                        winner_score=winner.score,
                        scores={item.response.agent_id: item.score for item in result_scored},
                        criteria_breakdown=criteria_breakdown,
                        confidence_values=[{"agent_id": item.response.agent_id, "confidence": item.response.confidence} for item in result_scored],
                        persona_ids_used=persona_ids,
                        scoring_duration_ms=duration,
                        fallback_used=fallback_used,
                        db=db,
                    )
                except Exception:
                    pass

        return result_scored
    
    def get_winner(self, scored_responses: list[ScoredAgent]) -> ScoredAgent | None:
        """Get the winning response from scored list"""
        for scored in scored_responses:
            if scored.is_winner:
                return scored
        # Fallback to highest score
        if scored_responses:
            return max(scored_responses, key=lambda x: x.score)
        return None
