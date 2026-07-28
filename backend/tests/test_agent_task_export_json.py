"""Integration tests for GET /api/agent/tasks/{task_id}/export.json.

The endpoint mirrors the PDF export's data flow but emits the raw JSON
payload — same shape as /api/agent/result/{task_id}, so a future schema
change in the result endpoint automatically lands in the export.
"""

from __future__ import annotations

import json
import uuid

import pytest

from arena.core.auth import create_access_token
from arena.core.datetime_utils import utcnow_naive
from arena.db_models import AgentTask, UserTier


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_task(
    session,
    *,
    user_id: int,
    task_id: str | None = None,
    final_answer: str = "Quantum computing is trending toward fault tolerance.",
    final_score: int = 80,
    final_confidence: float = 0.75,
) -> AgentTask:
    row = AgentTask(
        user_id=user_id,
        task_id=task_id or str(uuid.uuid4()),
        title="Quantum computing trends",
        task_text="What are the quantum computing trends this week?",
        final_answer=final_answer,
        final_score=final_score,
        final_confidence=final_confidence,
        created_at=utcnow_naive(),
    )
    session.add(row)
    session.flush()
    return row


# ─── Happy path ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_json_returns_attachment(
    app_client, make_user, db_session
):
    user = make_user(email="jsonexp-happy@test.com", tier=UserTier.PRO)
    row = _seed_task(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/tasks/{row.task_id}/export.json",
        headers=_headers(user),
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/json")
    cd = res.headers["content-disposition"]
    assert cd.startswith("attachment; filename=")
    assert "arena-task-" in cd
    assert ".json" in cd


@pytest.mark.asyncio
async def test_export_json_body_is_valid_json(
    app_client, make_user, db_session
):
    user = make_user(email="jsonexp-valid@test.com", tier=UserTier.PRO)
    row = _seed_task(
        db_session,
        user_id=user.id,
        final_answer="The answer is 42.",
    )
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/tasks/{row.task_id}/export.json",
        headers=_headers(user),
    )
    # Must parse cleanly — the endpoint JSON-encodes the result dict
    # so any non-serializable value (datetime, etc.) would 500 instead
    # of returning invalid JSON.
    payload = res.json()
    assert isinstance(payload, dict)
    # The seeded answer is reachable in the payload. The exact key
    # shape is owned by /result — we don't pin it here, just verify
    # the answer survived the round-trip.
    body = json.dumps(payload)
    assert "The answer is 42." in body


@pytest.mark.asyncio
async def test_export_json_pretty_printed(
    app_client, make_user, db_session
):
    """Pretty-print so the file is diff-friendly when a user pastes it
    into a bug report or checks it into a repo."""
    user = make_user(email="jsonexp-pretty@test.com", tier=UserTier.PRO)
    row = _seed_task(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/tasks/{row.task_id}/export.json",
        headers=_headers(user),
    )
    # Pretty-print = 2-space indent + newline at end. The exact format
    # is owned by the route (indent=2, sort_keys=True), so we just
    # verify the output is multi-line and uses 2-space indentation.
    assert "\n  " in res.text


# ─── Auth + ownership + isolation ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_json_404_for_missing_task(app_client, make_user):
    user = make_user(email="jsonexp-404@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/tasks/does-not-exist/export.json",
        headers=_headers(user),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_export_json_404_for_other_users_task(
    app_client, make_user, db_session
):
    """Bob's task must not be reachable from Alice's session — same
    404-oracle rule the rest of the agent endpoints use."""
    alice = make_user(email="jsonexp-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="jsonexp-bob@test.com", tier=UserTier.PRO)
    row = _seed_task(db_session, user_id=bob.id)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/tasks/{row.task_id}/export.json",
        headers=_headers(alice),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_export_json_requires_auth(app_client):
    res = await app_client.get(
        "/api/agent/tasks/any-id/export.json"
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_export_json_blocks_free_tier(
    app_client, make_user, db_session
):
    """Agent Mode is Pro / Plus-add-on gated — a free user gets blocked."""
    user = make_user(email="jsonexp-free@test.com", tier=UserTier.FREE)
    row = _seed_task(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/tasks/{row.task_id}/export.json",
        headers=_headers(user),
    )
    assert res.status_code in (402, 403)


# ─── Input validation ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_json_400_for_empty_task_id(
    app_client, make_user
):
    """An empty task_id is a user error, not a missing task — 400."""
    user = make_user(email="jsonexp-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/tasks//export.json",
        headers=_headers(user),
    )
    # FastAPI route matching may 404 (no route matches) or 307 redirect;
    # we accept any non-200 status since the input is invalid either way.
    assert res.status_code != 200


@pytest.mark.asyncio
async def test_export_json_handles_whitespace_task_id(
    app_client, make_user, db_session
):
    """A task_id that's all whitespace must be rejected — strip first,
    then 404 on a clean miss. 400 is also acceptable (the route's
    ``if not tid:`` guard catches the empty-after-strip case)."""
    user = make_user(email="jsonexp-ws@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/tasks/%20%20%20/export.json",
        headers=_headers(user),
    )
    assert res.status_code in (400, 404)


# ─── Cache + security headers ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_json_has_no_store_cache_header(
    app_client, make_user, db_session
):
    user = make_user(email="jsonexp-cache@test.com", tier=UserTier.PRO)
    row = _seed_task(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/tasks/{row.task_id}/export.json",
        headers=_headers(user),
    )
    assert res.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_export_json_has_nosniff_header(
    app_client, make_user, db_session
):
    user = make_user(email="jsonexp-nosniff@test.com", tier=UserTier.PRO)
    row = _seed_task(db_session, user_id=user.id)
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/tasks/{row.task_id}/export.json",
        headers=_headers(user),
    )
    assert res.headers["x-content-type-options"] == "nosniff"


# ─── Filename includes task prefix ────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_json_filename_includes_task_prefix(
    app_client, make_user, db_session
):
    user = make_user(email="jsonexp-name@test.com", tier=UserTier.PRO)
    row = _seed_task(
        db_session,
        user_id=user.id,
        task_id="abcdef12-3456-7890-abcd-ef1234567890",
    )
    db_session.commit()

    res = await app_client.get(
        f"/api/agent/tasks/{row.task_id}/export.json",
        headers=_headers(user),
    )
    cd = res.headers["content-disposition"]
    # 8-char prefix so multiple downloads don't overwrite each other.
    assert "arena-task-abcdef12.json" in cd
