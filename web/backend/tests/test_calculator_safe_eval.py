"""CalculatorTool AST sandbox + DoS bounds.

The calculator must never call eval/exec. On Python 3.14, referencing
``ast.Num`` (removed) raised AttributeError inside isinstance and broke
every binary expression — including ``1+1``. These tests pin:

  1. Basic arithmetic works (3.11 CI and 3.14 local).
  2. Code-injection shapes (names, calls, attrs, dunders) are rejected.
  3. DoS shapes (huge exponents, long expressions) are rejected.
  4. Non-numeric constants (bool, str) are rejected.
"""

from __future__ import annotations

import pytest

from arena.core.tools.calculator import CalculatorTool


@pytest.fixture
def calc() -> CalculatorTool:
    return CalculatorTool()


class TestSafeEvalBasics:
    def test_addition(self, calc: CalculatorTool):
        assert calc._safe_eval("1+1") == 2

    def test_mixed_ops_and_parens(self, calc: CalculatorTool):
        assert calc._safe_eval("(2+3)*4") == 20

    def test_power(self, calc: CalculatorTool):
        assert calc._safe_eval("2**10") == 1024

    def test_unary_minus(self, calc: CalculatorTool):
        assert calc._safe_eval("-5 + 2") == -3

    def test_division(self, calc: CalculatorTool):
        assert calc._safe_eval("10/4") == 2.5

    def test_division_by_zero(self, calc: CalculatorTool):
        with pytest.raises(ValueError, match="zero"):
            calc._safe_eval("1/0")


class TestInjectionRejection:
    @pytest.mark.parametrize(
        "expr",
        [
            "__import__('os').system('id')",
            "open('/etc/passwd').read()",
            "(lambda:1)()",
            "__builtins__",
            "().__class__",
            "''.__class__",
            "x+1",
            "1 if True else 0",
            "True",
            "False",
            "'a'*3",
        ],
    )
    def test_rejects_non_math(self, calc: CalculatorTool, expr: str):
        with pytest.raises(ValueError):
            calc._safe_eval(expr)


class TestDoSBounds:
    def test_rejects_huge_exponent(self, calc: CalculatorTool):
        with pytest.raises(ValueError, match="Exponent|safe limit|exceed"):
            calc._safe_eval("9**9999")

    def test_rejects_right_assoc_tower(self, calc: CalculatorTool):
        # 9**9**9 == 9**(9**9) — classic CPU bomb if unbounded.
        with pytest.raises(ValueError, match="Exponent|safe limit|exceed|complex"):
            calc._safe_eval("9**9**9")

    def test_rejects_overlong_expression(self, calc: CalculatorTool):
        expr = "1+" * 200 + "1"
        with pytest.raises(ValueError, match="too long|too complex|disallowed"):
            calc._safe_eval(expr)

    def test_rejects_oversized_power_result(self, calc: CalculatorTool):
        with pytest.raises(ValueError, match="safe limit|exceed"):
            calc._safe_eval("2**10000")


class TestExtractAndExecute:
    @pytest.mark.asyncio
    async def test_execute_happy_path(self, calc: CalculatorTool):
        result = await calc.execute("calculate 2 + 2")
        assert result.success is True
        assert result.data["result"] == 4

    @pytest.mark.asyncio
    async def test_execute_rejects_injection_in_prompt(self, calc: CalculatorTool):
        result = await calc.execute("calculate __import__('os').system('id')")
        assert result.success is False
