"""Tests for the SubscribePlanRequest.plan_key length bound.

plan_key historically had no max_length at the Pydantic
level. Real values are like "plus_monthly" (~12 chars);
50 chars is generous. A user could submit a 1MB string
to amplify the pydantic memory cost before the route
handler's dict lookup runs.

Tests pin:
- 50-char plan_key accepted (boundary)
- 51-char plan_key rejected
- 1MB plan_key rejected (DoS)
- A typical "plus_monthly" plan_key accepted
- Missing field rejected (Pydantic v2 required)
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.models.schemas import SubscribePlanRequest
from pydantic import ValidationError


# --- typical plan_key values ---


def test_typical_plan_key_accepted() -> None:
    """A typical "plus_monthly" plan_key (~12 chars) is accepted."""
    req = SubscribePlanRequest(plan_key="plus_monthly")
    assert req.plan_key == "plus_monthly"


def test_long_plan_key_accepted() -> None:
    """A 39-char plan_key is accepted (well within the cap)."""
    req = SubscribePlanRequest(plan_key="pro_annual_premium_with_annual_discount")
    assert len(req.plan_key) == 39  # actual length of the string


# --- 50-char bound ---


def test_plan_key_50_accepted() -> None:
    req = SubscribePlanRequest(plan_key="a" * 50)
    assert len(req.plan_key) == 50


def test_plan_key_51_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        SubscribePlanRequest(plan_key="a" * 51)
    assert "plan_key" in str(exc_info.value).lower()


def test_plan_key_1mb_rejected() -> None:
    """A 1MB plan_key is rejected at parse time — the
    Pydantic cap closes the gap before the route handler's
    dict lookup runs."""
    with pytest.raises(ValidationError):
        SubscribePlanRequest(plan_key="a" * (1024 * 1024))


# --- missing / empty ---


def test_missing_plan_key_rejected() -> None:
    """Missing field is rejected (the field is required)."""
    with pytest.raises(ValidationError):
        SubscribePlanRequest()  # type: ignore[call-arg]


def test_empty_plan_key_accepted() -> None:
    """Empty string is accepted by the Pydantic str field
    (Pydantic v2 doesn't reject empty strings by default).
    The route handler's dict lookup rejects empty plan_key
    with a 400. The Pydantic cap (max 50) closes the
    length-based DoS surface; the route handler closes
    the empty-string surface.
    """
    req = SubscribePlanRequest(plan_key="")
    assert req.plan_key == ""
