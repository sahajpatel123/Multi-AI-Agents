import json
import re
import time

from arena.core.blackboard import Blackboard, StageStatus
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY

AGENT_MAX_TOKENS = 4096

SYNTHESIZER_SYSTEM_PROMPT = """
You are the Synthesizer stage of an AI reasoning pipeline.

You receive the full pipeline output.
Your job: produce the final answer in a structured JSON format where
each sentence has a confidence score.

Confidence scoring guide:
90-100: Verified fact, multiple sources
70-89:  Well-supported claim
50-69:  Reasonable inference
30-49:  Uncertain, limited support
0-29:   Speculation, flag clearly

Output valid JSON only. No preamble.

{
  "sentences": [
    {
      "text": "sentence text here",
      "confidence": 85,
      "type": "fact|inference|recommendation|caveat"
    }
  ],
  "overall_confidence": 78,
  "high_confidence_count": 4,
  "low_confidence_count": 1,
  "flags": [
    "any important caveats here"
  ],
  "sources_referenced": [
    "source or context used"
  ]
}
"""


def _default_synthesis_payload(full_text: str, overall: float = 70.0) -> dict:
    return {
        "sentences": [
            {
                "text": full_text,
                "confidence": int(overall),
                "type": "fact",
            }
        ],
        "overall_confidence": overall,
        "high_confidence_count": 0,
        "low_confidence_count": 0,
        "flags": [],
        "sources_referenced": [],
    }


def _parse_synthesizer_response(response: str) -> tuple[dict, str]:
    """Parse LLM JSON; return (payload dict, canonical JSON string)."""
    text = response.strip()
    json_match = re.search(r"\{.*\}", text, re.DOTALL)
    if json_match:
        try:
            data = json.loads(json_match.group())
            if isinstance(data, dict) and "sentences" in data:
                out = json.dumps(data, ensure_ascii=False)
                return data, out
        except json.JSONDecodeError:
            pass
    try:
        data = json.loads(text)
        if isinstance(data, dict) and "sentences" in data:
            out = json.dumps(data, ensure_ascii=False)
            return data, out
    except json.JSONDecodeError:
        pass
    payload = _default_synthesis_payload(response.strip() or "No synthesized output.")
    out = json.dumps(payload, ensure_ascii=False)
    return payload, out


async def run_synthesizer(bb: Blackboard) -> Blackboard:
    start = time.time()
    bb.current_stage = "synthesizer"
    bb.synthesis.status = StageStatus.RUNNING

    try:
        model = MODEL_REGISTRY["claude_sonnet"]

        user_prompt = f"""
Original Task: {bb.task}

Initial Solution:
{bb.solution.output or "None"}

Critique:
{bb.critique.output or "None"}

Verification Results:
{bb.verification.output or "None"}

Synthesise the final answer as structured JSON per system instructions.
Address all valid criticisms.
Remove unverifiable claims.
"""

        response = await call_llm(
            client=model["client"],
            provider="claude",
            model_id=model["model_id"],
            system_prompt=SYNTHESIZER_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.4,
            max_tokens=AGENT_MAX_TOKENS,
        )

        parsed, json_str = _parse_synthesizer_response(response)

        bb.synthesis.output = json_str
        bb.synthesis.model_used = model["model_id"]
        bb.synthesis.status = StageStatus.COMPLETE
        bb.synthesis.duration_ms = int((time.time() - start) * 1000)
        bb.final_answer = json_str

        try:
            oc = parsed.get("overall_confidence", 70)
            bb.final_confidence = float(oc)
        except (TypeError, ValueError):
            bb.final_confidence = 70.0

        extra_flags = parsed.get("flags") or []
        if isinstance(extra_flags, list):
            for f in extra_flags:
                if isinstance(f, str) and f.strip() and f not in bb.flags:
                    bb.flags.append(f.strip())

    except Exception as e:
        bb.synthesis.status = StageStatus.FAILED
        bb.error = f"Synthesizer failed: {e}"
        fallback = bb.solution.output or f"Unable to synthesize. Task: {bb.task}"
        payload = _default_synthesis_payload(fallback, 70.0)
        json_str = json.dumps(payload, ensure_ascii=False)
        bb.synthesis.output = json_str
        bb.final_answer = json_str
        bb.final_confidence = 70.0
        bb.synthesis.status = StageStatus.COMPLETE
        bb.synthesis.duration_ms = int((time.time() - start) * 1000)
        try:
            bb.synthesis.model_used = MODEL_REGISTRY["claude_sonnet"]["model_id"]
        except Exception:
            pass

    return bb

