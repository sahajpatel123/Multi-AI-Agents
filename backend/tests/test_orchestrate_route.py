"""Integration tests for POST /api/agent/orchestrate.

The orchestration endpoint kicks off the 7-stage pipeline for a list
of questions and returns the orchestration_id. End-to-end testing
would require driving the background pipeline, but the auth /
schema / gate branches are testable in isolation.
"""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


@pytest.mark.asyncio
async def test_orchestrate_rejects_empty_questions(app_client, make_user):
    user = make_user(email="orch-empty@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/agent/orchestrate",
        headers=_pro_headers(user),
        json={"questions": []},
    )
    assert res.status_code in (400, 422)


@pytest.mark.asyncio
async def test_orchestrate_403_for_free_tier(app_client, make_user):
    user = make_user(email="orch-free@test.com", tier=UserTier.FREE)
    res = await app_client.post(
        "/api/agent/orchestrate",
        headers=_pro_headers(user),
        json={"questions": ["What is X?"]},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_orchestrate_requires_auth(app_client):
    res = await app_client.post(
        "/api/agent/orchestrate",
        json={"questions": ["What is X?"]},
    )
    assert res.status_code == 401
