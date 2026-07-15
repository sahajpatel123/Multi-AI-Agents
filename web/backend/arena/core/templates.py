"""Agent task prompt templates (library)."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

TEMPLATES: list[dict[str, Any]] = [
    {
        "id": "market_research",
        "category": "Business",
        "title": "Market Research",
        "icon": "chart",
        "description": "Analyse market size, players, trends and opportunities",
        "prompt_template": (
            "Research the {market} market: current size, key players, growth trends, "
            "and opportunities for {context}."
        ),
        "slots": ["market", "context"],
        "default_expertise": "practitioner",
        "example": "Research the B2B SaaS market",
    },
    {
        "id": "competitor_analysis",
        "category": "Business",
        "title": "Competitor Analysis",
        "icon": "target",
        "description": "Deep dive on a specific competitor",
        "prompt_template": (
            "Analyse {company}: business model, strengths, weaknesses, strategy, "
            "and how they compare to {competitor}."
        ),
        "slots": ["company", "competitor"],
        "default_expertise": "practitioner",
        "example": "Analyse Linear vs Jira",
    },
    {
        "id": "technical_decision",
        "category": "Technical",
        "title": "Technical Decision",
        "icon": "code",
        "description": "Compare two technical approaches",
        "prompt_template": (
            "Compare {option_a} vs {option_b} for {use_case}. Cover tradeoffs, "
            "performance, scalability, and recommendation."
        ),
        "slots": ["option_a", "option_b", "use_case"],
        "default_expertise": "expert",
        "example": "PostgreSQL vs MongoDB for analytics",
    },
    {
        "id": "investment_thesis",
        "category": "Finance",
        "title": "Investment Thesis",
        "icon": "trending",
        "description": "Build a research-backed thesis",
        "prompt_template": (
            "Build an investment thesis for {asset}: bull case, bear case, key risks, "
            "catalysts, and time horizon for {investor}."
        ),
        "slots": ["asset", "investor"],
        "default_expertise": "expert",
        "example": "Investment thesis for Nvidia",
    },
    {
        "id": "scientific_review",
        "category": "Research",
        "title": "Scientific Review",
        "icon": "flask",
        "description": "Survey current evidence on a topic",
        "prompt_template": (
            "Review current evidence on {topic}: consensus view, dissenting findings, "
            "methodological quality, and open questions."
        ),
        "slots": ["topic"],
        "default_expertise": "researcher",
        "example": "Evidence on intermittent fasting",
    },
    {
        "id": "policy_analysis",
        "category": "Policy",
        "title": "Policy Analysis",
        "icon": "landmark",
        "description": "Analyse a policy or regulation",
        "prompt_template": (
            "Analyse {policy}: intended goals, real-world effects, winners, losers, "
            "and alternatives for {context}."
        ),
        "slots": ["policy", "context"],
        "default_expertise": "practitioner",
        "example": "Analyse GDPR impact on startups",
    },
    {
        "id": "career_decision",
        "category": "Personal",
        "title": "Career Decision",
        "icon": "compass",
        "description": "Research-backed career analysis",
        "prompt_template": (
            "Analyse the decision to {decision}: pros, cons, market demand, skill "
            "requirements, and 5-year outlook for someone with {background}."
        ),
        "slots": ["decision", "background"],
        "default_expertise": "curious",
        "example": "Transition from engineering to PM",
    },
    {
        "id": "contrarian_take",
        "category": "Analysis",
        "title": "Contrarian Take",
        "icon": "zap",
        "description": "Steel-man the unpopular view",
        "prompt_template": (
            "Make the strongest possible case for {contrarian_position} on {topic}. "
            "Include best evidence, strongest arguments, and what mainstream view gets wrong."
        ),
        "slots": ["contrarian_position", "topic"],
        "default_expertise": "expert",
        "example": "Case against remote work",
    },
    # ── Condura demonstrative templates (capability-gated) ──
    {
        "id": "open_in_linear",
        "category": "On device",
        "title": "Open in Linear",
        "icon": "target",
        "description": "Create a Linear ticket from research (needs Condura)",
        "prompt_template": (
            "Create a ticket in Linear from this research: {summary}. "
            "Open Linear on my computer and file it under {project}."
        ),
        "slots": ["summary", "project"],
        "default_expertise": "practitioner",
        "example": "Ticket for API rate-limit findings",
        "capability_id": "app.open_in_linear",
        "execution": "condura",
    },
    {
        "id": "save_report_local",
        "category": "On device",
        "title": "Save report locally",
        "icon": "chart",
        "description": "Write a report then save it on your machine (Condura)",
        # Phrasing must match capabilities.classify_task_text local-path patterns
        # so /api/agent/run honest-rejection cannot miss this demo template.
        "prompt_template": (
            "Write a concise research report on {topic}, then save the report to "
            "~/Documents/{filename} on my machine."
        ),
        "slots": ["topic", "filename"],
        "default_expertise": "practitioner",
        "example": "Save market brief to Documents",
        "capability_id": "report.save_to_local",
        "execution": "hybrid_prep",
    },
    {
        "id": "long_research_delegate",
        "category": "On device",
        "title": "Watch topic (on device)",
        "icon": "trending",
        "description": "Long-running on-device research loop (Condura)",
        "prompt_template": (
            "Watch {topic} for material changes every 4 hours on my machine "
            "and keep running until I cancel."
        ),
        "slots": ["topic"],
        "default_expertise": "researcher",
        "example": "Watch AI regulation every 4h",
        "capability_id": "agent.long_research",
        "execution": "hybrid_delegate",
        "disabled": True,
        "disabled_reason": "Available after Condura long-running delegate ships",
    },
]


def get_templates_grouped_by_category() -> dict[str, Any]:
    by_cat: dict[str, list] = defaultdict(list)
    for t in TEMPLATES:
        by_cat[str(t["category"])].append(t)
    return {"categories": dict(by_cat)}
