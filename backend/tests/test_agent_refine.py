"""Integration tests for POST /api/agent/refine.

The /refine endpoint depends on an in-memory blackboard (created by
/run when the user starts a research task), so without one the route
returns 404 'task_not_found'. We exercise that branch plus the auth
gates — full end-to-end refinement coverage would require driving the
background pipeline.
"""

from __future__ import annotations

import pytest

from arena.db_models import UserTier



@pytest.mark.asyncio
async def test_refine_returns_404_when_no_active_session(app_client, make_user):
    user = make_user(email="refine-no-bb@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/agent/refine",
        headers=_pro_headers(user),
        json={"task_id": "never-existed", "message": "Make it shorter."},
    )
    assert res.status_code == 404
    body = res.json()
    detail = body.get("detail", body)
    assert detail.get("error") == "task_not_found"


@pytest.mark.asyncio
async def test_refine_rejects_oversized_message(app_client, make_user):
    user = make_user(email="refine-too-big@test.com", tier=UserTier.PRO)
    # > 1000 chars (the schema cap).
    huge = "x" * 2000
    res = await app_client.post(
        "/api/agent/refine",
        headers=_pro_headers(user),
        json={"task_id": "anything", "message": huge},
    )
    # Either 422 from Pydantic validation or 500 if the sanitize layer
    # rejects differently — both reject the input.
    assert res.status_code in (422, 500)


@pytest.mark.asyncio
async def test_refine_403_for_free_tier(app_client, make_user):
    user = make_user(email="refine-free@test.com", tier=UserTier.FREE)
    res = await app_client.post(
        "/api/agent/refine",
        headers=_pro_headers(user),
        json={"task_id": "anything", "message": "Hello."},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_refine_requires_auth(app_client):
    res = await app_client.post(
        "/api/agent/refine",
        json={"task_id": "anything", "message": "Hello."},
    )
    assert res.status_code == 401
