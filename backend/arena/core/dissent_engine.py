from typing import TypedDict, List
import json
import logging
from asyncio import wait_for

logger = logging.getLogger(__name__)

class DissentPosition(TypedDict):
    claim: str
    strength: str
    why_excluded: str
    confidence_impact: int

class DissentReport(TypedDict):
    positions: List[DissentPosition]
    minority_view_summary: str

async def generate_dissent_report(
    question: str,
    final_answer: str,
    critique_output: str
) -> DissentReport:
    """Generate dissenting positions using GPT-4o."""
    from openai import AsyncOpenAI
    from arena.config import get_settings
    
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    
    system_prompt = """You are a devil's advocate analyst. Given a final answer and its critique, identify 2-3 legitimate dissenting positions a reasonable expert might hold that were not reflected in the final answer. Be intellectually honest, not contrarian for its own sake.

Return ONLY valid JSON:
{
  "positions": [
    {
      "claim": "string",
      "strength": "strong|moderate|weak",
      "why_excluded": "string",
      "confidence_impact": -15
    }
  ],
  "minority_view_summary": "string"
}"""
    
    user_prompt = f"""Original question: {question}
Final answer: {final_answer}
Critique output: {critique_output}"""
    
    try:
        response = await wait_for(
            client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.6,
            ),
            timeout=25
        )
        
        content = response.choices[0].message.content
        if not content:
            raise ValueError("Empty response from GPT-4o")
        
        result = json.loads(content)
        
        if not isinstance(result, dict):
            raise ValueError("Response is not a dict")
        
        if "positions" not in result or "minority_view_summary" not in result:
            raise ValueError("Missing required fields")
        
        return result
        
    except Exception:
        # Surface the underlying parse/format error so we can spot LLM drift
        # without needing to reproduce a 4xx from the API. The call falls
        # through to the default empty dissent report on purpose — dissent is
        # additive to the answer, not a hard requirement.
        logger.exception("dissent_engine.parse_dissent: returning empty report")
        return {"positions": [], "minority_view_summary": ""}
