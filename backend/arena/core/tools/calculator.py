"""Calculator tool for mathematical expressions.

Uses a hand-rolled AST walker (never eval/exec) so untrusted LLM-
extracted strings cannot reach the Python runtime. Bounds on expression
length, AST size, exponent size, and intermediate magnitude keep a
malicious ``9**9**9`` from hanging a worker.
"""

from __future__ import annotations

import ast
import logging
import operator
import re
from typing import Any, Dict, Union

logger = logging.getLogger(__name__)

from arena.core.tools.base import Tool, ToolResult

Number = Union[int, float]

# Hard caps — a single tool call must not exhaust CPU or memory.
_MAX_EXPR_LEN = 200
_MAX_AST_NODES = 64
_MAX_ABS_VALUE = 1e100
_MAX_ABS_EXPONENT = 1000
# 2**3322 ≈ 1e1000; keep base**exp intermediates under _MAX_ABS_VALUE.
_MAX_POW_BITS = 332


class CalculatorTool(Tool):
    """Safe calculator for mathematical expressions."""

    # Allowed operators for safe eval — no bitwise, no comparisons that
    # could short-circuit into unexpected types.
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
        """Trigger if prompt contains numbers and math operators."""
        prompt_lower = prompt.lower()

        math_keywords = [
            "calculate",
            "compute",
            "solve",
            "what is",
            "how much",
            "add",
            "subtract",
            "multiply",
            "divide",
            "plus",
            "minus",
            "times",
            "divided by",
            "sum",
            "product",
            "difference",
            "square",
            "power",
            "root",
        ]
        has_math_keyword = any(kw in prompt_lower for kw in math_keywords)

        has_numbers = bool(re.search(r"\d+", prompt))
        has_operators = bool(re.search(r"[\+\-\*/\^%]", prompt))

        return has_math_keyword or (has_numbers and has_operators)

    async def execute(self, prompt: str, **kwargs) -> ToolResult:
        """Execute mathematical calculation."""
        try:
            expression = self._extract_expression(prompt)

            if not expression:
                return ToolResult(
                    tool_name=self.name,
                    success=False,
                    data=None,
                    error="No mathematical expression found",
                )

            result = self._safe_eval(expression)

            return ToolResult(
                tool_name=self.name,
                success=True,
                data={
                    "expression": expression,
                    "result": result,
                    "formatted": f"{expression} = {result}",
                },
            )

        except Exception as e:
            return ToolResult(
                tool_name=self.name,
                success=False,
                data=None,
                error=f"Calculation error: {str(e)}",
            )

    def _extract_expression(self, prompt: str) -> str:
        """Extract mathematical expression from natural language."""
        patterns = [
            r"(\d+\.?\d*\s*[\+\-\*/\^%]\s*\d+\.?\d*(?:\s*[\+\-\*/\^%]\s*\d+\.?\d*)*)",
            r"what is\s+(.+?)(?:\?|$)",
            r"calculate\s+(.+?)(?:\?|$)",
            r"compute\s+(.+?)(?:\?|$)",
            r"solve\s+(.+?)(?:\?|$)",
        ]

        for pattern in patterns:
            match = re.search(pattern, prompt, re.IGNORECASE)
            if match:
                expr = match.group(1).strip()
                expr = expr.replace("^", "**")
                # Only rewrite bare `x` as multiply when it is used as an
                # operator between numbers (e.g. "3 x 4"), not inside words.
                expr = re.sub(r"(?<=\d)\s*[x×]\s*(?=\d)", "*", expr)
                expr = expr.replace("÷", "/")
                return expr

        match = re.search(r"[\d\+\-\*/\(\)\.\s]+", prompt)
        if match:
            expr = match.group(0).strip()
            if any(op in expr for op in ["+", "-", "*", "/"]):
                return expr

        return ""

    def _safe_eval(self, expression: str) -> Number:
        """Safely evaluate mathematical expression using AST (never eval)."""
        if not isinstance(expression, str):
            raise ValueError("Expression must be a string")
        expression = expression.strip()
        if not expression:
            raise ValueError("Empty expression")
        if len(expression) > _MAX_EXPR_LEN:
            raise ValueError(f"Expression too long (max {_MAX_EXPR_LEN} chars)")
        # Reject anything that is not digits/operators/whitespace/parens/dot.
        # Blocks names, attributes, calls, string literals, etc. at the
        # source before AST walk.
        if re.search(r"[^0-9+\-*/%().\s]", expression):
            raise ValueError("Expression contains disallowed characters")

        try:
            tree = ast.parse(expression, mode="eval")
        except SyntaxError as e:
            raise ValueError(f"Invalid expression: {e}") from e

        node_count = sum(1 for _ in ast.walk(tree))
        if node_count > _MAX_AST_NODES:
            raise ValueError("Expression too complex")

        result = self._eval_node(tree.body)
        return self._normalize(result)

    def _normalize(self, result: Number) -> Number:
        self._check_magnitude(result)
        if isinstance(result, float):
            result = round(result, 10)
            if result == int(result) and abs(result) < 2**53:
                result = int(result)
        return result

    def _check_magnitude(self, value: Number) -> None:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("Non-numeric result")
        if abs(value) > _MAX_ABS_VALUE:
            raise ValueError("Result magnitude exceeds safe limit")

    def _eval_node(self, node: ast.AST) -> Number:
        """Recursively evaluate AST node with a closed operator set."""
        # Python 3.8+: numbers are ast.Constant. Do NOT reference ast.Num —
        # it was removed in 3.14 and evaluating `ast.Num` raises AttributeError
        # even inside isinstance(), which broke every BinOp on 3.14.
        if isinstance(node, ast.Constant):
            # bool is a subclass of int — reject True/False explicitly.
            if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
                raise ValueError("Only numeric constants are allowed")
            self._check_magnitude(node.value)
            return node.value

        # Legacy Python 3.7 path (kept for CI images that still expose Num).
        _num = getattr(ast, "Num", None)
        if _num is not None and isinstance(node, _num):  # pragma: no cover
            value = node.n  # type: ignore[attr-defined]
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError("Only numeric constants are allowed")
            self._check_magnitude(value)
            return value

        if isinstance(node, ast.UnaryOp):
            op_type = type(node.op)
            if op_type not in self.SAFE_OPERATORS:
                raise ValueError(f"Operator {op_type.__name__} not allowed")
            operand = self._eval_node(node.operand)
            result = self.SAFE_OPERATORS[op_type](operand)
            self._check_magnitude(result)
            return result

        if isinstance(node, ast.BinOp):
            op_type = type(node.op)
            if op_type not in self.SAFE_OPERATORS:
                raise ValueError(f"Operator {op_type.__name__} not allowed")
            left = self._eval_node(node.left)
            right = self._eval_node(node.right)

            if op_type is ast.Pow:
                result = self._safe_pow(left, right)
            elif op_type in (ast.Div, ast.FloorDiv, ast.Mod) and right == 0:
                raise ValueError("Division by zero")
            else:
                result = self.SAFE_OPERATORS[op_type](left, right)

            self._check_magnitude(result)
            return result

        # Explicitly reject Names, Calls, Attributes, Subscripts, etc.
        raise ValueError(f"Unsupported node type: {type(node).__name__}")

    def _safe_pow(self, base: Number, exp: Number) -> Number:
        """Power with DoS guards against enormous intermediates."""
        if isinstance(exp, float) and not exp.is_integer():
            # Fractional exponents of negative bases are complex; refuse.
            if base < 0:
                raise ValueError("Fractional power of negative base not allowed")
        if abs(exp) > _MAX_ABS_EXPONENT:
            raise ValueError("Exponent exceeds safe limit")
        # Bit-length guard: log2(|base**exp|) ≈ exp * log2(|base|)
        if base != 0 and exp > 0:
            abs_base = abs(base)
            if isinstance(abs_base, int) and abs_base > 1:
                # integer path
                try:
                    bits = abs_base.bit_length() * int(exp)
                except Exception:
                    logger.warning("Failed to calculate bit_length for power", exc_info=True)
                    bits = _MAX_POW_BITS + 1
                if bits > _MAX_POW_BITS:
                    raise ValueError("Power result would exceed safe limit")
            elif abs_base > 1:
                import math

                try:
                    log_mag = float(exp) * math.log2(float(abs_base))
                except (ValueError, OverflowError) as e:
                    raise ValueError("Power result would exceed safe limit") from e
                if log_mag > _MAX_POW_BITS:
                    raise ValueError("Power result would exceed safe limit")
        result = operator.pow(base, exp)
        if isinstance(result, complex):
            raise ValueError("Complex results are not allowed")
        return result
