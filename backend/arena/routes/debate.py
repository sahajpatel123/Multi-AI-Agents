"""Debate route — challenge an agent, others react"""

import asyncio
import json
import uuid
from typing import Optional

import anthropic

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.core.auth import get_current_user_optional
from arena.core.cost_tracker import (
    RateLimitExceeded,
    check_and_increment_guest,
    check_and_increment_user,
)
from arena.core.tier_config import has_feature, normalize_tier
from arena.database import get_db
from arena.models.schemas import (
    DebateRequest,
    DebateReaction,
    DebateMessage,
    DebateRoundResponse,
    ErrorResponse,
    RateLimitError,
    UserResponse,
)
from arena.core.agents import (
    get_agent_config,
    get_all_agents,
    get_persona_id_for_agent,
    get_raw_persona_prompt,
    call_persona,
    get_model_for_persona,
)
from arena.core.model_router import get_route_for_persona


router = APIRouter(prefix="/api", tags=["debate"])


def _enforce_debate_access(user: Optional[UserResponse]) -> str:
    user_tier = normalize_tier(user.tier if user else "GUEST")
    if not has_feature(user_tier, "debate"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_not_allowed",
                "message": "Debate mode requires a Plus or Pro subscription.",
                "upgrade_required": "plus",
            },
        )
    return user_tier.value


# ──────────────────────────────────────────────────────────────
# Debate system prompt — keeps reactions short and reactive
# ──────────────────────────────────────────────────────────────

DEBATE_REACTION_PROMPT = """You are {agent_name}, reacting to another agent's position in a live debate.

YOUR PERSONALITY (stay in character):
{personality_excerpt}

RULES:
- Keep your reaction to 2-3 sentences MAX. This is a live debate, not an essay.
- Be direct and reactive — respond to what was actually said.
- State your stance clearly: do you agree, disagree, or partially agree?
- If there's debate history, reference specific points others made.
- Stay in character. Your tone and values should come through.

Respond with ONLY valid JSON:
{{"content": "your 2-3 sentence reaction", "stance": "agree|disagree|partially agree"}}"""


def _get_persona_excerpt(agent_id: str, persona_ids: list[str] | None = None) -> str:
    """Pull the raw persona sections used to keep debate voice consistent."""
    return get_raw_persona_prompt(get_persona_id_for_agent(agent_id, persona_ids))


def _build_debate_context(
    request: DebateRequest,
    reacting_agent_id: str,
) -> str:
    """Build the user message for a reacting agent."""
    parts = [
        f"ORIGINAL QUESTION: {request.original_prompt}",
        "",
        f"CHALLENGED AGENT'S POSITION:",
        f"{request.challenged_verdict}",
    ]

    # Add debate history if rounds > 1
    if request.debate_history:
        parts.append("")
        parts.append("DEBATE SO FAR:")
        for msg in request.debate_history:
            speaker_config = get_agent_config(msg.agent_id, request.persona_ids)
            speaker = speaker_config.name if speaker_config else "User"
            parts.append(f"  [{speaker}]: {msg.content}")

    # Add user interjection if present
    if request.user_interjection:
        parts.append("")
        parts.append(f"USER JUST SAID: {request.user_interjection}")
        parts.append("(Address the user's point in your reaction)")

    parts.append("")
    parts.append("Give your reaction now.")

    return "\n".join(parts)


def _parse_json_from_llm(content: str) -> dict:
    """Extract JSON from LLM response, handling code blocks."""
    content = content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
        content = content.strip()
    return json.loads(content)


async def _get_reaction(
    agent_id: str,
    request: DebateRequest,
) -> DebateReaction:
    """Get a single agent's debate reaction."""
    agent = get_agent_config(agent_id, request.persona_ids)
    if not agent:
        raise ValueError(f"Unknown agent id: {agent_id}")
    system_prompt = DEBATE_REACTION_PROMPT.format(
        agent_name=agent.name,
        personality_excerpt=_get_persona_excerpt(agent_id, request.persona_ids),
    )
    user_message = _build_debate_context(request, agent_id)

    try:
        # Get persona_id and route to appropriate API
        persona_id = get_persona_id_for_agent(agent_id, request.persona_ids)
        content = await call_persona(
            persona_id=persona_id,
            system_prompt=system_prompt,
            user_prompt=user_message,
            temperature=agent.temperature
        )
        data = _parse_json_from_llm(content)
        return DebateReaction(
            agent_id=agent_id,
            agent_number=agent.agent_number,
            content=data.get("content", "No reaction."),
            stance=data.get("stance", "disagree"),
        )
    except Exception as e:
        return DebateReaction(
            agent_id=agent_id,
            agent_number=agent.agent_number,
            content=f"[Failed to react: {e}]",
            stance="disagree",
        )


# ──────────────────────────────────────────────────────────────
# POST /api/debate — batch endpoint
# ──────────────────────────────────────────────────────────────

def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post(
    "/debate",
    response_model=DebateRoundResponse,
    responses={
        400: {"model": ErrorResponse},
        429: {"model": RateLimitError},
        500: {"model": ErrorResponse},
    },
)
async def run_debate_round(
    http_request: Request,
    request: DebateRequest,
    db: Session = Depends(get_db),
    user: Optional[UserResponse] = Depends(get_current_user_optional),
) -> DebateRoundResponse:
    """
    Run one round of debate. The 3 non-challenged agents react
    to the challenged agent's verdict in parallel.
    """
    user_tier = _enforce_debate_access(user)

    # Check rate limit BEFORE any LLM calls
    if not has_feature(user_tier, "unlimited_debates"):
        try:
            if user:
                check_and_increment_user(db, user.id, user_tier)
            else:
                ip = _get_client_ip(http_request)
                check_and_increment_guest(db, ip)
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
        active_agents = get_all_agents(request.persona_ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    active_agent_map = {agent.agent_id: agent for agent in active_agents}

    if request.challenged_agent_id not in active_agent_map:
        raise HTTPException(status_code=400, detail="Invalid challenged agent ID")

    if request.round_number > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 debate rounds")

    session_id = request.session_id or str(uuid.uuid4())

    # The 3 agents that are NOT the challenged one
    reacting_ids = [agent.agent_id for agent in active_agents if agent.agent_id != request.challenged_agent_id]

    try:
        # Run all 3 reactions in parallel
        tasks = [
            _get_reaction(aid, request)
            for aid in reacting_ids
        ]
        reactions = await asyncio.gather(*tasks)

        # Build updated debate history
        new_history = list(request.debate_history)

        # Add user interjection to history if present
        if request.user_interjection:
            new_history.append(DebateMessage(
                agent_id="user",
                content=request.user_interjection,
                round_number=request.round_number,
            ))

        # Add each reaction to history
        for reaction in reactions:
            new_history.append(DebateMessage(
                agent_id=reaction.agent_id,
                content=reaction.content,
                round_number=request.round_number,
            ))

        return DebateRoundResponse(
            round_number=request.round_number,
            challenged_agent_id=request.challenged_agent_id,
            reactions=list(reactions),
            debate_history=new_history,
            session_id=session_id,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────
# POST /api/debate/stream — SSE streaming endpoint
# ──────────────────────────────────────────────────────────────

@router.post("/debate/stream")
async def stream_debate_round(
    http_request: Request,
    request: DebateRequest,
    db: Session = Depends(get_db),
    user: Optional[UserResponse] = Depends(get_current_user_optional),
):
    """
    SSE streaming debate — streams each agent's reaction token by token.

    Event types:
    - "reaction_token" → token from a reacting agent
    - "reaction_done"  → an agent finished its reaction
    - "result"         → final DebateRoundResponse
    - "error"          → something went wrong
    """
    user_tier = _enforce_debate_access(user)

    # Check rate limit BEFORE any LLM calls
    if not has_feature(user_tier, "unlimited_debates"):
        try:
            if user:
                check_and_increment_user(db, user.id, user_tier)
            else:
                ip = _get_client_ip(http_request)
                check_and_increment_guest(db, ip)
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
        active_agents = get_all_agents(request.persona_ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    active_agent_map = {agent.agent_id: agent for agent in active_agents}

    if request.challenged_agent_id not in active_agent_map:
        raise HTTPException(status_code=400, detail="Invalid challenged agent ID")

    session_id = request.session_id or str(uuid.uuid4())

    reacting_ids = [agent.agent_id for agent in active_agents if agent.agent_id != request.challenged_agent_id]
    # Auth is resolved once, before the stream starts. Do not re-validate inside the generator.
    authenticated_user = user

    async def event_generator():
        try:
            _ = authenticated_user
            queue: asyncio.Queue = asyncio.Queue()
            full_texts: dict[str, str] = {}

            async def _stream_reaction(agent_id: str):
                agent = active_agent_map[agent_id]
                system_prompt = DEBATE_REACTION_PROMPT.format(
                    agent_name=agent.name,
                    personality_excerpt=_get_persona_excerpt(agent_id, request.persona_ids),
                )
                user_message = _build_debate_context(request, agent_id)
                full_text = ""

                try:
                    # Get persona_id and check if it uses Grok
                    persona_id = get_persona_id_for_agent(agent_id, request.persona_ids)
                    model_type = get_model_for_persona(persona_id)
                    route = get_route_for_persona(persona_id)
                    
                    if model_type != "claude":
                        # Grok doesn't support streaming - get full response
                        content = await call_persona(
                            persona_id=persona_id,
                            system_prompt=system_prompt,
                            user_prompt=user_message,
                            temperature=agent.temperature
                        )
                        full_text = content
                        # Emit as single token
                        await queue.put({
                            "type": "reaction_token",
                            "agent_id": agent_id,
                            "token": content,
                        })
                    else:
                        # Claude supports streaming
                        async with route["client"].messages.stream(
                            model=route["model_id"],
                            max_tokens=min(256, route["max_tokens"]),
                            temperature=agent.temperature,
                            system=system_prompt,
                            messages=[{"role": "user", "content": user_message}],
                        ) as stream:
                            async for text in stream.text_stream:
                                full_text += text
                                await queue.put({
                                    "type": "reaction_token",
                                    "agent_id": agent_id,
                                    "token": text,
                                })

                    full_texts[agent_id] = full_text
                    await queue.put({
                        "type": "reaction_done",
                        "agent_id": agent_id,
                    })
                except Exception as e:
                    full_texts[agent_id] = json.dumps({
                        "content": f"[Failed to react: {e}]",
                        "stance": "disagree",
                    })
                    await queue.put({
                        "type": "reaction_done",
                        "agent_id": agent_id,
                    })

            # Launch all 3 reactions in parallel
            async def _run_all():
                tasks = [
                    asyncio.create_task(_stream_reaction(aid))
                    for aid in reacting_ids
                ]
                await asyncio.gather(*tasks)
                await queue.put({"type": "all_done"})

            asyncio.create_task(_run_all())

            # Consume queue and yield SSE events
            while True:
                msg = await queue.get()
                event_type = msg["type"]

                if event_type == "reaction_token":
                    yield _sse_event("reaction_token", {
                        "agent_id": msg["agent_id"],
                        "token": msg["token"],
                    })
                elif event_type == "reaction_done":
                    yield _sse_event("reaction_done", {
                        "agent_id": msg["agent_id"],
                    })
                elif event_type == "all_done":
                    break

            # Parse all reactions and build final response
            reactions: list[DebateReaction] = []
            for agent_id in reacting_ids:
                agent = active_agent_map[agent_id]
                raw = full_texts.get(agent_id, '{"content":"No reaction.","stance":"disagree"}')
                try:
                    data = _parse_json_from_llm(raw)
                    reactions.append(DebateReaction(
                        agent_id=agent_id,
                        agent_number=agent.agent_number,
                        content=data.get("content", "No reaction."),
                        stance=data.get("stance", "disagree"),
                    ))
                except Exception:
                    reactions.append(DebateReaction(
                        agent_id=agent_id,
                        agent_number=agent.agent_number,
                        content=raw[:500],
                        stance="disagree",
                    ))

            # Build updated history
            new_history = list(request.debate_history)
            if request.user_interjection:
                new_history.append(DebateMessage(
                    agent_id="user",
                    content=request.user_interjection,
                    round_number=request.round_number,
                ))
            for reaction in reactions:
                new_history.append(DebateMessage(
                    agent_id=reaction.agent_id,
                    content=reaction.content,
                    round_number=request.round_number,
                ))

            final = DebateRoundResponse(
                round_number=request.round_number,
                challenged_agent_id=request.challenged_agent_id,
                reactions=reactions,
                debate_history=new_history,
                session_id=session_id,
            )

            yield _sse_event("result", final.model_dump(mode="json"))

        except Exception as e:
            yield _sse_event("error", {"detail": str(e)})

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
