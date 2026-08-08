"""Tests for the expertise_domain field length bound.

expertise_domain historically had no max_length at the
Pydantic level. A 1MB string would be accepted by Pydantic,
then sliced to 100 chars by the field validator. The
Pydantic cap closes the gap at parse time (422) so the
per-field memory cost is bounded by the cap.

Tests pin:
- 100 chars accepted (boundary)
- 101 chars rejected
- 1MB rejected (DoS)
- empty string accepted (default)
- typical 30-char string accepted
"""

from __future__ import annotations

import pytest

# Import order matters: arena.core.auth FIRST to resolve the
# circular import.
from arena.core.auth import orm_user_to_response  # noqa: F401
from arena.routes.agent import AgentTaskRequest
from pydantic import ValidationError


def test_expertise_domain_100_accepted() -> None:
    req = AgentTaskRequest(task="t", expertise_domain="a" * 100)
    assert len(req.expertise_domain) == 100


def test_expertise_domain_101_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AgentTaskRequest(task="t", expertise_domain="a" * 101)
    assert "expertise_domain" in str(exc_info.value).lower()


def test_expertise_domain_1mb_rejected() -> None:
    with pytest.raises(ValidationError):
        AgentTaskRequest(task="t", expertise_domain="a" * (1024 * 1024))


def test_expertise_domain_empty_accepted() -> None:
    """Empty string is the default (no expertise_domain)."""
    req = AgentTaskRequest(task="t")
    assert req.expertise_domain == ""


def test_expertise_domain_typical_accepted() -> None:
    """A typical 30-char domain is accepted (no regression)."""
    req = AgentTaskRequest(task="t", expertise_domain="natural language processing")
    assert len(req.expertise_domain) == 27
