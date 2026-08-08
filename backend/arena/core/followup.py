"""Follow-up round context helpers.

A follow-up round asks the full four-persona panel a new question while
giving every persona the previous round's prompt and answers as context.
The context is formatted once in the route and injected into each persona's
system prompt so all four minds answer the *new* question with continuity.
"""

from typing import Any, Sequence

# API contract caps (mirrored in the Pydantic schema). These keep a single
# follow-up cheap enough for a lightweight model and prevent a hostile client
# from amplifying the cost of every agent call with megabytes of context.
FOLLOW_UP_MAX_ITEMS = 8
FOLLOW_UP_MAX_ITEM_CHARS = 1800
FOLLOW_UP_MAX_TOTAL_CHARS = 12000

FOLLOW_UP_HEADER = (
    "--- PREVIOUS ROUND (context only — answer the NEW question below) ---"
)


def _item_label(item: Any) -> str:
    """Human-readable speaker label for one context item."""
    if getattr(item, "role", None) == "assistant":
        name = (getattr(item, "name", None) or "").strip()
        agent_id = (getattr(item, "agent_id", None) or "").strip()
        if name and agent_id:
            return f"{name} ({agent_id})"
        return name or agent_id or "Assistant"
    return "User"


def format_follow_up_context(items: Sequence[Any] | None) -> str | None:
    """Build a compact transcript block from prior-round items.

    Returns None when there is nothing usable so callers can skip context
    injection entirely. Per-item lengths are truncated defensively and tail
    items are dropped once the total budget is exhausted — the Pydantic API
    contract already caps lengths, so this is belt-and-braces for callers
    that bypass validation.
    """
    if not items:
        return None
    blocks: list[str] = []
    total = 0
    for item in items:
        content = (getattr(item, "content", None) or "").strip()
        if not content:
            continue
        content = content[:FOLLOW_UP_MAX_ITEM_CHARS]
        block = f"{_item_label(item)}: {content}"
        block_cost = len(block)
        if total + block_cost > FOLLOW_UP_MAX_TOTAL_CHARS:
            break
        blocks.append(block)
        total += block_cost
    if not blocks:
        return None
    return f"{FOLLOW_UP_HEADER}\n" + "\n\n".join(blocks)
