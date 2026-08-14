"""Integration tests for public Agent report share links.

Covers the create/revoke pair under /api/agent/tasks/{id}/share and the
public read under /api/public/agent/{token}. The contract pinned here:

- Only the task owner can share, and only completed reports are shareable.
- Creating is idempotent: repeat calls return the same token/link.
- Revoking clears the token, so the public link 404s, and the task can be
  re-shared with a fresh token.
- The public payload is hand-built and sanitized — no user id, task id,
  feedback, or internal report fields ever appear.
"""

from __future__ import annotations

import uuid

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AgentTask, UserTier


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_task(
    db,
    *,
    user_id: int,
    task_id: str | None = None,
    completed: bool = True,
) -> AgentTask:
    row = AgentTask(
        user_id=user_id,
        task_id=task_id or f"task-{uuid.uuid4()}",
        title="Shareable research",
        task_text="Is this report shareable?",
        final_answer="Yes, with a token and a public page." if completed else None,
        final_score=84,
        final_confidence=0.75,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@pytest.mark.asyncio
async def test_share_completed_task_returns_token_and_link(
    app_client, make_user, db_session
):
    user = make_user(email="share-ok@test.com", tier=UserTier.PRO)
    task = _seed_task(db_session, user_id=user.id)

    res = await app_client.post(
        f"/api/agent/tasks/{task.task_id}/share", headers=_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["share_token"]
    assert body["share_url"] == f"/share/agent/{body['share_token']}"


@pytest.mark.asyncio
async def test_share_is_idempotent(app_client, make_user, db_session):
    user = make_user(email="share-idem@test.com", tier=UserTier.PRO)
    task = _seed_task(db_session, user_id=user.id)

    first = await app_client.post(
        f"/api/agent/tasks/{task.task_id}/share", headers=_headers(user)
    )
    second = await app_client.post(
        f"/api/agent/tasks/{task.task_id}/share", headers=_headers(user)
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["share_token"] == second.json()["share_token"]


@pytest.mark.asyncio
async def test_share_requires_agent_access(app_client, make_user, db_session):
    user = make_user(email="share-free@test.com", tier=UserTier.FREE)
    task = _seed_task(db_session, user_id=user.id)

    res = await app_client.post(
        f"/api/agent/tasks/{task.task_id}/share", headers=_headers(user)
    )
    assert res.status_code == 403
    assert res.json()["detail"]["error"] == "agent_not_available"


@pytest.mark.asyncio
async def test_share_rejects_incomplete_task(app_client, make_user, db_session):
    user = make_user(email="share-wip@test.com", tier=UserTier.PRO)
    task = _seed_task(db_session, user_id=user.id, completed=False)

    res = await app_client.post(
        f"/api/agent/tasks/{task.task_id}/share", headers=_headers(user)
    )
    assert res.status_code == 409
    assert res.json()["detail"]["error"] == "task_not_complete"


@pytest.mark.asyncio
async def test_share_requires_owner(app_client, make_user, db_session):
    owner = make_user(email="share-owner@test.com", tier=UserTier.PRO)
    other = make_user(email="share-other@test.com", tier=UserTier.PRO)
    task = _seed_task(db_session, user_id=owner.id)

    res = await app_client.post(
        f"/api/agent/tasks/{task.task_id}/share", headers=_headers(other)
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_task_reads_reflect_share_state(app_client, make_user, db_session):
    """Owned task reads expose is_shared/share_url so the UI can restore
    the 'Stop sharing' affordance after a reload or a later session."""
    user = make_user(email="share-state@test.com", tier=UserTier.PRO)
    task = _seed_task(db_session, user_id=user.id)
    headers = _headers(user)

    detail_res = await app_client.get(
        f"/api/agent/tasks/{task.task_id}/detail", headers=headers
    )
    assert detail_res.status_code == 200
    assert detail_res.json()["task"]["is_shared"] is False
    assert detail_res.json()["task"]["share_url"] is None

    created = await app_client.post(
        f"/api/agent/tasks/{task.task_id}/share", headers=headers
    )
    token = created.json()["share_token"]
    assert token

    shared = await app_client.get(
        f"/api/agent/tasks/{task.task_id}/detail", headers=headers
    )
    assert shared.status_code == 200
    assert shared.json()["task"]["is_shared"] is True
    assert shared.json()["task"]["share_url"] == f"/share/agent/{token}"

    revoked = await app_client.delete(
        f"/api/agent/tasks/{task.task_id}/share", headers=headers
    )
    assert revoked.status_code == 200

    after = await app_client.get(
        f"/api/agent/tasks/{task.task_id}/detail", headers=headers
    )
    assert after.status_code == 200
    assert after.json()["task"]["is_shared"] is False
    assert after.json()["task"]["share_url"] is None


@pytest.mark.asyncio
async def test_result_and_saved_reads_carry_share_state(
    app_client, make_user, db_session
):
    user = make_user(email="share-reads@test.com", tier=UserTier.PRO)
    task = _seed_task(db_session, user_id=user.id)
    headers = _headers(user)

    for path in ("result", "saved"):
        res = await app_client.get(f"/api/agent/{path}/{task.task_id}", headers=headers)
        assert res.status_code == 200
        body = res.json()
        assert body["is_shared"] is False
        assert body["share_url"] is None


@pytest.mark.asyncio
async def test_share_retries_fresh_token_on_unique_collision(
    app_client, make_user, db_session, monkeypatch
):
    """A generated token that collides with another row must not 500: the
    endpoint rolls back and retries with a fresh token."""
    user = make_user(email="share-collide@test.com", tier=UserTier.PRO)
    headers = _headers(user)
    occupied = _seed_task(db_session, user_id=user.id)
    occupied.share_token = "collision-token"
    db_session.commit()
    task = _seed_task(db_session, user_id=user.id)

    calls = {"n": 0}

    def fake_token_urlsafe(_nbytes: int) -> str:
        calls["n"] += 1
        return "collision-token" if calls["n"] == 1 else "fresh-token"

    monkeypatch.setattr("secrets.token_urlsafe", fake_token_urlsafe)

    res = await app_client.post(
        f"/api/agent/tasks/{task.task_id}/share", headers=headers
    )
    assert res.status_code == 200
    assert res.json()["share_token"] == "fresh-token"
    assert calls["n"] == 2
    assert (await app_client.get("/api/public/agent/fresh-token")).status_code == 200
    assert (await app_client.get("/api/public/agent/collision-token")).status_code == 200


@pytest.mark.asyncio
async def test_public_read_returns_sanitized_payload(
    app_client, make_user, db_session
):
    user = make_user(email="share-pub@test.com", tier=UserTier.PRO)
    task = _seed_task(db_session, user_id=user.id)

    created = await app_client.post(
        f"/api/agent/tasks/{task.task_id}/share", headers=_headers(user)
    )
    token = created.json()["share_token"]

    res = await app_client.get(f"/api/public/agent/{token}")
    assert res.status_code == 200
    body = res.json()
    assert body["token"] == token
    assert body["title"] == "Shareable research"
    assert body["question"] == "Is this report shareable?"
    assert body["answer"] == "Yes, with a token and a public page."
    assert body["final_score"] == 84
    assert body["final_confidence"] == 0.75
    assert body["created_at"]
    assert body["shared_at"]
    for hidden in ("user_id", "task_id", "insight_report", "feedback", "is_live"):
        assert hidden not in body


@pytest.mark.asyncio
async def test_public_read_404_for_unknown_token(app_client):
    res = await app_client.get("/api/public/agent/not-a-real-token")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_revoke_kills_link_and_allows_reshare(app_client, make_user, db_session):
    user = make_user(email="share-revoke@test.com", tier=UserTier.PRO)
    task = _seed_task(db_session, user_id=user.id)

    created = await app_client.post(
        f"/api/agent/tasks/{task.task_id}/share", headers=_headers(user)
    )
    token = created.json()["share_token"]
    assert (await app_client.get(f"/api/public/agent/{token}")).status_code == 200

    revoked = await app_client.delete(
        f"/api/agent/tasks/{task.task_id}/share", headers=_headers(user)
    )
    assert revoked.status_code == 200
    assert revoked.json()["revoked"] is True
    assert (await app_client.get(f"/api/public/agent/{token}")).status_code == 404

    reshared = await app_client.post(
        f"/api/agent/tasks/{task.task_id}/share", headers=_headers(user)
    )
    assert reshared.status_code == 200
    new_token = reshared.json()["share_token"]
    assert new_token != token
    assert (await app_client.get(f"/api/public/agent/{new_token}")).status_code == 200
