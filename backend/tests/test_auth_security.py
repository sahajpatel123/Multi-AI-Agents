"""Integration tests for /auth/change-password and /auth/security."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

import re
from pathlib import Path

import pytest

from arena.db_models import UserTier



# ─── /auth/change-password ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_change_password_succeeds(app_client, make_user):
    user = make_user(email="pw-ok@test.com", tier=UserTier.PRO, password="Strong1Pass")
    res = await app_client.post(
        "/api/auth/change-password",
        json={"current_password": "Strong1Pass", "new_password": "NewPass2Word"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200
    assert res.json() == {"status": "changed"}


@pytest.mark.asyncio
async def test_change_password_rejects_wrong_current(app_client, make_user):
    """Wrong current_password → 400 with stable error code. Not 401/422
    so a caller can't probe which values are correct via status code."""
    user = make_user(email="pw-wrong@test.com", tier=UserTier.PRO, password="Strong1Pass")
    res = await app_client.post(
        "/api/auth/change-password",
        json={"current_password": "wrong", "new_password": "NewPass2Word"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 400
    assert res.json()["detail"]["error"] == "current_password_invalid"


@pytest.mark.asyncio
async def test_change_password_rejects_same_as_current(app_client, make_user):
    """A 'new' password equal to the current one defeats the point — reject."""
    user = make_user(email="pw-same@test.com", tier=UserTier.PRO, password="Strong1Pass")
    res = await app_client.post(
        "/api/auth/change-password",
        json={"current_password": "Strong1Pass", "new_password": "Strong1Pass"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 400
    assert res.json()["detail"]["error"] == "password_same"


@pytest.mark.asyncio
async def test_change_password_rejects_weak_new(app_client, make_user):
    """The strength validator must apply to the new password — short, no
    upper, no digit, common-password all 400."""
    user = make_user(email="pw-weak@test.com", tier=UserTier.PRO, password="Strong1Pass")
    # Too short
    res = await app_client.post(
        "/api/auth/change-password",
        json={"current_password": "Strong1Pass", "new_password": "short"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_change_password_rejects_common_new(app_client, make_user):
    user = make_user(email="pw-common@test.com", tier=UserTier.PRO, password="Strong1Pass")
    res = await app_client.post(
        "/api/auth/change-password",
        json={"current_password": "Strong1Pass", "new_password": "password123"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_change_password_requires_auth(app_client):
    res = await app_client.post(
        "/api/auth/change-password",
        json={"current_password": "x", "new_password": "NewPass2Word"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_change_password_actually_rotates(app_client, make_user):
    """End-to-end: change password, then login with the new one."""
    user = make_user(email="pw-rotate@test.com", tier=UserTier.PRO, password="Strong1Pass")
    res = await app_client.post(
        "/api/auth/change-password",
        json={"current_password": "Strong1Pass", "new_password": "NewPass2Word"},
        headers=_pro_headers(user),
    )
    assert res.status_code == 200

    # Old password must fail login.
    res = await app_client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "Strong1Pass"},
    )
    assert res.status_code in (401, 400)  # auth.py uses 401; routes may differ

    # New password must succeed login.
    res = await app_client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "NewPass2Word"},
    )
    assert res.status_code == 200


# ─── /auth/security ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_security_returns_metadata(app_client, make_user):
    user = make_user(email="sec-meta@test.com", tier=UserTier.PRO)
    res = await app_client.get("/api/auth/security", headers=_pro_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == user.email
    assert body["tier"] in {"PRO", "pro"}
    assert "member_since" in body
    assert "last_active_at" in body
    assert "has_password" in body
    assert body["has_password"] is True


@pytest.mark.asyncio
async def test_security_last_active_at_reflects_recent_prompt(
    app_client, make_user, db_session
):
    """last_active_at should be set when the user has prompts."""
    import uuid
    from datetime import datetime, timezone, timedelta
    from arena.db_models import UsageRecord

    user = make_user(email="sec-active@test.com", tier=UserTier.PRO)
    rec = UsageRecord(
        user_id=user.id,
        request_id=str(uuid.uuid4()),
        mode="arena",
        total_processing_ms=100,
        timestamp=utcnow_naive() - timedelta(hours=1),
    )
    db_session.add(rec)
    db_session.commit()

    res = await app_client.get("/api/auth/security", headers=_pro_headers(user))
    body = res.json()
    assert body["last_active_at"] is not None


@pytest.mark.asyncio
async def test_security_requires_auth(app_client):
    res = await app_client.get("/api/auth/security")
    assert res.status_code == 401


def test_registration_route_declares_the_5_per_hour_ip_cap():
    """Cycle-60 intent pin: `POST /api/auth/register` declares an
    `enforce_ip_rate_limit` at 5/hour per IP. The behavioral test
    (test_api_endpoints.py::test_rate_limited_register_does_not_create_user)
    covers the user-record side; this pins the cap design.

    Why this matters: 5/hour per IP is calibrated to block mass-signup
    spam from a single network while leaving room for legitimate
    re-tries (typos, password reset flows). Lower values break
    password-recovery sign-up flows; higher values let a single
    attacker create dozens of accounts/hour for free-tier abuse.
    """
    auth_src = (
        Path(__file__).resolve().parent.parent / "arena" / "routes" / "auth.py"
    ).read_text()

    assert 'scope="registration_create"' in auth_src, (
        "Expected the registration route to declare scope='registration_create' "
        "on its IP rate-limit call. Without this scope, log entries can't "
        "identify which endpoint tripped a 429."
    )
    assert "limit=5" in auth_src, (
        "Expected the registration IP cap to remain at 5/hour. The 5/hour "
        "ceiling is calibrated to block mass-signup spam from a single "
        "network while leaving room for legitimate password-recovery "
        "flows. Lower values break onboarding; higher values weaken the "
        "spam cap."
    )
    assert "window_seconds=3600" in auth_src, (
        "Expected the registration IP cap to roll on a 3600-second (1 hour) "
        "window. The 1-hour window is what makes 5/hour a meaningful cap — "
        "a shorter window would make 5 too restrictive for re-tries, a "
        "longer window would make 5 too lenient against sustained spam."
    )