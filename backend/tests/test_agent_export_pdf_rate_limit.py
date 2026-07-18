"""PDF export routes must be per-user rate-limited (CPU/memory bound)."""

from __future__ import annotations

from collections import deque
import time

import pytest

from arena.core.auth import create_access_token
from arena.db_models import UserTier


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


@pytest.mark.asyncio
async def test_task_pdf_export_rate_limited(app_client, make_user):
    from arena.core import rate_limits as _rl

    if hasattr(_rl.rate_limiter, "_events"):
        _rl.rate_limiter._events.clear()

    user = make_user(email="pdf-rl-task@test.com", tier=UserTier.PRO)
    key = f"user:agent_task_export_pdf:{user.id}"
    _rl.rate_limiter._events[key] = deque([time.time()] * 30)

    res = await app_client.get(
        "/api/agent/tasks/any-id/export/pdf",
        headers=_headers(user),
    )
    assert res.status_code == 429, res.text[:300]
    detail = res.json().get("detail", {})
    assert detail.get("error") == "rate_limit_exceeded"
    _rl.rate_limiter._events.clear()


@pytest.mark.asyncio
async def test_orch_pdf_export_rate_limited(app_client, make_user):
    from arena.core import rate_limits as _rl

    if hasattr(_rl.rate_limiter, "_events"):
        _rl.rate_limiter._events.clear()

    user = make_user(email="pdf-rl-orch@test.com", tier=UserTier.PRO)
    key = f"user:agent_orch_export_pdf:{user.id}"
    _rl.rate_limiter._events[key] = deque([time.time()] * 30)

    res = await app_client.get(
        "/api/agent/orchestrate/any-id/export/pdf",
        headers=_headers(user),
    )
    assert res.status_code == 429, res.text[:300]
    detail = res.json().get("detail", {})
    assert detail.get("error") == "rate_limit_exceeded"
    _rl.rate_limiter._events.clear()
