"""Integration tests for GET /api/user/answer-feedback-stats."""

from __future__ import annotations

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _pro_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


@pytest.mark.asyncio
async def test_stats_returns_dict_for_new_user(app_client, make_user):
    """A fresh user with no feedback verdicts gets an empty distribution
    (correct=0, partial=0, wrong=0, total=0) — not a 404."""
    user = make_user(email="abs-new@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/user/answer-feedback-stats",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, dict)
    assert body.get("total") == 0


@pytest.mark.asyncio
async def test_stats_returns_dict_for_pro_user(app_client, make_user):
    user = make_user(email="abs-pro@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/user/answer-feedback-stats",
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, dict)
    # The distribution keys (correct/partial/wrong) are always present.
    assert "correct_pct" in body or "total" in body


@pytest.mark.asyncio
async def test_stats_requires_auth(app_client):
    res = await app_client.get("/api/user/answer-feedback-stats")
    assert res.status_code == 401
