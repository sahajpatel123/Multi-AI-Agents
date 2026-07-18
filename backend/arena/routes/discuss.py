"""Discuss route — 1-on-1 private conversation with a single agent"""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from arena.core.dependencies import get_current_user_required
from arena.core.datetime_utils import utcnow_naive
from arena.core.cost_tracker import (
    RateLimitExceeded,
    check_and_increment_user,
)
from arena.core.input_validation import sanitize_model_text
from arena.core.rate_limits import enforce_user_rate_limit
from arena.core.tier_config import get_tier_str, has_feature, normalize_tier
from arena.database import get_db
from arena.db_models import DiscussThread
from arena.models.schemas import (
    DiscussRequest,
    DiscussResponse,
    DiscussChatMessage,
    ErrorResponse,
    RateLimitError,
    UserResponse,
)
from arena.core.agents import get_agent_config, get_persona_id_for_agent, get_raw_persona_prompt, call_persona, get_model_for_persona
from arena.core.memory import get_memory_manager
from arena.core.model_router import get_route_for_persona


router = APIRouter(prefix="/api", tags=["discuss"])


def _enforce_discuss_access(user: UserResponse) -> str:
    user_tier = normalize_tier(get_tier_str(user))
    if not has_feature(user_tier, "discuss"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_allowed",
                "message": "Focused chat requires a Plus or Pro subscription.",
                "upgrade_required": "plus",
            },
        )
    return user_tier.value


# ──────────────────────────────────────────────────────────────
# Discussion system prompt — agent stays in character with
# full memory of original verdict and conversation context
# ──────────────────────────────────────────────────────────────

DISCUSS_SYSTEM_PROMPT = """You are {agent_name}, continuing a private conversation with the user.

YOUR PERSONALITY (stay in character at all times):
{personality_excerpt}

CONTEXT:
The user originally asked: "{original_prompt}"
Your original verdict on that question was:
"{original_verdict}"

{previous_responses_context}

RULES:
- Stay in character throughout the conversation.
- You remember your original verdict and reasoning.
- IMPORTANT: Never contradict your previous statements. Stay consistent with what you've said before.
- Be conversational — this is a 1-on-1 chat, not an essay.
- Respond naturally. Keep replies focused and moderate length.
- If the user challenges your position, defend it or thoughtfully concede.
- If the user asks about something new, respond in character but note the pivot.
- Do NOT use JSON formatting. Respond with plain text only."""


def _get_persona_excerpt(agent_id: str, persona_ids: list[str] | None = None) -> str:
    """Return the raw persona prompt so discuss mode keeps the same identity."""
    return get_raw_persona_prompt(get_persona_id_for_agent(agent_id, persona_ids))


def _build_messages(
    request: DiscussRequest,
) -> list[dict]:
    """Build the Anthropic messages array from conversation history + new message."""
    messages: list[dict] = []

    for msg in request.conversation_history:
        role = "user" if msg.role == "user" else "assistant"
        messages.append({"role": role, "content": msg.content})

    # Add the new user message
    messages.append({"role": "user", "content": request.message})

    return messages


# ──────────────────────────────────────────────────────────────
# POST /api/discuss — batch endpoint
# ──────────────────────────────────────────────────────────────

@router.post(
    "/discuss",
    response_model=DiscussResponse,
    responses={
        400: {"model": ErrorResponse},
        429: {"model": RateLimitError},
        500: {"model": ErrorResponse},
    },
)
async def discuss_with_agent(
    http_request: Request,
    request: DiscussRequest,
    db: Session = Depends(get_db),
    user: UserResponse = Depends(get_current_user_required),
) -> DiscussResponse:
    """
    Send a message to a single agent in a 1-on-1 conversation.
    The agent stays in character with full memory of the thread.
    """
    user_tier = _enforce_discuss_access(user)

    # Check rate limit BEFORE any LLM calls
    try:
        check_and_increment_user(db, user.id, user_tier)
    except RateLimitExceeded as e:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limit_exceeded",
                "message": e.message,
                "tier": e.tier,
                "prompts_used": e.used,
                "daily_limit": e.limit,
            },
        )

    try:
        agent = get_agent_config(request.agent_id, request.persona_ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid agent configuration") from e
    if not agent:
        raise HTTPException(status_code=400, detail="Invalid agent ID")

    session_id = request.session_id or str(uuid.uuid4())

    # Get agent's previous responses from memory (ownership-scoped)
    memory = get_memory_manager()
    previous_responses = memory.short_term.get_agent_memory(
        session_id, request.agent_id, user_id=str(user.id)
    )
    
    # Build context string for previous responses
    if previous_responses:
        prev_context = "YOUR PREVIOUS RESPONSES IN THIS SESSION:\n"
        for i, resp in enumerate(previous_responses[-3:], 1):  # Last 3 responses
            prev_context += f"{i}. {resp[:200]}...\n" if len(resp) > 200 else f"{i}. {resp}\n"
        prev_context += "\nRemember to stay consistent with these positions."
    else:
        prev_context = ""

    system_prompt = DISCUSS_SYSTEM_PROMPT.format(
        agent_name=agent.name,
        personality_excerpt=_get_persona_excerpt(request.agent_id, request.persona_ids),
        original_prompt=request.original_prompt,
        original_verdict=request.original_verdict,
        previous_responses_context=prev_context,
    )
    messages = _build_messages(request)

    try:
        # Get persona_id and route to appropriate API
        persona_id = get_persona_id_for_agent(request.agent_id, request.persona_ids)
        
        # Build single user message from conversation history
        conversation_text = "\n\n".join(
            f"{msg.role.upper()}: {msg.content}" for msg in request.conversation_history
        )
        full_user_message = f"{conversation_text}\n\nUSER: {request.message}" if conversation_text else request.message
        
        reply_content, _, _ = await call_persona(
            persona_id=persona_id,
            system_prompt=system_prompt,
            user_prompt=full_user_message,
            temperature=agent.temperature
        )
        reply = reply_content.strip()

        # Build updated history
        new_history = list(request.conversation_history)
        new_history.append(DiscussChatMessage(role="user", content=request.message))
        new_history.append(DiscussChatMessage(role="agent", content=reply))

        return DiscussResponse(
            agent_id=request.agent_id,
            content=reply,
            conversation_history=new_history,
            session_id=session_id,
        )

    except Exception:
        raise HTTPException(status_code=500, detail="Discuss request failed")


# ──────────────────────────────────────────────────────────────
# POST /api/discuss/stream — SSE streaming endpoint
# ──────────────────────────────────────────────────────────────

@router.post("/discuss/stream")
async def stream_discuss(
    http_request: Request,
    request: DiscussRequest,
    db: Session = Depends(get_db),
    user: UserResponse = Depends(get_current_user_required),
):
    """
    SSE streaming 1-on-1 discussion — streams the agent's reply token by token.

    Event types:
    - "token"  → a token from the agent
    - "result" → final DiscussResponse with updated history
    - "error"  → something went wrong
    """
    user_tier = _enforce_discuss_access(user)

    # Check rate limit BEFORE any LLM calls
    try:
        check_and_increment_user(db, user.id, user_tier)
    except RateLimitExceeded as e:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limit_exceeded",
                "message": e.message,
                "tier": e.tier,
                "prompts_used": e.used,
                "daily_limit": e.limit,
            },
        )

    try:
        agent = get_agent_config(request.agent_id, request.persona_ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid agent configuration") from e
    if not agent:
        raise HTTPException(status_code=400, detail="Invalid agent ID")

    session_id = request.session_id or str(uuid.uuid4())

    # Get agent's previous responses from memory (ownership-scoped)
    memory = get_memory_manager()
    previous_responses = memory.short_term.get_agent_memory(
        session_id, request.agent_id, user_id=str(user.id)
    )
    
    # Build context string for previous responses
    if previous_responses:
        prev_context = "YOUR PREVIOUS RESPONSES IN THIS SESSION:\n"
        for i, resp in enumerate(previous_responses[-3:], 1):  # Last 3 responses
            prev_context += f"{i}. {resp[:200]}...\n" if len(resp) > 200 else f"{i}. {resp}\n"
        prev_context += "\nRemember to stay consistent with these positions."
    else:
        prev_context = ""

    system_prompt = DISCUSS_SYSTEM_PROMPT.format(
        agent_name=agent.name,
        personality_excerpt=_get_persona_excerpt(request.agent_id, request.persona_ids),
        original_prompt=request.original_prompt,
        original_verdict=request.original_verdict,
        previous_responses_context=prev_context,
    )
    messages = _build_messages(request)

    async def event_generator():
        full_text = ""
        try:
            # Get persona_id and check if it uses Grok
            persona_id = get_persona_id_for_agent(request.agent_id, request.persona_ids)
            model_type = get_model_for_persona(persona_id)
            route = get_route_for_persona(persona_id)
            
            if model_type != "claude":
                # Grok doesn't support streaming - get full response
                conversation_text = "\n\n".join(
                    f"{msg.role.upper()}: {msg.content}" for msg in request.conversation_history
                )
                full_user_message = f"{conversation_text}\n\nUSER: {request.message}" if conversation_text else request.message
                
                content, _, _ = await call_persona(
                    persona_id=persona_id,
                    system_prompt=system_prompt,
                    user_prompt=full_user_message,
                    temperature=agent.temperature
                )
                full_text = content
                # Emit as single token
                yield _sse_event("token", {
                    "agent_id": request.agent_id,
                    "token": content,
                })
            else:
                # Claude supports streaming
                async with route["client"].messages.stream(
                    model=route["model_id"],
                    max_tokens=route["max_tokens"],
                    temperature=agent.temperature,
                    system=system_prompt,
                    messages=messages,
                ) as active_stream:
                    async for text in active_stream.text_stream:
                        full_text += text
                        yield _sse_event("token", {
                            "agent_id": request.agent_id,
                            "token": text,
                        })

            # Build final response
            reply = full_text.strip()
            new_history = list(request.conversation_history)
            new_history.append(DiscussChatMessage(role="user", content=request.message))
            new_history.append(DiscussChatMessage(role="agent", content=reply))

            final = DiscussResponse(
                agent_id=request.agent_id,
                content=reply,
                conversation_history=new_history,
                session_id=session_id,
            )

            yield _sse_event("result", final.model_dump(mode="json"))

        except GeneratorExit:
            # Client disconnected mid-stream — the async context manager
            # handles stream cleanup via __aexit__ on generator close.
            # Swallow silently — no error event needed for a disconnected client.
            return
        except Exception as e:
            yield _sse_event("error", {"detail": "Discuss request failed"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sse_event(event: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ──────────────────────────────────────────────────────────────
# Discuss history persistence — list / fetch / delete threads
# ──────────────────────────────────────────────────────────────

DISCUSS_THREADS_MAX_PER_PAGE = 50


def _decode_messages(raw) -> list:
    """Normalize the messages column across drivers.

    Postgres returns JSON columns as native lists; SQLite (test) returns
    the raw TEXT. Without this normalization, len() / list() would return
    the string length / the string itself, and the response shape would
    differ between environments.
    """
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except (json.JSONDecodeError, TypeError):
            return []
    return []


def _serialize_thread(row: DiscussThread, *, include_messages: bool) -> dict:
    """Project a DiscussThread row to its public dict.

    List rows strip the messages array (potentially large JSON) so the
    list payload stays small; detail responses include the full
    conversation so a returning user can resume the thread.
    """
    messages = _decode_messages(row.messages)
    base = {
        "id": row.id,
        "agent_id": row.agent_id,
        "title": row.title or "",
        "last_message_at": row.last_message_at.isoformat() if row.last_message_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "message_count": len(messages),
    }
    if include_messages:
        base["messages"] = messages
        base["original_prompt"] = row.original_prompt or ""
        base["original_verdict"] = row.original_verdict or ""
    return base


@router.get("/discuss/threads")
async def list_discuss_threads(
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=DISCUSS_THREADS_MAX_PER_PAGE),
    agent_id: Optional[str] = Query(
        None, max_length=20, description="Filter to one agent (e.g. 'claude-sonnet').",
    ),
    search: Optional[str] = Query(
        None, max_length=128, description="Case-insensitive substring match on title.",
    ),
) -> dict:
    """List the caller's 1-on-1 discuss threads.

    Free-tier users see an empty list (the discuss feature itself is
    Plus-only, so a free user has never had a thread to retrieve). This
    keeps the silent-gate contract consistent with the other
    feature-gated endpoints.
    """
    tier = normalize_tier(get_tier_str(user))
    if not has_feature(tier, "discuss"):
        return {
            "threads": [],
            "total": 0,
            "page": 1,
            "per_page": per_page,
            "total_pages": 0,
            "filters": {"agent_id": None, "search": None},
        }

    q = db.query(DiscussThread).filter(DiscussThread.user_id == user.id)

    if agent_id:
        q = q.filter(DiscussThread.agent_id == agent_id)

    if search:
        # Escape LIKE wildcards so '100%' matches the literal substring.
        safe = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        q = q.filter(DiscussThread.title.ilike(f"%{safe}%", escape="\\"))

    total = q.count()
    rows = (
        q.order_by(DiscussThread.last_message_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "threads": [_serialize_thread(r, include_messages=False) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page if per_page else 0,
        "filters": {"agent_id": agent_id, "search": search},
    }


@router.get("/discuss/threads/{thread_id}")
async def get_discuss_thread(
    thread_id: int,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Full thread body (messages + original_prompt/verdict for context).

    Foreign-or-missing ids return 404 with the same shape (no oracle).
    """
    row = (
        db.query(DiscussThread)
        .filter(DiscussThread.id == thread_id, DiscussThread.user_id == user.id)
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Thread not found"},
        )
    return _serialize_thread(row, include_messages=True)


@router.delete("/discuss/threads/{thread_id}")
async def delete_discuss_thread(
    thread_id: int,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Delete one thread. Rate-limited so a UI bug can't mass-delete a
    user's history. Foreign ids return 404 — no existence oracle."""
    enforce_user_rate_limit(
        user.id,
        scope="discuss_thread_delete",
        limit=60,
        window_seconds=3600,
        message="Too many thread deletes. Limit is 60 per hour.",
    )
    row = (
        db.query(DiscussThread)
        .filter(DiscussThread.id == thread_id, DiscussThread.user_id == user.id)
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Thread not found"},
        )
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": thread_id}


class SaveThreadBody(BaseModel):
    """Body for POST /discuss/threads — save a conversation. The streaming
    endpoint keeps the full conversation in the request, so saving is
    opt-in: the UI fires this when the user clicks 'Save thread'."""
    agent_id: str = Field(..., min_length=1, max_length=20)
    title: str = Field("", max_length=255)
    messages: list[dict] = Field(default_factory=list, max_length=500)
    original_prompt: str = Field("", max_length=10000)
    original_verdict: str = Field("", max_length=20000)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        return sanitize_model_text(v or "", max_length=255, field_name="title")

    @field_validator("messages")
    @classmethod
    def validate_messages(cls, v: list[dict]) -> list[dict]:
        # Cap each message's content so a 100KB blob can't slip in via
        # a single field. Bounded list length prevents an unbounded
        # JSON column.
        out: list[dict] = []
        for m in v[:500]:
            if not isinstance(m, dict):
                continue
            role = str(m.get("role", ""))[:20]
            content = str(m.get("content", ""))[:20000]
            out.append({"role": role, "content": content, "timestamp": m.get("timestamp")})
        return out


@router.post("/discuss/threads")
async def save_discuss_thread(
    body: SaveThreadBody,
    user: UserResponse = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> dict:
    """Persist a 1-on-1 conversation. Used by the UI's 'Save thread'
    button on the discuss screen — the streaming endpoint keeps the
    conversation in-process, this is the durable record."""
    tier = normalize_tier(get_tier_str(user))
    if not has_feature(tier, "discuss"):
        raise HTTPException(
            status_code=403,
            detail={"error": "feature_not_allowed", "message": "Discuss requires a Plus or Pro subscription."},
        )
    enforce_user_rate_limit(
        user.id,
        scope="discuss_thread_save",
        limit=120,
        window_seconds=3600,
        message="Too many thread saves. Limit is 120 per hour.",
    )

    now = utcnow_naive()
    row = DiscussThread(
        user_id=user.id,
        agent_id=body.agent_id.strip(),
        title=body.title.strip() or None,
        messages=body.messages,
        original_prompt=body.original_prompt or None,
        original_verdict=body.original_verdict or None,
        last_message_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "saved", "id": row.id, "thread": _serialize_thread(row, include_messages=True)}
