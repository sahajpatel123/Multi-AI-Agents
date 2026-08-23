"""Scorer - 5th LLM call that evaluates and ranks all agent responses"""

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any


from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.core.agents import get_all_agents, get_persona_id_for_agent
from arena.core.model_router import get_route_for_prompt
from arena.core.observability import log_scoring_result
from arena.models.schemas import AgentResponse, ScoredAgent, IntegrityReport

logger = logging.getLogger(__name__)


# The judge is asked for a "brief explanation" of the winner, so this bound is
# generous without letting a misbehaving scorer bloat every round payload.
MAX_REASONING_LENGTH = 600

# Slot tokens the scorer sees (``agent_1``..``agent_4`` and small variants).
# Rewritten to persona display names before the rationale reaches users so the
# surfaced explanation matches the names shown on the cards.
_SLOT_TOKEN_RE = re.compile(r"\bagent[\s_-]*([1-4])\b", re.IGNORECASE)


@dataclass
class ScoringResult:
    """Outcome of a scoring run: ranked takes plus the judge's rationale.

    ``reasoning`` is the scorer's own plain-text explanation of why the winner
    was chosen and is safe to surface to users. It is ``None`` when the scorer
    produced no rationale or fell back to default scores.
    """

    scored_responses: list[ScoredAgent]
    reasoning: str | None = None
    fallback_used: bool = False


def _normalize_scorer_reasoning(
    raw: Any,
    agent_names: dict[str, str] | None = None,
) -> str | None:
    """Trim the judge's rationale to a compact, single-paragraph string.

    Collapses stray whitespace, drops empty/non-string values, rewrites
    ``agent_1``-style slot tokens into persona display names when a mapping is
    supplied, and caps the result at a word boundary so a verbose scorer
    cannot inflate the payload.
    """
    if not isinstance(raw, str):
        return None
    text = " ".join(raw.split())
    if not text:
        return None
    if agent_names:

        def _replace_slot(match: re.Match[str]) -> str:
            return agent_names.get(
                f"agent_{match.group(1)}",
                match.group(0),
            )

        text = _SLOT_TOKEN_RE.sub(_replace_slot, text)
    if len(text) > MAX_REASONING_LENGTH:
        cut = text[:MAX_REASONING_LENGTH].rsplit(" ", 1)[0]
        if not cut:
            cut = text[:MAX_REASONING_LENGTH]
        text = f"{cut}…"
    return text


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
    ) -> ScoringResult:
        """Score all responses and determine winner.

        Returns the ranked takes together with the judge's winner rationale
        so callers can surface it without a second scoring pass.
        """

        scoring_prompt = self._format_responses_for_scoring(prompt, responses, integrity)
        started = time.monotonic()
        fallback_used = False
        reasoning: str | None = None
        criteria_breakdown: dict[str, Any] | None = None
        route = get_route_for_prompt(prompt=prompt, task="scoring", category=prompt_category)

        try:
            result = await asyncio.wait_for(
                route["client"].messages.create(
                    model=route["model_id"],
                    max_tokens=self.max_tokens,
                    system=SCORER_SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": scoring_prompt}],
                    # extra_body for temperature — SDK v1 dropped the kwarg
                    # from message methods (see llm_caller.call_llm).
                    # 0.0 = deterministic scoring.
                    extra_body={"temperature": 0.0},
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
            try:
                agent_names = {
                    agent.agent_id: str(agent.name)
                    for agent in get_all_agents(persona_ids)
                }
            except ValueError:
                # Invalid persona selections are rejected upstream; never let a
                # cosmetic rewrite fail the whole scoring pass.
                agent_names = None
            reasoning = _normalize_scorer_reasoning(
                data.get("reasoning"),
                agent_names,
            )
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
            logger.warning("Scorer LLM call failed, using fallback scores: %s", e, exc_info=True)
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
                    logger.warning("Failed to log scoring audit", exc_info=True)

        return ScoringResult(
            scored_responses=result_scored,
            reasoning=reasoning,
            fallback_used=fallback_used,
        )

    def get_winner(self, scored_responses: list[ScoredAgent]) -> ScoredAgent | None:
        """Get the winning response from scored list"""
        for scored in scored_responses:
            if scored.is_winner:
                return scored
        # Fallback to highest score
        if scored_responses:
            return max(scored_responses, key=lambda x: x.score)
        return None
