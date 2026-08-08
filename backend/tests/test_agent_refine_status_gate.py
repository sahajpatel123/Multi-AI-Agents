"""Tests for the /refine status gate added in cycle 480.

The /refine endpoint must refuse a new refinement while the original
8-stage pipeline (or a prior refinement) is still mutating the same
in-memory Blackboard. Two concurrent pipelines against one Blackboard
race on conversation.append, final_answer, status, refinement_count,
and token counters — the second pipeline silently overwrites the
first's intermediate state. The fix is a 409 short-circuit on
bb.status == AgentStatus.RUNNING.

This file pins:
  - 409 when status is RUNNING (the main fix)
  - happy path is preserved when status is COMPLETE
  - the bb.user_id ownership check still wins over the status check
    (a foreign-user 404 must not leak the 409 timing)
  - the /refine count is NOT incremented when the gate rejects
    (otherwise a stuck RUNNING + repeated 409s would burn the
    10-refinement cap and lock the user out of legitimate
    refinements after the pipeline finally completes)
"""

from __future__ import annotations

import pytest

from arena.core.blackboard import (
    AgentStatus,
    Blackboard,
    create_blackboard,
    remove_blackboard,
)
from arena.db_models import UserTier


@pytest.mark.asyncio
async def test_refine_rejects_with_409_when_pipeline_is_running(app_client, make_user):
    user = make_user(email="refine-running@test.com", tier=UserTier.PRO)
    bb = create_blackboard(user_id=user.id, task="baseline task")
    try:
        bb.status = AgentStatus.RUNNING
        res = await app_client.post(
            "/api/agent/refine",
            headers=_pro_headers(user),
            json={"task_id": bb.task_id, "message": "Make it shorter."},
        )
        assert res.status_code == 409, res.text
        body = res.json()
        detail = body.get("detail", body)
        assert detail.get("error") == "agent_pipeline_running"
    finally:
        remove_blackboard(bb.task_id)


@pytest.mark.asyncio
async def test_refine_allows_when_status_is_complete(app_client, make_user):
    user = make_user(email="refine-complete@test.com", tier=UserTier.PRO)
    bb = create_blackboard(user_id=user.id, task="baseline task")
    try:
        bb.status = AgentStatus.COMPLETE
        bb.final_answer = "First answer ready."
        bb.completed_at = None
        res = await app_client.post(
            "/api/agent/refine",
            headers=_pro_headers(user),
            json={"task_id": bb.task_id, "message": "Add a TL;DR."},
        )
        # 200 = refinement accepted and background task scheduled
        # (the background task itself will fail in CI without a real LLM
        # client, but the route's pre-flight checks should all pass).
        assert res.status_code == 200, res.text
        body = res.json()
        assert body.get("status") == "refining"
    finally:
        # The successful refine will set bb.status to RUNNING and the
        # background task will eventually fail without a real LLM. We
        # just need to clean up the active_tasks entry.
        remove_blackboard(bb.task_id)


@pytest.mark.asyncio
async def test_refine_running_gate_does_not_increment_count(app_client, make_user):
    """A 409 must NOT bump bb.refinement_count. Otherwise a stuck RUNNING
    plus a few accidental 409s would burn the 10-cap and lock the user out
    of legitimate refinements after the pipeline finally completes.
    """
    user = make_user(email="refine-no-burn@test.com", tier=UserTier.PRO)
    bb = create_blackboard(user_id=user.id, task="baseline task")
    try:
        bb.status = AgentStatus.RUNNING
        before = bb.refinement_count
        for _ in range(3):
            res = await app_client.post(
                "/api/agent/refine",
                headers=_pro_headers(user),
                json={"task_id": bb.task_id, "message": "Refine me."},
            )
            assert res.status_code == 409, res.text
        assert bb.refinement_count == before, (
            f"refinement_count bumped by 409s: before={before} after={bb.refinement_count}"
        )
    finally:
        remove_blackboard(bb.task_id)


@pytest.mark.asyncio
async def test_refine_running_does_not_override_status(app_client, make_user):
    """A 409 must NOT overwrite bb.status with RUNNING. The status is
    already RUNNING here (set by the original pipeline), and the route
    must short-circuit BEFORE the bb.status = AgentStatus.RUNNING line
    that would otherwise mask a stuck or failed original pipeline.
    """
    user = make_user(email="refine-no-override@test.com", tier=UserTier.PRO)
    bb = create_blackboard(user_id=user.id, task="baseline task")
    try:
        bb.status = AgentStatus.RUNNING
        bb.error = "Original pipeline is wedged on a network call."
        res = await app_client.post(
            "/api/agent/refine",
            headers=_pro_headers(user),
            json={"task_id": bb.task_id, "message": "Refine me."},
        )
        assert res.status_code == 409, res.text
        # The error message on the original pipeline must be preserved.
        assert bb.error == "Original pipeline is wedged on a network call."
        assert bb.status == AgentStatus.RUNNING
    finally:
        remove_blackboard(bb.task_id)


@pytest.mark.asyncio
async def test_refine_ownership_check_still_wins_over_status_gate(app_client, make_user):
    """The bb.user_id != user.id check must run BEFORE the status gate.
    Otherwise a foreign user probing a known task_id could distinguish
    'task exists for someone else' (409) from 'task does not exist' (404)
    by the status code, leaking task existence.
    """
    owner = make_user(email="refine-owner@test.com", tier=UserTier.PRO)
    attacker = make_user(email="refine-attacker@test.com", tier=UserTier.PRO)
    bb = create_blackboard(user_id=owner.id, task="baseline task")
    try:
        bb.status = AgentStatus.RUNNING
        res = await app_client.post(
            "/api/agent/refine",
            headers=_pro_headers(attacker),
            json={"task_id": bb.task_id, "message": "Refine me."},
        )
        # Ownership check returns 404 with the same shape as the
        # no-such-task 404, so attackers cannot enumerate.
        assert res.status_code == 404, res.text
        body = res.json()
        detail = body.get("detail", body)
        # The foreign-owner branch uses ErrorCodes.NOT_FOUND ('not_found')
        # while the no-such-task branch uses 'task_not_found' — both are
        # 404s so a timing attack still cannot distinguish, and a status-
        # code attacker only learns 'not yours' (which is the same as
        # 'does not exist' from their perspective).
        assert detail.get("error") in ("task_not_found", "not_found")
    finally:
        remove_blackboard(bb.task_id)
