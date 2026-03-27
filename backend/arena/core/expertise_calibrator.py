"""Expert calibration: adjust pipeline prompts from user expertise level and domain."""

from __future__ import annotations

EXPERTISE_LEVELS: dict[str, dict[str, str]] = {
    "none": {
        "label": "No background",
        "descriptor": (
            "Explain from first principles. Use analogies. No jargon."
        ),
        "confidence_threshold": "0.70",
        "source_preference": "accessible general sources",
        "example_style": "everyday analogies",
    },
    "curious": {
        "label": "Curious learner",
        "descriptor": (
            "Intelligent but non-specialist. Define terminology briefly. "
            "Build intuition before precision."
        ),
        "confidence_threshold": "0.72",
        "source_preference": "reputable semi-technical",
        "example_style": "clear examples, light detail",
    },
    "practitioner": {
        "label": "Working professional",
        "descriptor": (
            "Works in this domain. Use standard terminology without definition. "
            "Focus on nuance, tradeoffs, practical implications."
        ),
        "confidence_threshold": "0.78",
        "source_preference": "industry publications, technical reports",
        "example_style": "domain-specific cases",
    },
    "expert": {
        "label": "Domain expert",
        "descriptor": (
            "Deep specialist knowledge. Precise technical language. Engage at peer level. "
            "Surface edge cases and contested findings."
        ),
        "confidence_threshold": "0.85",
        "source_preference": "primary research, authoritative technical sources",
        "example_style": "technical edge cases",
    },
    "researcher": {
        "label": "Active researcher",
        "descriptor": (
            "At the research frontier. Engage with current debates and unresolved questions. "
            "Treat as peer reviewer."
        ),
        "confidence_threshold": "0.90",
        "source_preference": "primary literature, preprints only",
        "example_style": "frontier cases, open questions",
    },
}


def _normalize_level(level: str) -> str:
    k = (level or "curious").strip().lower()
    return k if k in EXPERTISE_LEVELS else "curious"


def get_expertise_modifier(level: str, domain: str) -> str:
    key = _normalize_level(level)
    if key == "none":
        return ""
    config = EXPERTISE_LEVELS[key]
    domain_clause = f" in {domain.strip()}" if domain and domain.strip() else ""
    return f"""
EXPERTISE CALIBRATION:
User background: {config['label']}{domain_clause}
Instruction: {config['descriptor']}
Confidence threshold: {config['confidence_threshold']}
Source preference: {config['source_preference']}
Example style: {config['example_style']}
This calibration overrides default style decisions.
""".strip()


def append_expertise_to_system(base_prompt: str, expertise_modifier: str) -> str:
    """Append non-empty expertise block to the end of a stage system prompt."""
    block = (expertise_modifier or "").strip()
    if not block:
        return base_prompt
    return f"{base_prompt.rstrip()}\n\n{block}"
