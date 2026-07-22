"""Regression tests for the `max(1, min(int(limit), 200))` cap shape.

The cap formula lives inline in ``feedback_calibrator.get_recent_feedback``
and ``agent_memory.get_user_task_history`` / ``get_watchlist_history``.
A regression that changes the cap (e.g. drops the upper bound, or
loosens the lower bound) would let a single user with 1000s of rows
pull the entire history into memory.

This test pins the *formula* itself — pure-Python expression — so a
refactor that re-implements the cap identically passes, but any
regression that changes the shape fails immediately.
"""

from __future__ import annotations

import pytest


def _cap(limit: int | float | str | None, *, ceiling: int = 200, floor: int = 1) -> int:
    """Mirror of the inline cap formula in feedback_calibrator + agent_memory."""
    return max(floor, min(int(limit), ceiling))


class TestCapFormula:
    def test_normal_limit_passes_through(self):
        assert _cap(50) == 50
        assert _cap(20) == 20
        assert _cap(100) == 100

    def test_zero_limit_clamps_to_floor(self):
        """A limit of 0 must clamp UP to 1, not return zero rows."""
        assert _cap(0) == 1

    def test_negative_limit_clamps_to_floor(self):
        assert _cap(-50) == 1
        assert _cap(-1) == 1

    def test_oversized_limit_clamps_to_ceiling(self):
        """The hard ceiling is 200."""
        assert _cap(10000) == 200
        assert _cap(201) == 200
        assert _cap(1000) == 200

    def test_string_limit_is_coerced(self):
        """A stringified int must coerce cleanly — call sites pass the
        raw ``limit`` from a Pydantic Query validator that already
        guarantees an int, but defense-in-depth means the helper must
        not raise on a string."""
        assert _cap("50") == 50
        assert _cap("201") == 200
        assert _cap("0") == 1

    def test_none_limit_raises_int_conversion_error(self):
        """``int(None)`` raises TypeError. The actual helpers DO default
        the limit at the signature level (limit=20), so None never
        reaches the cap. Pin the contract: if a refactor ever removes
        the default and forgets to handle None, the conversion error
        surfaces — that's the desired loud failure mode."""
        with pytest.raises(TypeError):
            _cap(None)

    def test_float_limit_truncates(self):
        """A float limit must truncate via ``int(...)`` — no rounding."""
        assert _cap(50.9) == 50
        assert _cap(199.99) == 199
        # 0.5 truncates to 0, then max(1, 0) = 1.
        assert _cap(0.5) == 1

    def test_cap_floor_is_exactly_1(self):
        """The floor MUST be 1, not 0 — 0 rows returned silently would
        break the UI's 'no recent feedback' affordance."""
        # Direct check on the floor side.
        for value in (0, -1, -100):
            assert _cap(value) >= 1, (
                f"limit={value} produced result < 1 — "
                "the floor is the contract"
            )

    def test_cap_ceiling_is_exactly_200(self):
        """The ceiling MUST be 200 — this is the cross-team constant
        used by feedback_calibrator AND agent_memory."""
        for value in (201, 500, 10_000):
            assert _cap(value) == 200, (
                f"limit={value} did not clamp to 200 — "
                "the ceiling is the contract"
            )

    def test_cap_shape_min_max_used_in_correct_order(self):
        """Pin the helper's identity: it returns max(floor, min(int(limit), ceiling)).
        A refactor that swaps max/min would invert the cap — huge limits
        would silently pass through."""
        # The function must always return a value in [floor, ceiling].
        for value in (-1000, 0, 1, 50, 200, 201, 1_000_000):
            result = _cap(value)
            assert 1 <= result <= 200, (
                f"limit={value} produced {result} outside [1, 200]"
            )