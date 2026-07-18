"""Integration tests for POST /api/agent/tasks/{task_id}/feedback (per-task accuracy feedback)."""

from __future__ import annotations

import pytest

from arena.db_models import AgentTask, UserTier



def _seed(session, *, user_id: int, task_id: str):
    row = AgentTask(
        user_id=user_id,
        task_id=task_id,
        task_text="Accuracy question.",
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.asyncio
async def test_post_feedback_sets_correct_verdict(app_client, make_user, db_session):
    user = make_user(email="ptf-correct@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="ptf-1")
    db_session.commit()

    res = await app_client.post(
        "/api/agent/tasks/ptf-1/feedback",
        headers=_pro_headers(user),
        json={"verdict": "correct", "note": "Spot on"},
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_post_feedback_accepts_each_valid_verdict(app_client, make_user, db_session):
    """The per-task accuracy route uses the {correct, partial, wrong} set
    (vs /feedback which uses accurate/partial/inaccurate). Pin each one."""
    user = make_user(email="ptf-all@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="ptf-all")
    db_session.commit()

    for verdict in ("correct", "partial", "wrong"):
        res = await app_client.post(
            "/api/agent/tasks/ptf-all/feedback",
            headers=_pro_headers(user),
            json={"verdict": verdict},
        )
        assert res.status_code == 200, f"{verdict} should be accepted; got {res.status_code}"


@pytest.mark.asyncio
async def test_post_feedback_rejects_invalid_verdict(app_client, make_user, db_session):
    user = make_user(email="ptf-bad@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="ptf-bad")
    db_session.commit()

    res = await app_client.post(
        "/api/agent/tasks/ptf-bad/feedback",
        headers=_pro_headers(user),
        json={"verdict": "accurate"},  # wrong set — this is per-task accuracy
    )
    assert res.status_code == 400
    assert "Invalid" in res.text


@pytest.mark.asyncio
async def test_post_feedback_404_for_other_users_task(app_client, make_user, db_session):
    alice = make_user(email="ptf-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="ptf-bob@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=bob.id, task_id="bob-ptf")
    db_session.commit()

    res = await app_client.post(
        "/api/agent/tasks/bob-ptf/feedback",
        headers=_pro_headers(alice),
        json={"verdict": "correct"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_post_feedback_404_for_missing_task(app_client, make_user):
    user = make_user(email="ptf-missing@test.com", tier=UserTier.PRO)
    res = await app_client.post(
        "/api/agent/tasks/missing/feedback",
        headers=_pro_headers(user),
        json={"verdict": "correct"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_post_feedback_403_for_free_tier(app_client, make_user, db_session):
    user = make_user(email="ptf-free@test.com", tier=UserTier.FREE)
    _seed(db_session, user_id=user.id, task_id="ptf-free")
    db_session.commit()

    res = await app_client.post(
        "/api/agent/tasks/ptf-free/feedback",
        headers=_pro_headers(user),
        json={"verdict": "correct"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_post_feedback_requires_auth(app_client, make_user, db_session):
    user = make_user(email="ptf-anon@test.com", tier=UserTier.PRO)
    _seed(db_session, user_id=user.id, task_id="ptf-anon")
    db_session.commit()

    res = await app_client.post(
        "/api/agent/tasks/ptf-anon/feedback",
        json={"verdict": "correct"},
    )
    assert res.status_code == 401
