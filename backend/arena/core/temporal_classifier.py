from typing import TypedDict, List, Optional
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import json
from asyncio import wait_for

class TemporalProfile(TypedDict):
    decay_class: str
    half_life: str
    recheck_by: Optional[str]
    decay_reason: str
    time_sensitive_claims: List[str]

async def classify_temporal(
    question: str,
    final_answer: str
) -> TemporalProfile:
    """Classify how quickly this answer will become outdated using DeepSeek V3."""
    from openai import AsyncOpenAI
    from arena.config import get_settings
    
    settings = get_settings()
    client = AsyncOpenAI(
        api_key=settings.deepseek_api_key,
        base_url="https://api.deepseek.com"
    )
    
    system_prompt = """Classify how quickly this answer will become outdated. Decay classes:
- permanent: math/logic/philosophy. Never expires.
- durable: science, history, institutions. 2-5yr.
- seasonal: markets, policy, tech. 3-6 months.
- perishable: current events, prices, news. Days.

Also identify up to 3 specific claims that will expire soonest (under 12 words each).

Return ONLY valid JSON:
{
  "decay_class": "permanent|durable|seasonal|perishable",
  "decay_reason": "one sentence",
  "time_sensitive_claims": ["claim1", "claim2"]
}"""
    
    user_prompt = f"Question: {question}\nAnswer: {final_answer}"
    
    try:
        response = await wait_for(
            client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.15,
            ),
            timeout=25
        )
        
        content = response.choices[0].message.content
        if not content:
            raise ValueError("Empty response from DeepSeek V3")
        
        result = json.loads(content)
        
        if not isinstance(result, dict):
            raise ValueError("Response is not a dict")
        
        decay_class = result.get("decay_class", "durable")
        decay_reason = result.get("decay_reason", "")
        time_sensitive_claims = result.get("time_sensitive_claims", [])
        
        now = datetime.utcnow()
        if decay_class == "permanent":
            recheck_by = None
        elif decay_class == "durable":
            recheck_by = (now + relativedelta(years=2)).strftime("%b %Y")
        elif decay_class == "seasonal":
            recheck_by = (now + relativedelta(months=4)).strftime("%b %Y")
        elif decay_class == "perishable":
            recheck_by = (now + timedelta(days=14)).strftime("%b %Y")
        else:
            recheck_by = None
        
        half_life_map = {
            "permanent": "Timeless",
            "durable": "2–5 years",
            "seasonal": "3–6 months",
            "perishable": "Days to weeks"
        }
        half_life = half_life_map.get(decay_class, "2–5 years")
        
        return {
            "decay_class": decay_class,
            "half_life": half_life,
            "recheck_by": recheck_by,
            "decay_reason": decay_reason,
            "time_sensitive_claims": time_sensitive_claims
        }
        
    except Exception:
        return {
            "decay_class": "durable",
            "half_life": "2–5 years",
            "recheck_by": None,
            "decay_reason": "",
            "time_sensitive_claims": []
        }
