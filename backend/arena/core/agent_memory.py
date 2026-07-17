"""Persistent research memory: topics, conclusions, cross-session contradictions."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from arena.core.blackboard import Blackboard
from arena.core.llm_caller import call_llm
from arena.core.model_router import MODEL_REGISTRY
from arena.db_models import AgentContradiction, AgentTask

logger = logging.getLogger("arena.agent_memory")

TOPIC_EXTRACTOR_PROMPT = """
You extract topic tags from a task.

Return a JSON array of 2-5 short topic strings only.
No preamble. No explanation.

Example output:
["AI startups", "venture capital", "technology funding"]

Keep each tag under 4 words.
"""

CONCLUSION_EXTRACTOR_PROMPT = """
You extract the 2-3 key conclusions from an Agent answer.

Return a JSON array of short conclusion strings only.
Each conclusion is one sentence max.
No preamble. No explanation.

Example output:
["TypeScript improves code quality at scale",
 "Migration cost is highest in years 1-2",
 "Smaller teams benefit less than large ones"]
"""

CONTRADICTION_DETECTOR_PROMPT = """
You detect if two AI research answers contradict each other.

You will receive:
- A new task and its conclusions
- A list of past tasks (each with task_id, task text, and conclusions)

Your job: identify if any past conclusion directly contradicts any new conclusion.

Return JSON only. No preamble.

{
  "contradictions_found": true|false,
  "contradictions": [
    {
      "new_conclusion": "...",
      "old_conclusion": "...",
      "old_task": "brief description",
      "old_task_id": "the task_id from the past list if identifiable, else empty string",
      "severity": "minor|moderate|major",
      "summary": "one sentence describing the contradiction"
    }
  ]
}

If no contradictions return:
{"contradictions_found": false, "contradictions": []}

Only flag direct factual contradictions.
Not differences in emphasis.
Not complementary perspectives.
Only genuine contradictions where one conclusion says X and another says not-X.
"""


def _json_array_from_response(response: str) -> list[Any]:
    match = re.search(r"\[.*?\]", response, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            return []
    return []


def _json_object_from_response(response: str) -> Optional[dict]:
    match = re.search(r"\{.*\}", response, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            return None
    return None


async def extract_topics(task_text: str, bb: Optional[Blackboard] = None) -> list[str]:
    try:
        model = MODEL_REGISTRY.get("gpt_4o_mini", MODEL_REGISTRY["claude_sonnet"])
        provider = str(model.get("provider", "openai"))
        response, inp, out = await call_llm(
            client=model["client"],
            provider=provider,
            model_id=model["model_id"],
            system_prompt=TOPIC_EXTRACTOR_PROMPT,
            user_prompt=f"Task: {task_text}",
            temperature=0.1,
            max_tokens=150,
        )
        if bb is not None:
            bb.total_input_tokens += inp
            bb.total_output_tokens += out
        raw = _json_array_from_response(response)
        return [str(x).strip() for x in raw if str(x).strip()][:8]
    except Exception as e:
        logger.warning("Topic extraction failed: %s", e)
        return []


async def extract_conclusions(answer_text: str, bb: Optional[Blackboard] = None) -> list[str]:
    try:
        plain = answer_text
        try:
            parsed = json.loads(answer_text)
            if isinstance(parsed, dict) and parsed.get("sentences"):
                plain = " ".join(
                    str(s.get("text", "")) for s in parsed["sentences"] if isinstance(s, dict)
                )
        except (json.JSONDecodeError, TypeError, KeyError):
            pass

        model = MODEL_REGISTRY.get("gpt_4o_mini", MODEL_REGISTRY["claude_sonnet"])
        provider = str(model.get("provider", "openai"))
        response, inp, out = await call_llm(
            client=model["client"],
            provider=provider,
            model_id=model["model_id"],
            system_prompt=CONCLUSION_EXTRACTOR_PROMPT,
            user_prompt=f"Answer: {plain[:2000]}",
            temperature=0.1,
            max_tokens=250,
        )
        if bb is not None:
            bb.total_input_tokens += inp
            bb.total_output_tokens += out
        raw = _json_array_from_response(response)
        return [str(x).strip() for x in raw if str(x).strip()][:6]
    except Exception as e:
        logger.warning("Conclusion extraction failed: %s", e)
        return []


async def detect_contradictions(
    new_task: str,
    new_conclusions: list[str],
    past_tasks: list[dict[str, Any]],
    bb: Optional[Blackboard] = None,
) -> list[dict[str, Any]]:
    if not past_tasks or not new_conclusions:
        return []

    try:
        past_context: list[dict[str, Any]] = []
        for pt in past_tasks[:10]:
            conclusions_raw = pt.get("key_conclusions") or "[]"
            try:
                conclusions = json.loads(conclusions_raw) if isinstance(conclusions_raw, str) else conclusions_raw
            except json.JSONDecodeError:
                conclusions = []
            if not conclusions:
                continue
            past_context.append(
                {
                    "task_id": pt.get("task_id", ""),
                    "task": pt.get("task_text", ""),
                    "conclusions": conclusions,
                }
            )

        if not past_context:
            return []

        model = MODEL_REGISTRY["claude_sonnet"]
        user_prompt = f"""
New task: {new_task}
New conclusions: {json.dumps(new_conclusions)}

Past tasks and conclusions:
{json.dumps(past_context, indent=2)}

Detect any contradictions.
"""

        response, inp, out = await call_llm(
            client=model["client"],
            provider="claude",
            model_id=model["model_id"],
            system_prompt=CONTRADICTION_DETECTOR_PROMPT,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=800,
        )
        if bb is not None:
            bb.total_input_tokens += inp
            bb.total_output_tokens += out

        result = _json_object_from_response(response)
        if result and result.get("contradictions_found"):
            return list(result.get("contradictions") or [])
        return []

    except Exception as e:
        logger.warning("Contradiction detection failed: %s", e)
        return []


def _resolve_old_task_id(
    contradiction: dict[str, Any],
    past_dicts: list[dict[str, Any]],
) -> str:
    tid = str(contradiction.get("old_task_id") or "").strip()
    valid_ids = {str(p.get("task_id", "")) for p in past_dicts}
    if tid and tid in valid_ids:
        return tid
    old_task = str(contradiction.get("old_task") or "").strip().lower()
    for p in past_dicts:
        text = str(p.get("task_text", "")).strip().lower()
        if old_task and text and (old_task in text or text[:80] in old_task):
            return str(p.get("task_id", ""))
    return ""


async def save_task_to_memory(
    db: Session,
    user_id: int,
    task_id: str,
    task_text: str,
    final_answer: str,
    final_score: Optional[int],
    final_confidence: Optional[float],
    sources_used: list[str],
    stages_run: list[str],
    insight_report: Optional[dict[str, Any]] = None,
    pipeline_contradictions: Optional[list[Any]] = None,
    intelligence_score: Optional[dict[str, Any]] = None,
    orchestration_id: Optional[str] = None,
    watchlist_item_id: Optional[str] = None,
    bb: Optional[Blackboard] = None,
) -> AgentTask:
    topics, conclusions = await asyncio.gather(
        extract_topics(task_text, bb),
        extract_conclusions(final_answer, bb),
    )

    past_tasks = (
        db.query(AgentTask)
        .filter(AgentTask.user_id == user_id, AgentTask.task_id != task_id)
        .order_by(AgentTask.created_at.desc())
        .limit(20)
        .all()
    )
    past_dicts = [
        {
            "task_id": t.task_id,
            "task_text": t.task_text,
            "key_conclusions": t.key_conclusions or "[]",
        }
        for t in past_tasks
    ]

    task_record = AgentTask(
        user_id=user_id,
        orchestration_id=orchestration_id,
        watchlist_item_id=watchlist_item_id,
        task_id=task_id,
        task_text=task_text,
        final_answer=final_answer,
        final_score=final_score,
        final_confidence=final_confidence,
        sources_used=json.dumps(sources_used),
        topics=json.dumps(topics),
        key_conclusions=json.dumps(conclusions),
        stages_run=json.dumps(stages_run),
        insight_report=insight_report,
        contradictions=pipeline_contradictions,
        intelligence_score=intelligence_score,
    )
    db.add(task_record)
    db.commit()
    db.refresh(task_record)

    contradictions: list[dict[str, Any]] = []
    try:
        contradictions = await detect_contradictions(
            new_task=task_text,
            new_conclusions=conclusions,
            past_tasks=past_dicts,
            bb=bb,
        )
    except Exception as e:
        logger.warning("Contradiction detection after save failed: %s", e)

    for c in contradictions:
        old_id = _resolve_old_task_id(c, past_dicts)
        row = AgentContradiction(
            user_id=user_id,
            new_task_id=task_id,
            old_task_id=old_id,
            contradiction_summary=str(c.get("summary") or "").strip() or "Possible contradiction with prior research.",
            severity=str(c.get("severity") or "moderate"),
        )
        db.add(row)

    if contradictions:
        try:
            db.commit()
            logger.info(
                "[MEMORY] Found %s contradictions for user %s",
                len(contradictions),
                user_id,
            )
        except Exception as e:
            db.rollback()
            logger.warning("Failed to persist contradictions: %s", e)

    logger.info("[MEMORY] Saved task %s for user %s topics=%s", task_id, user_id, topics)
    return task_record


def get_user_memory_context(
    db: Session,
    user_id: int,
    current_task: str = "",
    limit: int = 5,
) -> dict[str, Any]:
    _ = current_task
    total_tasks = (
        db.query(AgentTask).filter(AgentTask.user_id == user_id).count()
    )
    recent_tasks = (
        db.query(AgentTask)
        .filter(AgentTask.user_id == user_id)
        .order_by(AgentTask.created_at.desc())
        .limit(limit)
        .all()
    )

    all_topics: list[str] = []
    for task in recent_tasks:
        if task.topics:
            try:
                all_topics.extend(json.loads(task.topics))
            except (json.JSONDecodeError, TypeError):
                pass

    topic_counts: dict[str, int] = {}
    for topic in all_topics:
        topic_counts[topic] = topic_counts.get(topic, 0) + 1

    top_topics = sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    contradictions = (
        db.query(AgentContradiction)
        .filter(
            AgentContradiction.user_id == user_id,
            AgentContradiction.resolved.is_(False),
        )
        .order_by(AgentContradiction.created_at.desc())
        .limit(3)
        .all()
    )

    return {
        "task_count": total_tasks,
        "recent_tasks": [
            {
                "task": t.task_text[:100],
                "score": t.final_score,
                "created_at": t.created_at.isoformat() if t.created_at else "",
            }
            for t in recent_tasks
        ],
        "top_topics": [t[0] for t in top_topics],
        "unresolved_contradictions": [
            {"summary": c.contradiction_summary, "severity": c.severity}
            for c in contradictions
        ],
    }


def get_user_task_history(
    db: Session,
    user_id: int,
    page: int = 1,
    per_page: int = 20,
    retention_days: int = 30,
    search: str | None = None,
    feedback: str | None = None,
    orchestration_id: str | None = None,
    sort: str = "newest",
) -> dict[str, Any]:
    """Paginated agent-task history with optional filters and sort.

    Filters compose with AND semantics so callers can narrow by feedback
    status AND orchestration chain in one request. Search is case-insensitive
    substring match across title and task_text — the two fields a user
    actually types into, so we hit the columns they'd visually scan.

    Sort modes:
      - ``newest`` (default): created_at desc — what users expect first
      - ``oldest``: created_at asc — useful for replaying a research session
      - ``score``: final_score desc nulls last — "show me my best answers"
      - ``confidence``: final_confidence desc nulls last

    All filters are no-ops when None, so the existing call sites (and any
    callers that don't yet know about these options) keep working unchanged.
    """
    offset = (page - 1) * per_page

    cutoff = datetime.utcnow() - timedelta(days=max(0, retention_days))
    q = db.query(AgentTask).filter(
        AgentTask.user_id == user_id,
        AgentTask.created_at >= cutoff,
    )

    if search:
        # ``like`` is portable across SQLite + Postgres without leaning on
        # ILIKE or full-text extensions. The pattern is short-circuited by
        # ``_escape_like`` to keep "%" and "_" in user input from acting as
        # wildcards — otherwise a query for "100% effort" would match every
        # task. Bound the length so a 100KB payload can't pin the DB on a
        # single LIKE scan.
        from arena.core.input_validation import sanitize_model_optional_text

        safe = sanitize_model_optional_text(
            search, max_length=100, field_name="search"
        )
        if safe:
            escaped = _escape_like(safe)
            pattern = f"%{escaped}%"
            q = q.filter(
                or_(
                    AgentTask.title.ilike(pattern, escape="\\"),
                    AgentTask.task_text.ilike(pattern, escape="\\"),
                )
            )

    if feedback:
        # Normalize to known values — anything else would always return zero
        # results and silently confuse the UI. Empty string ("no feedback yet")
        # is distinct from a positive rating, so we keep it as-is rather than
        # coercing to None.
        if feedback in ("positive", "negative"):
            q = q.filter(AgentTask.user_feedback == feedback)
        elif feedback == "none":
            q = q.filter(
                or_(AgentTask.user_feedback.is_(None), AgentTask.user_feedback == "")
            )

    if orchestration_id:
        q = q.filter(AgentTask.orchestration_id == orchestration_id)

    # Sort. ``score`` and ``confidence`` put nulls last so a task that's
    # still mid-pipeline doesn't sink the top of the list — the user is
    # asking for their best answers, not their emptiest records.
    if sort == "oldest":
        order_clauses = (AgentTask.created_at.asc(),)
    elif sort == "score":
        order_clauses = (
            AgentTask.final_score.desc().nullslast(),
            AgentTask.created_at.desc(),
        )
    elif sort == "confidence":
        order_clauses = (
            AgentTask.final_confidence.desc().nullslast(),
            AgentTask.created_at.desc(),
        )
    else:
        # Unknown sort values fall back to newest rather than 400 — this is
        # a UI surface and a stale frontend shouldn't break the endpoint.
        order_clauses = (AgentTask.created_at.desc(),)

    total = q.count()
    tasks = (
        q.order_by(*order_clauses)
        .offset(offset)
        .limit(per_page)
        .all()
    )

    return {
        "tasks": [
            {
                "task_id": t.task_id,
                "title": t.title,
                "task_text": t.task_text,
                "final_score": t.final_score,
                "final_confidence": t.final_confidence,
                "topics": json.loads(t.topics or "[]"),
                "user_feedback": t.user_feedback,
                "created_at": t.created_at.isoformat() if t.created_at else "",
                "is_live": bool(getattr(t, "is_live", False)),
                "orchestration_id": getattr(t, "orchestration_id", None),
                "watchlist_item_id": getattr(t, "watchlist_item_id", None),
            }
            for t in tasks
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page if per_page else 0,
        "filters": {
            "search": search,
            "feedback": feedback,
            "orchestration_id": orchestration_id,
            "sort": sort,
        },
    }


def _escape_like(value: str) -> str:
    """Escape SQL LIKE wildcards in user-provided search terms.

    ``%`` and ``_`` are SQL LIKE wildcards; without escaping, a user typing
    ``100%`` would match every row. The escape character is backslash, which
    matches the ``escape="\\\\"`` argument we pass to ilike above.
    """
    return (
        value.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


def get_watchlist_history(
    db: Session,
    user_id: int,
    watchlist_item_id: str,
    limit: int = 50,
) -> dict[str, Any]:
    """All spawned runs of a single watchlist item, newest first, with aggregate stats.

    Returns a dict shaped for the Watchlist history surface:
      - items: list of {task_id, title, final_score, final_confidence,
        created_at, user_feedback} newest first
      - stats: {count, avg_score, min_score, max_score, scored_count}
    The stats ignore unscored rows for min/avg/max but report the
    total run count separately so the UI can say \"3 runs, 2 scored\".
    """
    cap = max(1, min(int(limit), 200))
    rows = (
        db.query(AgentTask)
        .filter(
            AgentTask.user_id == user_id,
            AgentTask.watchlist_item_id == watchlist_item_id,
        )
        .order_by(AgentTask.created_at.desc())
        .limit(cap)
        .all()
    )

    items = [
        {
            "task_id": t.task_id,
            "title": t.title,
            "final_score": t.final_score,
            "final_confidence": t.final_confidence,
            "user_feedback": t.user_feedback,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in rows
    ]

    scored = [t.final_score for t in rows if isinstance(t.final_score, (int, float))]
    stats = {
        "count": len(rows),
        "scored_count": len(scored),
        "avg_score": round(sum(scored) / len(scored), 1) if scored else None,
        "min_score": min(scored) if scored else None,
        "max_score": max(scored) if scored else None,
    }

    return {"items": items, "stats": stats}
