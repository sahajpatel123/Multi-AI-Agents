"""Discuss route — 1-on-1 private conversation with a single agent"""

import json
import uuid

import anthropic

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from arena.config import get_settings
from arena.models.schemas import (
    DiscussRequest,
    DiscussResponse,
    DiscussChatMessage,
    ErrorResponse,
)
from arena.core.agents import AGENTS
from arena.core.memory import get_memory_manager


router = APIRouter(prefix="/api", tags=["discuss"])


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


def _get_personality_excerpt(agent_id: str) -> str:
    """Pull the PERSONALITY section from an agent's system prompt."""
    agent = AGENTS.get(agent_id)
    if not agent:
        return ""
    prompt = agent.system_prompt
    start = prompt.find("PERSONALITY:")
    end = prompt.find("RESPONSE STYLE:")
    if start != -1 and end != -1:
        return prompt[start:end].strip()
    return prompt[:200]


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
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def discuss_with_agent(request: DiscussRequest) -> DiscussResponse:
    """
    Send a message to a single agent in a 1-on-1 conversation.
    The agent stays in character with full memory of the thread.
    """
    if request.agent_id not in AGENTS:
        raise HTTPException(status_code=400, detail="Invalid agent ID")

    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    agent = AGENTS[request.agent_id]
    session_id = request.session_id or str(uuid.uuid4())

    # Get agent's previous responses from memory
    memory = get_memory_manager()
    previous_responses = memory.short_term.get_agent_memory(session_id, request.agent_id)
    
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
        personality_excerpt=_get_personality_excerpt(request.agent_id),
        original_prompt=request.original_prompt,
        original_verdict=request.original_verdict,
        previous_responses_context=prev_context,
    )
    messages = _build_messages(request)

    try:
        result = await client.messages.create(
            model=settings.default_model,
            max_tokens=settings.max_tokens,
            temperature=agent.temperature,
            system=system_prompt,
            messages=messages,
        )
        reply = result.content[0].text.strip()

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

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────
# POST /api/discuss/stream — SSE streaming endpoint
# ──────────────────────────────────────────────────────────────

@router.post("/discuss/stream")
async def stream_discuss(request: DiscussRequest):
    """
    SSE streaming 1-on-1 discussion — streams the agent's reply token by token.

    Event types:
    - "token"  → a token from the agent
    - "result" → final DiscussResponse with updated history
    - "error"  → something went wrong
    """
    if request.agent_id not in AGENTS:
        raise HTTPException(status_code=400, detail="Invalid agent ID")

    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    agent = AGENTS[request.agent_id]
    session_id = request.session_id or str(uuid.uuid4())

    # Get agent's previous responses from memory
    memory = get_memory_manager()
    previous_responses = memory.short_term.get_agent_memory(session_id, request.agent_id)
    
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
        personality_excerpt=_get_personality_excerpt(request.agent_id),
        original_prompt=request.original_prompt,
        original_verdict=request.original_verdict,
        previous_responses_context=prev_context,
    )
    messages = _build_messages(request)

    async def event_generator():
        full_text = ""
        try:
            async with client.messages.stream(
                model=settings.default_model,
                max_tokens=settings.max_tokens,
                temperature=agent.temperature,
                system=system_prompt,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
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
