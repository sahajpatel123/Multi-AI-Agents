"""Temporal evolution analysis: track how answers change over time for similar questions."""

import logging
import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("arena.temporal_evolution")


def _extract_key_terms(text: str) -> set[str]:
    """Extract significant terms from answer text (simple heuristic)."""
    words = re.findall(r"[a-z]{4,}", (text or "").lower())
    # Filter common words
    stop = {"this", "that", "have", "with", "from", "your", "they", "what", "when", "will"}
    return {w for w in words if w not in stop}


def _jaccard_overlap(a: set[str], b: set[str]) -> float:
    """Jaccard similarity between two term sets."""
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def analyze_temporal_evolution(
    tasks: list[dict[str, Any]],  # [{task_id, question, one_liner, final_answer, created_at}]
) -> dict[str, Any]:
    """
    Analyze how answers have evolved over time for a set of research tasks.

    Returns:
    - evolution_score: 0-100 (100 = completely divergent over time)
    - trend_label: "evolving", "converging", "stable", "insufficient"
    - key_shifts: list of notable term changes between versions
    - stability: temporal stability score (0-100)
    """
    if len(tasks) < 2:
        return {
            "evolution_score": 0,
            "trend_label": "insufficient",
            "key_shifts": [],
            "stability": 0,
        }

    # Sort by creation time
    sorted_tasks = sorted(
        [t for t in tasks if t.get("created_at")],
        key=lambda t: t.get("created_at", ""),
    )

    if len(sorted_tasks) < 2:
        return {
            "evolution_score": 0,
            "trend_label": "insufficient",
            "key_shifts": [],
            "stability": 0,
        }

    # Extract terms from each answer
    term_sets = [_extract_key_terms(t.get("one_liner") or t.get("final_answer") or "") for t in sorted_tasks]

    # Calculate pairwise evolution
    overlaps = []
    shifts = []
    for i in range(len(term_sets) - 1):
        overlap = _jaccard_overlap(term_sets[i], term_sets[i + 1])
        overlaps.append(overlap)

        # Track what terms were gained/lost
        gained = term_sets[i + 1] - term_sets[i]
        lost = term_sets[i] - term_sets[i + 1]
        if gained or lost:
            shifts.append({
                "from_task": sorted_tasks[i].get("task_id", ""),
                "to_task": sorted_tasks[i + 1].get("task_id", ""),
                "gained_terms": list(gained)[:5],
                "lost_terms": list(lost)[:5],
            })

    mean_overlap = sum(overlaps) / len(overlaps) if overlaps else 1.0
    evolution_score = int((1.0 - mean_overlap) * 100)

    # Stability = how consistent over time
    stability = int(mean_overlap * 100)

    if evolution_score >= 60:
        trend = "evolving"
    elif evolution_score >= 30:
        trend = "moderate shift"
    elif evolution_score >= 10:
        trend = "stable"
    else:
        trend = "converging"

    return {
        "evolution_score": evolution_score,
        "trend_label": trend,
        "key_shifts": shifts,
        "stability": stability,
        "task_sequence": [t.get("task_id", "") for t in sorted_tasks],
    }