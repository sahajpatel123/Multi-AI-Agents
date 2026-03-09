"""Scorer - 5th LLM call that evaluates and ranks all agent responses"""

import asyncio
import json
from typing import Any

import anthropic

from arena.config import get_settings
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
    ) -> list[ScoredAgent]:
        """Score all responses and determine winner"""
        
        scoring_prompt = self._format_responses_for_scoring(prompt, responses, integrity)
        
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
            
            return scored
            
        except Exception as e:
            # Fallback: return responses with default scores
            return [
                ScoredAgent(response=resp, score=50, is_winner=(i == 0))
                for i, resp in enumerate(responses)
            ]
    
    def get_winner(self, scored_responses: list[ScoredAgent]) -> ScoredAgent | None:
        """Get the winning response from scored list"""
        for scored in scored_responses:
            if scored.is_winner:
                return scored
        # Fallback to highest score
        if scored_responses:
            return max(scored_responses, key=lambda x: x.score)
        return None
