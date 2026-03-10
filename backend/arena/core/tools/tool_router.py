"""Tool router - determines which tools to run and executes them"""

import asyncio
from typing import List, Dict, Any

from arena.core.tools.base import Tool, ToolResult
from arena.core.tools.calculator import CalculatorTool
from arena.core.tools.web_search import WebSearchTool
from arena.core.tools.datetime_tool import DateTimeTool


class ToolRouter:
    """Routes prompts to appropriate tools and executes them in parallel"""
    
    def __init__(self):
        self.tools: List[Tool] = [
            CalculatorTool(),
            WebSearchTool(),
            DateTimeTool(),
        ]
    
    async def execute_tools(self, prompt: str, **kwargs) -> Dict[str, ToolResult]:
        """
        Determine which tools should run and execute them in parallel.
        Returns dict of tool_name -> ToolResult.
        Never raises - tools that fail return ToolResult with success=False.
        """
        # Determine which tools should trigger
        tools_to_run = [
            tool for tool in self.tools
            if tool.should_trigger(prompt, **kwargs)
        ]
        
        if not tools_to_run:
            return {}
        
        # Execute all triggered tools in parallel
        tasks = [
            tool.execute(prompt, **kwargs)
            for tool in tools_to_run
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Build result dict, handling any exceptions
        tool_results = {}
        for tool, result in zip(tools_to_run, results):
            if isinstance(result, Exception):
                # Tool raised an exception - wrap it in a failed ToolResult
                tool_results[tool.name] = ToolResult(
                    tool_name=tool.name,
                    success=False,
                    data=None,
                    error=f"Tool execution failed: {str(result)}"
                )
            else:
                tool_results[tool.name] = result
        
        return tool_results
    
    def format_tool_context(self, tool_results: Dict[str, ToolResult]) -> str:
        """
        Format tool results for injection into agent system context.
        Only includes successful results.
        """
        if not tool_results:
            return ""
        
        # Filter to successful results only
        successful = {
            name: result
            for name, result in tool_results.items()
            if result.success
        }
        
        if not successful:
            return ""
        
        # Build context string
        lines = ["TOOL RESULTS (use these facts in your response):"]
        for name, result in successful.items():
            lines.append(f"  {result.to_context_string()}")
        
        return "\n".join(lines)
    
    def get_tool_summary(self, tool_results: Dict[str, ToolResult]) -> List[str]:
        """
        Get list of tool names that were successfully used.
        For frontend display.
        """
        return [
            result.tool_name
            for result in tool_results.values()
            if result.success
        ]
