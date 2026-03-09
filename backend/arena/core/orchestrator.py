"""Orchestrator for parallel agent fan-out"""

import asyncio
import json
from datetime import datetime
from typing import Any, AsyncGenerator

import anthropic

from arena.config import get_settings
from arena.models.schemas import AgentConfig, AgentResponse
from arena.core.agents import AGENTS, get_all_agents


class Orchestrator:
    """Manages parallel calls to all agents"""
    
    def __init__(self):
        settings = get_settings()
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.model = settings.default_model
        self.max_tokens = settings.max_tokens
        self.timeout = settings.timeout_seconds
    
    async def _call_agent(self, agent: AgentConfig, prompt: str) -> AgentResponse:
        """Call a single agent and parse its response"""
        try:
            response = await asyncio.wait_for(
                self.client.messages.create(
                    model=self.model,
                    max_tokens=self.max_tokens,
                    temperature=agent.temperature,
                    system=agent.system_prompt,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=self.timeout,
            )
            
            # Extract text content
            content = response.content[0].text
            
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
            timestamp=datetime.utcnow(),
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
            timestamp=datetime.utcnow(),
        )
    
    async def run_all_agents(self, prompt: str) -> list[AgentResponse]:
        """Run all agents in parallel and collect responses"""
        agents = get_all_agents()
        
        # Create tasks for all agents
        tasks = [self._call_agent(agent, prompt) for agent in agents]
        
        # Run all tasks concurrently
        responses = await asyncio.gather(*tasks, return_exceptions=False)
        
        return responses
    
    async def run_single_agent(self, agent_id: str, prompt: str) -> AgentResponse | None:
        """Run a single agent by ID"""
        agent = AGENTS.get(agent_id)
        if not agent:
            return None
        return await self._call_agent(agent, prompt)

    async def _stream_agent(
        self, agent: AgentConfig, prompt: str, output_queue: asyncio.Queue
    ) -> AgentResponse:
        """Stream a single agent's response, pushing tokens to a shared queue."""
        full_text = ""
        try:
            async with self.client.messages.stream(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=agent.temperature,
                system=agent.system_prompt,
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
        self, prompt: str
    ) -> tuple[asyncio.Queue, list[asyncio.Task]]:
        """
        Start streaming all agents in parallel.
        Returns the shared queue and task handles.
        Consumers read from the queue; when all tasks finish,
        a sentinel {"type": "all_done"} is pushed.
        """
        queue: asyncio.Queue = asyncio.Queue()
        agents = get_all_agents()

        async def _run_all() -> list[AgentResponse]:
            tasks = [
                asyncio.create_task(self._stream_agent(agent, prompt, queue))
                for agent in agents
            ]
            responses = await asyncio.gather(*tasks)
            await queue.put({"type": "all_done", "responses": None})
            return list(responses)

        gather_task = asyncio.create_task(_run_all())
        return queue, gather_task
