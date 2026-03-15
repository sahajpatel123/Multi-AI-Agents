"""Orchestrator for parallel agent fan-out"""

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any

import anthropic
from sqlalchemy.orm import Session

from arena.config import get_settings
from arena.models.schemas import AgentConfig, AgentResponse
from arena.core.agents import AGENTS, get_all_agents, get_persona_id_for_agent, call_persona
from arena.core.memory import MemoryRelevanceRanker, format_memory_for_injection
from arena.core.observability import LatencyTracker
from arena.core.stance_archive import extract_topic, save_agent_stance, summarize_stance_text
from arena.core.tools.tool_router import ToolRouter

logger = logging.getLogger(__name__)


class Orchestrator:
    """Manages parallel calls to all agents"""
    
    def __init__(self):
        settings = get_settings()
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.model = settings.default_model
        self.max_tokens = settings.max_tokens
        self.timeout = settings.timeout_seconds
        self.tool_router = ToolRouter()
    
    def _inject_tool_context(self, system_prompt: str, tool_context: str) -> str:
        """Inject tool results into agent system prompt"""
        if not tool_context:
            return system_prompt
        
        injected = f"{system_prompt}\n\n{tool_context}"
        print(f"[ORCHESTRATOR] Injecting tool context ({len(tool_context)} chars) into system prompt")
        print(f"[ORCHESTRATOR] Tool context preview: {tool_context[:200]}...")
        return injected

    async def _build_memory_contexts(
        self,
        prompt: str,
        active_agents: list[AgentConfig],
        persona_ids: list[str] | None,
        user_id: int | None,
        db: Session | None,
    ) -> dict[str, str]:
        if not user_id or db is None:
            return {}

        try:
            ranked_memories = await MemoryRelevanceRanker(db).rank_memories(
                current_prompt=prompt,
                user_id=user_id,
                limit=3,
            )
            if not ranked_memories:
                return {}

            return {
                agent.agent_id: format_memory_for_injection(
                    ranked_memories,
                    get_persona_id_for_agent(agent.agent_id, persona_ids),
                )
                for agent in active_agents
            }
        except Exception as exc:
            logger.warning("Memory ranking skipped: %s", exc)
            return {}

    @staticmethod
    def _prepend_memory_context(system_prompt: str, memory_context: str) -> str:
        if not memory_context:
            return system_prompt
        return f"{memory_context}\n\n---PERSONA INSTRUCTIONS---\n{system_prompt}"

    async def _archive_stances(
        self,
        *,
        prompt: str,
        responses: list[AgentResponse],
        persona_ids: list[str] | None,
        session_id: str | None,
        user_id: int | None,
        db: Session | None,
    ) -> None:
        if not user_id or db is None or not session_id:
            return

        topic = extract_topic(prompt)
        prompt_snippet = prompt[:100]
        for response in responses:
            persona_id = get_persona_id_for_agent(response.agent_id, persona_ids)
            stance = summarize_stance_text(response.one_liner or response.verdict)
            try:
                await save_agent_stance(
                    user_id=user_id,
                    persona_id=persona_id,
                    topic=topic,
                    stance=stance,
                    confidence=response.confidence,
                    session_id=session_id,
                    prompt_snippet=prompt_snippet,
                    db=db,
                )
            except Exception as exc:
                logger.warning("Failed to archive stance for %s: %s", persona_id, exc)

    async def _call_agent(
        self,
        agent: AgentConfig,
        prompt: str,
        tool_context: str = "",
        persona_ids: list[str] | None = None,
        memory_context: str = "",
    ) -> AgentResponse:
        """Call a single agent and parse its response"""
        try:
            base_system_prompt = self._prepend_memory_context(agent.system_prompt, memory_context)
            # Inject tool context into system prompt if available
            system_prompt = self._inject_tool_context(base_system_prompt, tool_context)
            
            # Get persona_id for this agent to route API call
            persona_id = get_persona_id_for_agent(agent.agent_id, persona_ids)
            
            # Route to appropriate API (Claude or Grok)
            content = await asyncio.wait_for(
                call_persona(
                    persona_id=persona_id,
                    system_prompt=system_prompt,
                    user_prompt=prompt,
                    temperature=agent.temperature
                ),
                timeout=self.timeout,
            )
            
            # Parse JSON response
            parsed = self._parse_agent_response(content, agent)
            return parsed
            
        except asyncio.TimeoutError:
            return self._create_error_response(agent, "Request timed out")
        except json.JSONDecodeError as e:
            return self._create_error_response(agent, f"Invalid JSON response: {e}")
        except Exception as e:
            return self._create_error_response(agent, f"Error: {str(e)}")
    
    def _parse_agent_response(self, content: str, agent: AgentConfig) -> AgentResponse:
        """Parse JSON response from agent"""
        # Try to extract JSON from the response
        content = content.strip()
        
        # Handle potential markdown code blocks
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1]) if lines[-1] == "```" else "\n".join(lines[1:])
            content = content.strip()
        
        data = json.loads(content)

        return AgentResponse(
            agent_id=agent.agent_id,
            agent_number=agent.agent_number,
            verdict=data.get("verdict", ""),
            one_liner=data.get("one_liner", ""),
            confidence=int(data.get("confidence", 50)),
            key_assumption=data.get("key_assumption", ""),
            timestamp=datetime.now(UTC),
        )
    
    def _create_error_response(self, agent: AgentConfig, error_msg: str) -> AgentResponse:
        """Create an error response for failed agent calls"""
        return AgentResponse(
            agent_id=agent.agent_id,
            agent_number=agent.agent_number,
            verdict=f"[Error: {error_msg}]",
            one_liner="Response unavailable",
            confidence=0,
            key_assumption="N/A",
            timestamp=datetime.now(UTC),
        )
    
    async def run_all_agents(
        self,
        prompt: str,
        agents: list[AgentConfig] | None = None,
        persona_ids: list[str] | None = None,
        user_id: int | None = None,
        db: Session | None = None,
        session_id: str | None = None,
        tracker: LatencyTracker | None = None,
    ) -> tuple[list[AgentResponse], list[str]]:
        """
        Run all agents in parallel and collect responses.
        Returns tuple of (responses, tools_used).
        Tools are executed first and results injected into agent context.
        """
        # Execute tools first (in parallel)
        tool_results = await self.tool_router.execute_tools(prompt)
        if tracker:
            tracker.mark("tool_router_done")
        
        # Format tool context for injection
        tool_context = self.tool_router.format_tool_context(tool_results)
        
        # Get list of successfully used tools
        tools_used = self.tool_router.get_tool_summary(tool_results)
        
        # Get all agents (always 4 agents)
        active_agents = agents or get_all_agents()

        memory_contexts = await self._build_memory_contexts(
            prompt=prompt,
            active_agents=active_agents,
            persona_ids=persona_ids,
            user_id=user_id,
            db=db,
        )

        # Create tasks for all agents with tool context and persona routing
        if tracker:
            tracker.mark("agents_start")
        tasks = [
            self._call_agent(
                agent,
                prompt,
                tool_context,
                persona_ids,
                memory_contexts.get(agent.agent_id, ""),
            )
            for agent in active_agents
        ]
        
        # Run all tasks concurrently
        responses = await asyncio.gather(*tasks, return_exceptions=False)
        if tracker:
            tracker.mark("agents_done")

        await self._archive_stances(
            prompt=prompt,
            responses=responses,
            persona_ids=persona_ids,
            session_id=session_id,
            user_id=user_id,
            db=db,
        )

        return responses, tools_used
    
    async def run_single_agent(self, agent_id: str, prompt: str, persona_ids: list[str] | None = None) -> AgentResponse | None:
        """Run a single agent by ID"""
        agent = AGENTS.get(agent_id)
        if not agent:
            return None
        return await self._call_agent(agent, prompt, "", persona_ids)

    async def _simulate_stream(
        self, text: str, agent_id: str, queue: asyncio.Queue
    ) -> None:
        """Simulate token streaming for non-streaming APIs by emitting word chunks."""
        words = text.split(' ')
        
        for i, word in enumerate(words):
            # Add space back except for last word
            token = word + ' ' if i < len(words) - 1 else word
            
            await queue.put({
                "type": "token",
                "agent_id": agent_id,
                "token": token
            })
            
            # Small delay between words to simulate streaming (25ms feels natural)
            await asyncio.sleep(0.025)
    
    async def _stream_agent(
        self,
        agent: AgentConfig,
        prompt: str,
        output_queue: asyncio.Queue,
        tool_context: str = "",
        persona_ids: list[str] | None = None,
        memory_context: str = "",
    ) -> AgentResponse:
        """Stream a single agent's response, pushing tokens to a shared queue."""
        full_text = ""
        try:
            base_system_prompt = self._prepend_memory_context(agent.system_prompt, memory_context)
            # Inject tool context into system prompt if available
            system_prompt = self._inject_tool_context(base_system_prompt, tool_context)
            
            # Get persona_id for this agent to route API call
            persona_id = get_persona_id_for_agent(agent.agent_id, persona_ids)
            
            # Check if this persona uses Grok (no streaming support for Grok)
            from arena.core.agents import get_model_for_persona
            model_type = get_model_for_persona(persona_id)
            
            if model_type == 'grok':
                # Grok doesn't support streaming - get full response and simulate streaming
                content = await call_persona(
                    persona_id=persona_id,
                    system_prompt=system_prompt,
                    user_prompt=prompt,
                    temperature=agent.temperature
                )
                full_text = content
                
                # Simulate streaming by emitting word-by-word
                await self._simulate_stream(content, agent.agent_id, output_queue)
            else:
                # Claude supports streaming
                async with self.client.messages.stream(
                    model=self.model,
                    max_tokens=self.max_tokens,
                    temperature=agent.temperature,
                    system=system_prompt,
                    messages=[{"role": "user", "content": prompt}],
                ) as stream:
                    async for text in stream.text_stream:
                        full_text += text
                        await output_queue.put({
                            "type": "token",
                            "agent_id": agent.agent_id,
                            "token": text,
                        })

            # Signal that this agent is done streaming
            await output_queue.put({
                "type": "agent_done",
                "agent_id": agent.agent_id,
            })

            # Parse the completed response
            return self._parse_agent_response(full_text, agent)

        except Exception as e:
            await output_queue.put({
                "type": "agent_error",
                "agent_id": agent.agent_id,
                "error": str(e),
            })
            return self._create_error_response(agent, str(e))

    async def stream_all_agents(
        self,
        prompt: str,
        agents: list[AgentConfig] | None = None,
        persona_ids: list[str] | None = None,
        user_id: int | None = None,
        db: Session | None = None,
        session_id: str | None = None,
        tracker: LatencyTracker | None = None,
    ) -> tuple[asyncio.Queue, list[asyncio.Task], list[str]]:
        """
        Start streaming all agents in parallel.
        Returns the shared queue, task handles, and list of tools used.
        Consumers read from the queue; when all tasks finish,
        a sentinel {"type": "all_done"} is pushed.
        Tools are executed first and results injected into agent context.
        """
        queue: asyncio.Queue = asyncio.Queue()
        
        # Execute tools first (in parallel)
        tool_results = await self.tool_router.execute_tools(prompt)
        if tracker:
            tracker.mark("tool_router_done")
        
        # Format tool context for injection
        tool_context = self.tool_router.format_tool_context(tool_results)
        
        # Get list of successfully used tools
        tools_used = self.tool_router.get_tool_summary(tool_results)
        
        # Get all agents (always 4 agents)
        active_agents = agents or get_all_agents()
        memory_contexts = await self._build_memory_contexts(
            prompt=prompt,
            active_agents=active_agents,
            persona_ids=persona_ids,
            user_id=user_id,
            db=db,
        )

        async def _run_all() -> list[AgentResponse]:
            if tracker:
                tracker.mark("agents_start")
            tasks = [
                asyncio.create_task(
                    self._stream_agent(
                        agent,
                        prompt,
                        queue,
                        tool_context,
                        persona_ids,
                        memory_contexts.get(agent.agent_id, ""),
                    )
                )
                for agent in active_agents
            ]
            responses = await asyncio.gather(*tasks)
            if tracker:
                tracker.mark("agents_done")
            await self._archive_stances(
                prompt=prompt,
                responses=responses,
                persona_ids=persona_ids,
                session_id=session_id,
                user_id=user_id,
                db=db,
            )
            await queue.put({"type": "all_done", "responses": None})
            return list(responses)

        gather_task = asyncio.create_task(_run_all())
        return queue, gather_task, tools_used
