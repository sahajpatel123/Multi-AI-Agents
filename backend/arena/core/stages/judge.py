import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any

from arena.core.blackboard import AgentStatus, Blackboard, StageStatus
from arena.core.expertise_calibrator import append_expertise_to_system
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

logger = logging.getLogger(__name__)

AGENT_MAX_TOKENS = 2048

CAVEAT_CATEGORIES = frozenset(
    {
        "time-sensitive",
        "methodological",
        "theory-dependent",
        "completeness",
        "precision",
        "scoring",
        "aesthetic",
    }
)

JUDGE_SYSTEM_PROMPT = """
You are the Judge stage of an AI reasoning pipeline.

You receive the final synthesised answer to a task.

Your job: score it, decide if it passes the quality bar, and list analytical caveats.

Scoring criteria:
- Completeness (0-25): Does it fully answer the task?
- Accuracy (0-25): Are claims supported and accurate?
- Clarity (0-25): Is it clear and well-structured?
- Usefulness (0-25): Is it genuinely useful to the user?

For each caveat identified, classify it into exactly one of these categories:
- "time-sensitive" — answer will expire or become outdated by a specific date
- "methodological" — flaw in how the question was approached or evaluated
- "theory-dependent" — answer changes based on which theoretical framework is applied
- "completeness" — important angle or perspective is missing from the answer
- "precision" — specific claim is technically imprecise or oversimplified
- "scoring" — caveat about numerical score validity or rubric limitations
- "aesthetic" — subjective judgment that cannot be empirically verified

Caveat fields:
- "keyword": max 5 words, punchy, scannable
- "description": max 20 words, plain language
- "severity": "high" | "medium" | "low"
  (high = fundamentally affects answer; medium = notable; low = minor)
- "expires": for "time-sensitive" only, use "MMM YYYY" (e.g. "Jul 2026") when the answer's
  factual basis is expected to become stale; otherwise null.
  For all other categories, "expires" must be null.

Output JSON only. No preamble.

{
  "completeness": 0-25,
  "accuracy": 0-25,
  "clarity": 0-25,
  "usefulness": 0-25,
  "total_score": 0-100,
  "verdict": "pass|needs_revision",
  "revision_reason": "only if needs_revision",
  "key_strengths": ["strength 1", "strength 2"],
  "summary": "one sentence verdict",
  "caveats": [
    {
      "category": "time-sensitive",
      "keyword": "Answer valid until Jul 2026",
      "description": "one sentence explanation",
      "severity": "high|medium|low",
      "expires": "MMM YYYY or null"
    }
  ]
}

Pass threshold: 70+

FORMATTING NOTE — the synthesised answer may be JSON with per-sentence "text" fields or plain markdown. When scoring Clarity and Usefulness, reward structured markdown (##/### headings, bullets, **bold**, blockquotes, tables) and penalise unstructured walls of text. Prefer answers that follow markdown-style structure when present: ## for main sections, ### for sub-sections, bullets for 3+ items, **bold** for key terms, > for caveats, tables for comparisons, short paragraphs, an executive summary up front, and a ## Conclusion or ## Bottom Line at the end. Do not penalise the answer for omitting a duplicate of the task question as a heading.
"""


def _norm_category(raw: str) -> str:
    c = raw.lower().strip().replace(" ", "-").replace("_", "-")
    if c in CAVEAT_CATEGORIES:
        return c
    aliases = {
        "timesensitive": "time-sensitive",
        "time": "time-sensitive",
        "method": "methodological",
        "theory": "theory-dependent",
        "complete": "completeness",
        "missing": "completeness",
        "precise": "precision",
        "score": "scoring",
        "rubric": "scoring",
        "subjective": "aesthetic",
    }
    return aliases.get(c, "scoring")


def _norm_severity(raw: str) -> str:
    s = str(raw or "").lower().strip()
    if s in ("high", "hi"):
        return "high"
    if s in ("medium", "med", "md"):
        return "medium"
    if s in ("low", "lo"):
        return "low"
    return "medium"


def normalize_caveats(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        cat = _norm_category(str(item.get("category", "")))
        keyword = str(item.get("keyword", "")).strip()
        description = str(item.get("description", "")).strip()
        if not keyword and not description:
            continue
        if not keyword:
            keyword = description[:40] + ("…" if len(description) > 40 else "")
        if not description:
            description = keyword
        severity = _norm_severity(str(item.get("severity", "")))
        expires_raw = item.get("expires")
        expires: str | None
        if cat == "time-sensitive" and expires_raw not in (None, "", "null"):
            expires = str(expires_raw).strip()
        else:
            expires = None
        out.append(
            {
                "category": cat,
                "keyword": keyword,
                "description": description,
                "severity": severity,
                "expires": expires,
            }
        )
    return out


async def run_judge(bb: Blackboard) -> Blackboard:
    start = time.time()
    bb.current_stage = "judge"
    bb.judgment.status = StageStatus.RUNNING

    try:
        model = MODEL_REGISTRY.get("deepseek_v4_flash", MODEL_REGISTRY["claude_sonnet"])
        provider = str(model.get("provider", "deepseek"))

        user_prompt = f"""
Original Task: {bb.task}

Final Answer to Judge:
{bb.final_answer}

Score this answer objectively. Include caveats array as specified.
"""

        response, inp, out = await call_llm(
            client=model["client"],
            provider=provider,
            model_id=model["model_id"],
            system_prompt=append_expertise_to_system(JUDGE_SYSTEM_PROMPT, bb.expertise_modifier),
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=AGENT_MAX_TOKENS,
        )
        bb.total_input_tokens += inp
        bb.total_output_tokens += out

        json_match = re.search(r"\{.*\}", response, re.DOTALL)
        judgment_data: dict = {}
        if json_match:
            try:
                judgment_data = json.loads(json_match.group())
            except Exception:
                logger.warning("Failed to parse judgment JSON from LLM response", exc_info=True)

        bb.judgment.output = response
        bb.judgment.model_used = model["model_id"]
        bb.judgment.status = StageStatus.COMPLETE
        bb.judgment.duration_ms = int((time.time() - start) * 1000)

        bb.caveats = normalize_caveats(judgment_data.get("caveats"))

        total_score = judgment_data.get("total_score", 75)
        try:
            bb.final_score = int(total_score)
        except (TypeError, ValueError):
            bb.final_score = 75

        verdict = str(judgment_data.get("verdict", "pass")).lower()

        if verdict == "needs_revision" and bb.iterations < bb.max_iterations:
            bb.status = AgentStatus.NEEDS_REVISION
            bb.iterations += 1
        else:
            bb.status = AgentStatus.COMPLETE
            bb.completed_at = datetime.now(timezone.utc)

    except Exception:
        logger.warning("Judge stage failed", exc_info=True)
        bb.judgment.status = StageStatus.COMPLETE
        bb.judgment.output = "Judgment failed."
        bb.final_score = 75
        bb.caveats = []
        bb.status = AgentStatus.COMPLETE
        bb.completed_at = datetime.now(timezone.utc)

    return bb
