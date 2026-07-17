"""Persona Integrity Engine — drift guard + overlap filter"""

from difflib import SequenceMatcher
from collections import defaultdict
from sqlalchemy.orm import Session

from arena.core.agents import get_persona_id_for_agent
from arena.core.observability import log_drift_result
from arena.models.schemas import AgentResponse, IntegrityReport


# ──────────────────────────────────────────────────────────────
# Drift Guard
# ──────────────────────────────────────────────────────────────
# Detects if an agent's response is too similar to its own
# previous responses in the session. Agents should not repeat
# themselves across turns.

# In-memory session history (will move to Redis in Week 4+)
_session_history: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))

MAX_HISTORY_PER_AGENT = 10
DRIFT_THRESHOLD = 0.6  # similarity above this = drifting/repeating


def _text_similarity(a: str, b: str) -> float:
    """Compute normalized similarity between two strings (0.0-1.0)."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def compute_drift_score(
    agent_id: str, verdict: str, session_id: str
) -> float:
    """
    Compute how much an agent is repeating itself within a session.
    Returns 0.0 (no drift) to 1.0 (high drift / near-duplicate).
    """
    history = _session_history[session_id][agent_id]

    if not history:
        return 0.0

    # Compare against all previous verdicts, take the max similarity
    max_sim = 0.0
    for prev in history:
        sim = _text_similarity(verdict, prev)
        max_sim = max(max_sim, sim)

    return round(max_sim, 3)


def record_response(agent_id: str, verdict: str, session_id: str) -> None:
    """Record a response in session history for future drift checks."""
    history = _session_history[session_id][agent_id]
    history.append(verdict)
    # Cap history length
    if len(history) > MAX_HISTORY_PER_AGENT:
        _session_history[session_id][agent_id] = history[-MAX_HISTORY_PER_AGENT:]


def clear_session_history(session_id: str) -> None:
    """Clear all history for a session."""
    _session_history.pop(session_id, None)


# ──────────────────────────────────────────────────────────────
# Overlap Filter
# ──────────────────────────────────────────────────────────────
# Detects if two agents are saying essentially the same thing.
# If overlap is too high, the scorer should penalize.

OVERLAP_THRESHOLD = 0.55  # similarity above this = significant overlap


def compute_pairwise_overlap(
    responses: list[AgentResponse],
) -> list[dict]:
    """
    Compare all pairs of agent responses for content overlap.
    Returns list of overlap records for pairs above threshold.
    """
    overlaps: list[dict] = []

    for i in range(len(responses)):
        for j in range(i + 1, len(responses)):
            sim = _text_similarity(
                responses[i].verdict, responses[j].verdict
            )
            if sim >= OVERLAP_THRESHOLD:
                overlaps.append({
                    "agent_a": responses[i].agent_id,
                    "agent_b": responses[j].agent_id,
                    "similarity": round(sim, 3),
                })

    return overlaps


# ──────────────────────────────────────────────────────────────
# Main entry point
# ──────────────────────────────────────────────────────────────

async def check_integrity(
    responses: list[AgentResponse],
    session_id: str,
    prompt: str | None = None,
    user_id: int | None = None,
    persona_ids: list[str] | None = None,
    db: Session | None = None,
) -> IntegrityReport:
    """
    Run both drift guard and overlap filter on a set of agent responses.
    Returns an IntegrityReport with scores and flags.
    """
    drift_scores: dict[str, float] = {}
    flags: list[str] = []

    # Drift guard — per agent
    for resp in responses:
        drift = compute_drift_score(resp.agent_id, resp.verdict, session_id)
        drift_scores[resp.agent_id] = drift

        if drift >= DRIFT_THRESHOLD:
            flags.append(
                f"{resp.agent_id} is repeating itself (drift={drift:.2f})"
            )

    # Overlap filter — pairwise
    overlap_pairs = compute_pairwise_overlap(responses)
    overlap_map: dict[str, float] = {}
    for pair in overlap_pairs:
        overlap_map[pair["agent_a"]] = max(overlap_map.get(pair["agent_a"], 0.0), pair["similarity"])
        overlap_map[pair["agent_b"]] = max(overlap_map.get(pair["agent_b"], 0.0), pair["similarity"])
        flags.append(
            f"{pair['agent_a']} and {pair['agent_b']} have high overlap "
            f"(similarity={pair['similarity']:.2f})"
        )

    if db is not None and prompt is not None:
        for resp in responses:
            try:
                persona_id = get_persona_id_for_agent(resp.agent_id, persona_ids)
                overlap_score = overlap_map.get(resp.agent_id)
                await log_drift_result(
                    session_id=session_id,
                    user_id=user_id,
                    persona_id=persona_id,
                    agent_id=resp.agent_id,
                    prompt_snippet=prompt[:200],
                    drift_detected=drift_scores.get(resp.agent_id, 0.0) >= DRIFT_THRESHOLD,
                    overlap_detected=overlap_score is not None,
                    overlap_score=overlap_score,
                    reprompt_triggered=False,
                    reprompt_success=None,
                    original_response_snippet=resp.verdict[:300],
                    final_response_snippet=None,
                    db=db,
                )
            except Exception:
                pass

    # Record responses for future drift detection
    for resp in responses:
        record_response(resp.agent_id, resp.verdict, session_id)

    return IntegrityReport(
        drift_scores=drift_scores,
        overlap_pairs=overlap_pairs,
        flags=flags,
    )
