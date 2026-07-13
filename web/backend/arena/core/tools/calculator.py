"""Calculator tool for mathematical expressions"""

import re
import ast
import operator
from typing import Dict, Any

from arena.core.tools.base import Tool, ToolResult


class CalculatorTool(Tool):
    """Safe calculator for mathematical expressions"""
    
    # Allowed operators for safe eval
    SAFE_OPERATORS = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
        ast.Mod: operator.mod,
        ast.FloorDiv: operator.floordiv,
    }
    
    @property
    def name(self) -> str:
        return "calculator"
    
    @property
    def description(self) -> str:
        return "Evaluates mathematical expressions safely"
    
    def should_trigger(self, prompt: str, **kwargs) -> bool:
        """Trigger if prompt contains numbers and math operators"""
        prompt_lower = prompt.lower()
        
        # Check for math keywords
        math_keywords = [
            'calculate', 'compute', 'solve', 'what is', 'how much',
            'add', 'subtract', 'multiply', 'divide', 'plus', 'minus',
            'times', 'divided by', 'sum', 'product', 'difference',
            'square', 'power', 'root'
        ]
        has_math_keyword = any(kw in prompt_lower for kw in math_keywords)
        
        # Check for numbers and operators
        has_numbers = bool(re.search(r'\d+', prompt))
        has_operators = bool(re.search(r'[\+\-\*/\^%]', prompt))
        
        return has_math_keyword or (has_numbers and has_operators)
    
    async def execute(self, prompt: str, **kwargs) -> ToolResult:
        """Execute mathematical calculation"""
        try:
            # Extract mathematical expression from prompt
            expression = self._extract_expression(prompt)
            
            if not expression:
                return ToolResult(
                    tool_name=self.name,
                    success=False,
                    data=None,
                    error="No mathematical expression found"
                )
            
            # Evaluate safely
            result = self._safe_eval(expression)
            
            return ToolResult(
                tool_name=self.name,
                success=True,
                data={
                    "expression": expression,
                    "result": result,
                    "formatted": f"{expression} = {result}"
                }
            )
            
        except Exception as e:
            return ToolResult(
                tool_name=self.name,
                success=False,
                data=None,
                error=f"Calculation error: {str(e)}"
            )
    
    def _extract_expression(self, prompt: str) -> str:
        """Extract mathematical expression from natural language"""
        # Try to find expressions with operators
        patterns = [
            r'(\d+\.?\d*\s*[\+\-\*/\^%]\s*\d+\.?\d*(?:\s*[\+\-\*/\^%]\s*\d+\.?\d*)*)',
            r'what is\s+(.+?)(?:\?|$)',
            r'calculate\s+(.+?)(?:\?|$)',
            r'compute\s+(.+?)(?:\?|$)',
            r'solve\s+(.+?)(?:\?|$)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, prompt, re.IGNORECASE)
            if match:
                expr = match.group(1).strip()
                # Clean up the expression
                expr = expr.replace('^', '**')  # Convert ^ to **
                expr = expr.replace('x', '*')   # Convert x to *
                expr = expr.replace('×', '*')   # Convert × to *
                expr = expr.replace('÷', '/')   # Convert ÷ to /
                return expr
        
        # If no pattern matches, try to find any sequence with numbers and operators
        match = re.search(r'[\d\+\-\*/\(\)\.\s]+', prompt)
        if match:
            expr = match.group(0).strip()
            if any(op in expr for op in ['+', '-', '*', '/']):
                return expr
        
        return ""
    
    def _safe_eval(self, expression: str) -> float:
        """Safely evaluate mathematical expression using AST"""
        try:
            # Parse the expression
            node = ast.parse(expression, mode='eval')
            
            # Evaluate using safe operators only
            result = self._eval_node(node.body)
            
            # Round to reasonable precision
            if isinstance(result, float):
                # Round to 10 decimal places to avoid floating point artifacts
                result = round(result, 10)
                # If it's effectively an integer, return as int
                if result == int(result):
                    result = int(result)
            
            return result
            
        except Exception as e:
            raise ValueError(f"Invalid expression: {str(e)}")
    
    def _eval_node(self, node) -> float:
        """Recursively evaluate AST node"""
        if isinstance(node, ast.Constant):  # Python 3.8+
            return node.value
        elif isinstance(node, ast.Num):  # Python 3.7 compatibility
            return node.n
        elif isinstance(node, ast.BinOp):
            op_type = type(node.op)
            if op_type not in self.SAFE_OPERATORS:
                raise ValueError(f"Operator {op_type.__name__} not allowed")
            left = self._eval_node(node.left)
            right = self._eval_node(node.right)
            return self.SAFE_OPERATORS[op_type](left, right)
        elif isinstance(node, ast.UnaryOp):
            op_type = type(node.op)
            if op_type not in self.SAFE_OPERATORS:
                raise ValueError(f"Operator {op_type.__name__} not allowed")
            operand = self._eval_node(node.operand)
            return self.SAFE_OPERATORS[op_type](operand)
        else:
            raise ValueError(f"Unsupported node type: {type(node).__name__}")
