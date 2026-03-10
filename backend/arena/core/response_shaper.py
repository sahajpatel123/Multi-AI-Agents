"""Response Shaper — winner formatter, one-liner generator, payload assembler"""

import uuid
import json
from datetime import datetime

import anthropic

from arena.config import get_settings
from arena.models.schemas import (
    AgentResponse,
    ScoredAgent,
    PromptResponse,
    IntegrityReport,
)


# ──────────────────────────────────────────────────────────────
# One-liner Generator
# ──────────────────────────────────────────────────────────────
# If an agent didn't produce a clean one_liner, generate one
# from the full verdict.

ONE_LINER_SYSTEM_PROMPT = """Summarize the following text in exactly one sentence.
The sentence should capture the core position or argument.
Keep it under 20 words. Be direct and clear.
Respond with ONLY the sentence, no quotes, no preamble."""

# Heuristics for detecting a bad one-liner
MIN_ONE_LINER_LENGTH = 5
MAX_ONE_LINER_LENGTH = 200


def _needs_one_liner(one_liner: str) -> bool:
    """Check if the one_liner field needs regeneration."""
    if not one_liner or not one_liner.strip():
        return True
    stripped = one_liner.strip()
    if len(stripped) < MIN_ONE_LINER_LENGTH:
        return True
    if len(stripped) > MAX_ONE_LINER_LENGTH:
        return True
    # Reject if it looks like the full verdict was copied
    if stripped.count(".") > 3:
        return True
    return False


async def generate_one_liner(
    client: anthropic.AsyncAnthropic, model: str, verdict: str
) -> str:
    """Generate a clean one-liner from a full verdict using LLM."""
    try:
        result = await client.messages.create(
            model=model,
            max_tokens=64,
            temperature=0.0,
            system=ONE_LINER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": verdict}],
        )
        return result.content[0].text.strip().rstrip(".")  + "."
    except Exception:
        # Fallback: take the first sentence
        return _extract_first_sentence(verdict)


def _extract_first_sentence(text: str) -> str:
    """Extract the first sentence as a fallback one-liner."""
    text = text.strip()
    for end in [".", "!", "?"]:
        idx = text.find(end)
        if idx != -1 and idx < 200:
            return text[: idx + 1]
    # No sentence-ending found, truncate
    if len(text) > 100:
        return text[:97] + "..."
    return text


# ──────────────────────────────────────────────────────────────
# Winner Formatter
# ──────────────────────────────────────────────────────────────
# Takes the winning agent response and formats it cleanly
# for display.

def format_winner(response: AgentResponse) -> AgentResponse:
    """
    Format the winning response for clean display.
    Strips any residual formatting artifacts, ensures consistent structure.
    """
    verdict = response.verdict.strip()

    # Remove any leading/trailing quotes the LLM might have added
    if verdict.startswith('"') and verdict.endswith('"'):
        verdict = verdict[1:-1]

    # Remove markdown artifacts that shouldn't be in final display
    verdict = verdict.replace("**", "").replace("__", "")

    # Ensure key_assumption is clean
    key_assumption = response.key_assumption.strip()
    if not key_assumption or key_assumption.lower() in ("n/a", "none", ""):
        key_assumption = "No explicit assumption stated"

    return AgentResponse(
        agent_id=response.agent_id,
        agent_number=response.agent_number,
        verdict=verdict,
        one_liner=response.one_liner,
        confidence=response.confidence,
        key_assumption=key_assumption,
        timestamp=response.timestamp,
    )


# ──────────────────────────────────────────────────────────────
# Payload Assembler
# ──────────────────────────────────────────────────────────────
# Assembles the final JSON payload, ensuring every field in the
# data contract is always present. This is the last step before
# the response hits the wire.

async def assemble_payload(
    prompt: str,
    session_id: str | None,
    prompt_category: str,
    scored_responses: list[ScoredAgent],
    winner: ScoredAgent,
    integrity: IntegrityReport | None,
    tools_used: list[str] | None = None,
) -> PromptResponse:
    """
    Assemble the final response payload.
    
    - Ensures session_id exists
    - Formats the winner
    - Regenerates bad one-liners
    - Guarantees every field in the data contract is present
    """
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    model = settings.default_model

    final_session_id = session_id or str(uuid.uuid4())

    # Format the winner
    formatted_winner = format_winner(winner.response)

    # Fix one-liners across all responses
    final_scored: list[ScoredAgent] = []
    for scored in scored_responses:
        resp = scored.response
        one_liner = resp.one_liner

        if _needs_one_liner(one_liner):
            one_liner = await generate_one_liner(client, model, resp.verdict)

        # Ensure all fields are present and clean
        clean_resp = AgentResponse(
            agent_id=resp.agent_id,
            agent_number=resp.agent_number,
            verdict=resp.verdict.strip() if resp.verdict else "[No response]",
            one_liner=one_liner,
            confidence=max(0, min(100, resp.confidence)),
            key_assumption=resp.key_assumption.strip() if resp.key_assumption else "No assumption stated",
            timestamp=resp.timestamp or datetime.utcnow(),
        )

        final_scored.append(
            ScoredAgent(
                response=clean_resp,
                score=max(0, min(100, scored.score)),
                is_winner=scored.is_winner,
            )
        )

    # Also fix the winner's one-liner if needed
    winner_one_liner = formatted_winner.one_liner
    if _needs_one_liner(winner_one_liner):
        winner_one_liner = await generate_one_liner(client, model, formatted_winner.verdict)

    final_winner = AgentResponse(
        agent_id=formatted_winner.agent_id,
        agent_number=formatted_winner.agent_number,
        verdict=formatted_winner.verdict,
        one_liner=winner_one_liner,
        confidence=formatted_winner.confidence,
        key_assumption=formatted_winner.key_assumption,
        timestamp=formatted_winner.timestamp,
    )

    return PromptResponse(
        session_id=final_session_id,
        prompt=prompt,
        prompt_category=prompt_category,
        winner=final_winner,
        winner_agent_id=final_winner.agent_id,
        all_responses=final_scored,
        integrity=integrity,
        tools_used=tools_used or [],
        timestamp=datetime.utcnow(),
    )
