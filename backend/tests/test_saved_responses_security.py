"""Saved takes: ownership, caps, field bounds, and delete non-oracle."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from arena.core.auth import create_access_token
from arena.db_models import SavedResponse, UserTier


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _payload(**overrides):
    base = {
        "session_id": "sess-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"[:36],
        "agent_id": "agent_1",
        "persona_id": "analyst",
        "persona_name": "The Analyst",
        "persona_color": "#C4956A",
        "prompt": "Should we ship?",
        "one_liner": "Ship the smallest honest slice.",
        "verdict": "Ship it with a rollback plan.",
        "score": 80,
        "confidence": 70,
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_save_requires_plus_or_pro(app_client, make_user):
    user = make_user(email="saved-free@test.com", tier=UserTier.FREE)
    res = await app_client.post(
        "/api/saved",
        headers=_headers(user),
        json=_payload(),
    )
    assert res.status_code == 403, res.text


@pytest.mark.asyncio
async def test_save_and_list_own(app_client, make_user):
    user = make_user(email="saved-plus@test.com", tier=UserTier.PLUS)
    res = await app_client.post(
        "/api/saved",
        headers=_headers(user),
        json=_payload(),
    )
    assert res.status_code == 200, res.text
    sid = res.json()["id"]

    listed = await app_client.get("/api/saved", headers=_headers(user))
    assert listed.status_code == 200
    # Envelope shape — array lives under 'items'.
    body = listed.json()
    ids = {row["id"] for row in body["items"]}
    assert sid in ids


@pytest.mark.asyncio
async def test_delete_foreign_returns_404_not_403(app_client, make_user, db_session):
    """Existence oracle: foreign saved_id must look like not found."""
    owner = make_user(email="saved-owner@test.com", tier=UserTier.PLUS)
    attacker = make_user(email="saved-attacker@test.com", tier=UserTier.PLUS)

    row = SavedResponse(
        user_id=owner.id,
        session_id="sess-owner-1",
        agent_id="agent_1",
        persona_id="analyst",
        persona_name="The Analyst",
        persona_color="#C4956A",
        prompt="Q",
        one_liner="A",
        verdict="V",
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)

    res = await app_client.delete(
        f"/api/saved/{row.id}",
        headers=_headers(attacker),
    )
    assert res.status_code == 404, res.text
    # Owner row still present.
    db_session.refresh(row)
    assert row.id is not None


@pytest.mark.asyncio
async def test_delete_missing_returns_404(app_client, make_user):
    user = make_user(email="saved-miss@test.com", tier=UserTier.PLUS)
    res = await app_client.delete("/api/saved/999999", headers=_headers(user))
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_save_enforces_max_per_user(app_client, make_user, db_session, monkeypatch):
    from arena.routes import saved as saved_routes

    monkeypatch.setattr(saved_routes, "SAVED_MAX_PER_USER", 3)
    user = make_user(email="saved-cap@test.com", tier=UserTier.PLUS)

    for i in range(3):
        r = await app_client.post(
            "/api/saved",
            headers=_headers(user),
            json=_payload(session_id=f"sess-{i:04d}-aaaaaaaaaaaaaaaaaaaa"[:36], agent_id="agent_1"),
        )
        assert r.status_code == 200, r.text

    over = await app_client.post(
        "/api/saved",
        headers=_headers(user),
        json=_payload(session_id="sess-over-aaaaaaaaaaaaaaaaaaaaaa"[:36], agent_id="agent_1"),
    )
    assert over.status_code == 400, over.text
    detail = over.json().get("detail") or over.json()
    if isinstance(detail, dict):
        assert detail.get("error") == "saved_limit_reached"


@pytest.mark.asyncio
async def test_save_is_rate_limited(app_client, make_user, monkeypatch):
    from arena.core import rate_limits

    hits = {"n": 0}
    real_hit = rate_limits.rate_limiter.hit

    def limited_hit(key, *, limit, window_seconds, message):
        if "user:saved_create:" in key:
            hits["n"] += 1
            if hits["n"] > 0:
                from fastapi import HTTPException, status

                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "error": "rate_limit_exceeded",
                        "message": message,
                        "retry_after": 1,
                    },
                )
            return
        return real_hit(key, limit=limit, window_seconds=window_seconds, message=message)

    monkeypatch.setattr(rate_limits.rate_limiter, "hit", limited_hit)

    user = make_user(email="saved-rl@test.com", tier=UserTier.PLUS)
    res = await app_client.post(
        "/api/saved",
        headers=_headers(user),
        json=_payload(),
    )
    assert res.status_code == 429, res.text


def test_saved_request_rejects_overlong_prompt():
    from arena.routes.saved import SavedRequest

    with pytest.raises(ValidationError):
        SavedRequest(**_payload(prompt="x" * 1001))
