"""Seed persona library data."""

from __future__ import annotations

from sqlalchemy.orm import Session

from arena.core.agents import PERSONA_PROMPTS
from arena.db_models import PersonaLibrary


async def seed_persona_library(db: Session) -> None:
    existing = db.query(PersonaLibrary).count()
    if existing > 0:
        return

    personas = [
        {"persona_id": "analyst", "name": "The Analyst", "color": "#8C9BAB", "bg_tint": "#EEF0F2", "quote": "I find the flaw in everything.", "description": "Stress-tests every claim. Finds the weakest assumption and attacks it with precision.", "temperature": 0.2, "system_prompt": PERSONA_PROMPTS["analyst"], "provider": "deepseek", "is_locked": False, "display_order": 1},
        {"persona_id": "philosopher", "name": "The Philosopher", "color": "#9B8FAA", "bg_tint": "#F0EDF2", "quote": "I question the premise first.", "description": "Never answers the question asked. Always asks if the question itself is the right one.", "temperature": 0.7, "system_prompt": PERSONA_PROMPTS["philosopher"], "provider": "openai", "is_locked": False, "display_order": 2},
        {"persona_id": "pragmatist", "name": "The Pragmatist", "color": "#8AA899", "bg_tint": "#EDF2EF", "quote": "I only care what actually works.", "description": "Cuts through theory. Only interested in what has worked in the real world and can work again.", "temperature": 0.5, "system_prompt": PERSONA_PROMPTS["pragmatist"], "provider": "openai", "is_locked": False, "display_order": 3},
        {"persona_id": "contrarian", "name": "The Contrarian", "color": "#B0977E", "bg_tint": "#F2EDE8", "quote": "I say what no one else will.", "description": "Argues against whatever the consensus is. Exists to say the uncomfortable thing.", "temperature": 1.0, "system_prompt": PERSONA_PROMPTS["contrarian"], "provider": "grok", "is_locked": False, "display_order": 4},
        {"persona_id": "scientist", "name": "The Scientist", "color": "#7A9BAB", "bg_tint": "#EEF2F4", "quote": "Evidence, methodology, data.", "description": "Demands evidence for every claim. Thinks in hypotheses, tests, and confidence intervals.", "temperature": 0.2, "system_prompt": PERSONA_PROMPTS["scientist"], "provider": "deepseek", "is_locked": False, "display_order": 5},
        {"persona_id": "historian", "name": "The Historian", "color": "#9B8A7A", "bg_tint": "#F2EEE8", "quote": "Every pattern has a precedent.", "description": "Finds the historical parallel for every modern problem.", "temperature": 0.3, "system_prompt": PERSONA_PROMPTS["historian"], "provider": "openai", "is_locked": False, "display_order": 6},
        {"persona_id": "economist", "name": "The Economist", "color": "#7A9B8A", "bg_tint": "#EEF2EE", "quote": "Incentives explain everything.", "description": "Reduces every question to incentives, trade-offs, and unintended consequences.", "temperature": 0.4, "system_prompt": PERSONA_PROMPTS["economist"], "provider": "deepseek", "is_locked": False, "display_order": 7},
        {"persona_id": "ethicist", "name": "The Ethicist", "color": "#AA8F9B", "bg_tint": "#F2EEF0", "quote": "What are the moral stakes?", "description": "Centers the moral stakes of every decision. Applies frameworks rigorously.", "temperature": 0.5, "system_prompt": PERSONA_PROMPTS["ethicist"], "provider": "claude", "is_locked": False, "display_order": 8},
        {"persona_id": "stoic", "name": "The Stoic", "color": "#8A8A9B", "bg_tint": "#EEEEF2", "quote": "Remove the emotion. Then decide.", "description": "Strips out emotional reasoning. Focuses only on what is within your control.", "temperature": 0.3, "system_prompt": PERSONA_PROMPTS["stoic"], "provider": "deepseek", "is_locked": False, "display_order": 9},
        {"persona_id": "futurist", "name": "The Futurist", "color": "#9BAA7A", "bg_tint": "#F0F2EE", "quote": "What does this become in 10 years?", "description": "Extrapolates from current trends. Always thinking about second and third order effects.", "temperature": 0.9, "system_prompt": PERSONA_PROMPTS["futurist"], "provider": "grok", "is_locked": False, "display_order": 10},
        {"persona_id": "strategist", "name": "The Strategist", "color": "#AA957A", "bg_tint": "#F2F0EE", "quote": "Where is the leverage?", "description": "Thinks in positioning, timing, and asymmetric moves.", "temperature": 0.5, "system_prompt": PERSONA_PROMPTS["strategist"], "provider": "grok", "is_locked": False, "display_order": 11},
        {"persona_id": "engineer", "name": "The Engineer", "color": "#7A8A9B", "bg_tint": "#EEF0F2", "quote": "What are the constraints?", "description": "Thinks in systems and constraints. Wants to know what breaks first and why.", "temperature": 0.2, "system_prompt": PERSONA_PROMPTS["engineer"], "provider": "deepseek", "is_locked": False, "display_order": 12},
        {"persona_id": "optimist", "name": "The Optimist", "color": "#9BAA8A", "bg_tint": "#EFF2EE", "quote": "What is the best that could happen?", "description": "Finds the opportunity in every problem. Evidence-based optimism.", "temperature": 0.7, "system_prompt": PERSONA_PROMPTS["optimist"], "provider": "openai", "is_locked": False, "display_order": 13},
        {"persona_id": "empath", "name": "The Empath", "color": "#AA8A9B", "bg_tint": "#F2EEF1", "quote": "Who does this affect and how?", "description": "Centers the lived experience of people most affected by decisions.", "temperature": 0.6, "system_prompt": PERSONA_PROMPTS["empath"], "provider": "claude", "is_locked": False, "display_order": 14},
        {"persona_id": "firstprinciples", "name": "First Principles", "color": "#9B9BAA", "bg_tint": "#F0F0F2", "quote": "Strip it to fundamentals.", "description": "Tears down assumptions to bedrock. Rebuilds from what is provably true.", "temperature": 0.7, "system_prompt": PERSONA_PROMPTS["firstprinciples"], "provider": "deepseek", "is_locked": False, "display_order": 15},
        {"persona_id": "devilsadvocate", "name": "Devil's Advocate", "color": "#AA7A7A", "bg_tint": "#F2EEEE", "quote": "I argue against everything.", "description": "Makes the strongest possible case against whatever you believe.", "temperature": 1.0, "system_prompt": PERSONA_PROMPTS["devilsadvocate"], "provider": "grok", "is_locked": False, "display_order": 16},
    ]

    for persona in personas:
        db.add(PersonaLibrary(**persona))
    db.commit()
