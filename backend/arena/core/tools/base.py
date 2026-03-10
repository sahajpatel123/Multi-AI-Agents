"""Base tool interface for agent context enrichment"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class ToolResult:
    """Result from a tool execution"""
    tool_name: str
    success: bool
    data: Any
    error: Optional[str] = None
    
    def to_context_string(self) -> str:
        """Format result for injection into agent context"""
        if not self.success:
            return f"[{self.tool_name}]: Failed - {self.error}"
        return f"[{self.tool_name}]: {self._format_data()}"
    
    def _format_data(self) -> str:
        """Format data for display - override in subclasses if needed"""
        if isinstance(self.data, dict):
            parts = []
            for key, value in self.data.items():
                parts.append(f"{key}: {value}")
            return ", ".join(parts)
        return str(self.data)


class Tool(ABC):
    """Base class for all tools"""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Tool identifier"""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """What this tool does"""
        pass
    
    @abstractmethod
    async def execute(self, prompt: str, **kwargs) -> ToolResult:
        """
        Execute the tool with the given prompt.
        Returns ToolResult with success status and data.
        Should never raise - catch exceptions and return ToolResult with success=False.
        """
        pass
    
    @abstractmethod
    def should_trigger(self, prompt: str, **kwargs) -> bool:
        """
        Determine if this tool should run for the given prompt.
        Fast heuristic check - no LLM calls.
        """
        pass
