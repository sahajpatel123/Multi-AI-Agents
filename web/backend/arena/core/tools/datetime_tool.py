"""DateTime tool for current date and time information"""

from datetime import datetime, timezone
from typing import Dict, Any

from arena.core.tools.base import Tool, ToolResult


class DateTimeTool(Tool):
    """Provides current date, time, and timezone information"""
    
    @property
    def name(self) -> str:
        return "datetime"
    
    @property
    def description(self) -> str:
        return "Returns current date, time, timezone, and day of week"
    
    def should_trigger(self, prompt: str, **kwargs) -> bool:
        """Trigger when prompt mentions time-related queries"""
        prompt_lower = prompt.lower()
        
        # Time-related keywords
        time_keywords = [
            'today', 'now', 'current time', 'current date', 'what time',
            'what day', 'this week', 'this month', 'this year',
            'day of week', 'day of the week', 'what date',
            'time is it', 'date is it', 'timezone'
        ]
        
        return any(kw in prompt_lower for kw in time_keywords)
    
    async def execute(self, prompt: str, **kwargs) -> ToolResult:
        """Get current datetime information"""
        try:
            # Get current UTC time
            now_utc = datetime.now(timezone.utc)
            
            # Format various representations
            data = {
                "utc_datetime": now_utc.isoformat(),
                "utc_date": now_utc.strftime("%Y-%m-%d"),
                "utc_time": now_utc.strftime("%H:%M:%S"),
                "day_of_week": now_utc.strftime("%A"),
                "month": now_utc.strftime("%B"),
                "year": now_utc.year,
                "timezone": "UTC",
                "timestamp": int(now_utc.timestamp()),
                "formatted": now_utc.strftime("%A, %B %d, %Y at %H:%M:%S UTC")
            }
            
            return ToolResult(
                tool_name=self.name,
                success=True,
                data=data
            )
            
        except Exception as e:
            return ToolResult(
                tool_name=self.name,
                success=False,
                data=None,
                error=f"DateTime error: {str(e)}"
            )
