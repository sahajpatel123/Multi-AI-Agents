"""Temporal evolution analysis: track how answers change over time for similar questions."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger("arena.temporal_evolution")

_STOP = {
    "this",
    "that",
    "have",
    "with",
    "from",
    "your",
    "they",
    "what",
    "when",
    "will",
    "would",
    "could",
    "should",
    "about",
    "there",
    "their",
    "which",
    "while",
    "where",
    "been",
    "were",
    "into",
    "than",
    "then",
    "them",
    "also",
    "just",
    "more",
    "most",
    "only",
    "over",
    "such",
    "very",
    "some",
    "does",
    "done",
    "make",
    "made",
    "need",
    "like",
    "even",
    "each",
    "both",
    "being",
}


def extract_answer_snippet(raw: str | None, *, limit: int = 400) -> str:
    """Pull a readable snippet from free text or structured Agent final_answer JSON."""
    text = (raw or "").strip()
    if not text:
        return ""
    if text.startswith("{") or text.startswith("["):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                if parsed.get("one_liner"):
                    text = str(parsed["one_liner"])
                elif isinstance(parsed.get("sentences"), list):
                    text = " ".join(
                        str(s.get("text") or s) if isinstance(s, dict) else str(s)
                        for s in parsed["sentences"]
                    )
                elif parsed.get("final_answer"):
                    text = str(parsed["final_answer"])
                elif parsed.get("text"):
                    text = str(parsed["text"])
        except Exception:
            pass
    cleaned = re.sub(r"\s+", " ", text).strip()
    return cleaned[:limit]


def _extract_key_terms(text: str) -> set[str]:
    words = re.findall(r"[a-z]{4,}", (text or "").lower())
    return {w for w in words if w not in _STOP}


def _jaccard_overlap(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def analyze_temporal_evolution(
    tasks: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Analyze how answers have evolved over time for a set of research tasks.

    Each task: {task_id, question?, one_liner?, final_answer?, created_at}
    """
    def _timeline_entry(t: dict[str, Any]) -> dict[str, Any]:
        snippet = (
            (t.get("one_liner") or "").strip()
            or extract_answer_snippet(t.get("final_answer"), limit=180)
            or ""
        )
        return {
            "task_id": t.get("task_id") or "",
            "created_at": t.get("created_at"),
            "snippet": snippet[:180],
            "score": t.get("score"),
        }

    if len(tasks) < 2:
        return {
            "evolution_score": 0,
            "trend_label": "insufficient",
            "key_shifts": [],
            "stability": 0,
            "task_sequence": [t.get("task_id", "") for t in tasks if t.get("task_id")],
            "timeline": [_timeline_entry(t) for t in tasks if t.get("task_id")],
            "message": "Need at least two related research runs to track evolution",
        }

    sorted_tasks = sorted(
        [t for t in tasks if t.get("created_at")],
        key=lambda t: t.get("created_at") or "",
    )

    if len(sorted_tasks) < 2:
        return {
            "evolution_score": 0,
            "trend_label": "insufficient",
            "key_shifts": [],
            "stability": 0,
            "task_sequence": [],
            "timeline": [_timeline_entry(t) for t in tasks if t.get("task_id")],
            "message": "Need at least two dated research runs to track evolution",
        }

    term_sets = [
        _extract_key_terms(
            t.get("one_liner")
            or extract_answer_snippet(t.get("final_answer"))
            or ""
        )
        for t in sorted_tasks
    ]

    overlaps: list[float] = []
    shifts: list[dict[str, Any]] = []
    for i in range(len(term_sets) - 1):
        overlap = _jaccard_overlap(term_sets[i], term_sets[i + 1])
        overlaps.append(overlap)

        gained = term_sets[i + 1] - term_sets[i]
        lost = term_sets[i] - term_sets[i + 1]
        if gained or lost:
            shifts.append(
                {
                    "from_task": sorted_tasks[i].get("task_id", ""),
                    "to_task": sorted_tasks[i + 1].get("task_id", ""),
                    "gained_terms": sorted(gained, key=len, reverse=True)[:5],
                    "lost_terms": sorted(lost, key=len, reverse=True)[:5],
                }
            )

    mean_overlap = sum(overlaps) / len(overlaps) if overlaps else 1.0
    evolution_score = int(round(max(0.0, min(100.0, (1.0 - mean_overlap) * 100))))
    stability = int(round(max(0.0, min(100.0, mean_overlap * 100))))

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
        "related_count": len(sorted_tasks),
        "timeline": [_timeline_entry(t) for t in sorted_tasks],
    }
