"""Web search tool using DuckDuckGo"""

import re
from typing import List, Dict, Any

from arena.core.tools.base import Tool, ToolResult


class WebSearchToolResult(ToolResult):
    """Custom ToolResult for web search with better formatting"""
    
    def to_context_string(self) -> str:
        """Format web search results for agent context"""
        if not self.success:
            return f"[{self.tool_name}]: Failed - {self.error}"
        
        # Format search results in a readable way for agents
        query = self.data.get("query", "")
        results = self.data.get("results", [])
        
        lines = [f"[{self.tool_name}] Search for '{query}':"]
        for result in results[:3]:  # Top 3 results
            title = result.get("title", "")
            snippet = result.get("snippet", "")
            lines.append(f"  • {title}")
            if snippet:
                lines.append(f"    {snippet[:200]}...")
        
        return "\n".join(lines)


class WebSearchTool(Tool):
    """Web search using DuckDuckGo API"""
    
    @property
    def name(self) -> str:
        return "web_search"
    
    @property
    def description(self) -> str:
        return "Searches the web for current information using DuckDuckGo"
    
    def should_trigger(self, prompt: str, **kwargs) -> bool:
        """Trigger for current events, news, prices, or time-sensitive queries"""
        prompt_lower = prompt.lower()
        
        # Time-sensitive keywords
        time_keywords = [
            'current', 'latest', 'recent', 'today', 'now', 'this week',
            'this month', 'this year', '2024', '2025', '2026',
            'news', 'update', 'what happened', 'breaking', 'right now'
        ]
        
        # Information-seeking keywords
        info_keywords = [
            'price of', 'cost of', 'how much is', 'stock price',
            'current price', 'price', 'bitcoin', 'cryptocurrency',
            'weather', 'forecast', 'score', 'result',
            'who won', 'who is', 'what is', 'where is',
            'search for', 'find', 'look up'
        ]
        
        # Check for time-sensitive or information-seeking queries
        has_time_keyword = any(kw in prompt_lower for kw in time_keywords)
        has_info_keyword = any(kw in prompt_lower for kw in info_keywords)
        
        # Also trigger on questions that seem to need external data
        is_question = any(prompt_lower.startswith(q) for q in ['what', 'who', 'where', 'when', 'how', 'why'])
        
        return has_time_keyword or has_info_keyword or (is_question and len(prompt.split()) > 3)
    
    async def execute(self, prompt: str, **kwargs) -> ToolResult:
        """Execute web search"""
        try:
            from duckduckgo_search import DDGS
            
            # Extract search query from prompt
            query = self._extract_query(prompt)
            
            if not query:
                query = prompt  # Use full prompt if extraction fails
            
            # Perform search
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=3))
            
            if not results:
                return WebSearchToolResult(
                    tool_name=self.name,
                    success=False,
                    data=None,
                    error="No search results found"
                )
            
            # Format results
            formatted_results = []
            for i, result in enumerate(results, 1):
                formatted_results.append({
                    "position": i,
                    "title": result.get("title", ""),
                    "snippet": result.get("body", ""),
                    "url": result.get("href", "")
                })
            
            print(f"[WEB_SEARCH] Found {len(formatted_results)} results for query: {query}")
            
            return WebSearchToolResult(
                tool_name=self.name,
                success=True,
                data={
                    "query": query,
                    "results": formatted_results,
                    "count": len(formatted_results)
                }
            )
            
        except ImportError:
            return WebSearchToolResult(
                tool_name=self.name,
                success=False,
                data=None,
                error="duckduckgo-search library not installed"
            )
        except Exception as e:
            print(f"[WEB_SEARCH] Error: {str(e)}")
            return WebSearchToolResult(
                tool_name=self.name,
                success=False,
                data=None,
                error=f"Search error: {str(e)}"
            )
    
    def _extract_query(self, prompt: str) -> str:
        """Extract search query from natural language prompt"""
        prompt_lower = prompt.lower()
        
        # Remove common question prefixes
        patterns = [
            r'what is the (?:current |latest )?(.+?)(?:\?|$)',
            r'what (?:is|are) (.+?)(?:\?|$)',
            r'who (?:is|are) (.+?)(?:\?|$)',
            r'where (?:is|are) (.+?)(?:\?|$)',
            r'when (?:is|was|did) (.+?)(?:\?|$)',
            r'how (?:much|many) (?:is|are) (.+?)(?:\?|$)',
            r'search for (.+?)(?:\?|$)',
            r'find (.+?)(?:\?|$)',
            r'look up (.+?)(?:\?|$)',
            r'tell me about (.+?)(?:\?|$)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, prompt_lower)
            if match:
                return match.group(1).strip()
        
        # If no pattern matches, clean up the prompt
        # Remove question marks and common filler words
        query = prompt.replace('?', '').strip()
        filler_words = ['please', 'can you', 'could you', 'would you', 'i want to know']
        for filler in filler_words:
            query = query.lower().replace(filler, '').strip()
        
        return query if query else prompt
