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
each sentence has a confidence label.

For EACH sentence, set "confidence" to exactly one of these strings:
- "verified" — 90%+ equivalent: verified fact, multiple sources
- "supported" — 70–89% equivalent: well-supported claim
- "uncertain" — below 70% or contested: inference, limited support, or speculation

Do not use numeric confidence, "high"/"medium"/"low", or any other value.

Output valid JSON only. No preamble.

{
  "sentences": [
    {
      "text": "sentence text here",
      "confidence": "supported",
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


def _numeric_to_confidence_label(n: float) -> str:
    if n >= 90:
        return "verified"
    if n >= 70:
        return "supported"
    return "uncertain"


def _normalize_sentence_confidence(raw) -> str:
    if isinstance(raw, str):
        k = raw.lower().strip()
        if k in ("verified", "high"):
            return "verified"
        if k in ("supported", "medium"):
            return "supported"
        if k in ("uncertain", "low"):
            return "uncertain"
        try:
            return _numeric_to_confidence_label(float(k))
        except (TypeError, ValueError):
            return "supported"
    if isinstance(raw, (int, float)):
        return _numeric_to_confidence_label(float(raw))
    return "supported"


def _normalize_synthesis_payload(data: dict) -> dict:
    out = dict(data)
    sents = out.get("sentences")
    if not isinstance(sents, list):
        return out
    new_sents: list[dict] = []
    for item in sents:
        if not isinstance(item, dict):
            continue
        row = dict(item)
        row["confidence"] = _normalize_sentence_confidence(item.get("confidence"))
        new_sents.append(row)
    out["sentences"] = new_sents
    return out


def _default_synthesis_payload(full_text: str, overall: float = 70.0) -> dict:
    return {
        "sentences": [
            {
                "text": full_text,
                "confidence": _numeric_to_confidence_label(float(overall)),
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
                data = _normalize_synthesis_payload(data)
                out = json.dumps(data, ensure_ascii=False)
                return data, out
        except json.JSONDecodeError:
            pass
    try:
        data = json.loads(text)
        if isinstance(data, dict) and "sentences" in data:
            data = _normalize_synthesis_payload(data)
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

