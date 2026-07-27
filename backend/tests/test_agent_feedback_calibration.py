"""Integration tests for GET /api/agent/feedback/calibration.

The endpoint surfaces the long-existing ``get_feedback_calibration`` helper,
which had no route. The contract it pins:

- < 5 feedback rows: adjustment is exactly 0, reliable=False, wrong_rate=0.
  We do not act on tiny samples.
- 5-9 rows: adjustment is the integer floor of the helper's formula
  (-(wrong_rate*15) - (partial_rate*7)). reliable=False — caller may apply
  it but should label it as a soft hint.
- >= 10 rows: adjustment same formula, reliable=True.

Agent-tier gated (Plus+add-on, Pro), auth-required, and per-user
rate-limited like the sibling feedback endpoints.
"""

from __future__ import annotations

import uuid

import pytest

from arena.core.auth import create_access_token
from arena.db_models import AnswerFeedback, UserTier


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _seed_feedback(db, *, user_id: int, verdict: str, count: int = 1) -> None:
    """Insert ``count`` AnswerFeedback rows for one user with the given verdict.

    Each row gets a fresh task_id — the (user_id, task_id) unique constraint
    on ``answer_feedback`` prevents duplicates, so seeding identical verdicts
    with identical task_ids would collide.
    """
    for _ in range(count):
        rec = AnswerFeedback(
            user_id=user_id,
            task_id=str(uuid.uuid4()),
            verdict=verdict,
            note=None,
        )
        db.add(rec)
    db.flush()


# ─── Sample-size gates ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_empty_user_returns_zero_adjustment(app_client, make_user, db_session):
    user = make_user(email="fc-empty@test.com", tier=UserTier.PRO)
    res = await app_client.get(
        "/api/agent/feedback/calibration", headers=_headers(user)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["adjustment"] == 0
    assert body["total_feedback"] == 0
    assert body["wrong_rate"] == 0
    assert body["reliable"] is False


@pytest.mark.asyncio
async def test_below_five_feedback_returns_zero_adjustment(
    app_client, make_user, db_session
):
    """A user with 4 verdicts has no signal — adjustment must stay at 0."""
    user = make_user(email="fc-below@test.com", tier=UserTier.PRO)
    _seed_feedback(db_session, user_id=user.id, verdict="wrong", count=4)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/calibration", headers=_headers(user)
    )
    body = res.json()
    assert body["adjustment"] == 0
    assert body["total_feedback"] == 4
    assert body["reliable"] is False


@pytest.mark.asyncio
async def test_five_to_nine_feedback_is_unreliable_but_nonzero(
    app_client, make_user, db_session
):
    """Five wrong verdicts in a row: wrong_rate=1.0 → adjustment = -15."""
    user = make_user(email="fc-soft@test.com", tier=UserTier.PRO)
    _seed_feedback(db_session, user_id=user.id, verdict="wrong", count=5)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/calibration", headers=_headers(user)
    )
    body = res.json()
    assert body["adjustment"] == -15
    assert body["total_feedback"] == 5
    assert body["wrong_rate"] == 100
    assert body["reliable"] is False


@pytest.mark.asyncio
async def test_ten_or_more_feedback_is_reliable(app_client, make_user, db_session):
    """At 10 samples the helper flips the reliable flag to True."""
    user = make_user(email="fc-reliable@test.com", tier=UserTier.PRO)
    _seed_feedback(db_session, user_id=user.id, verdict="wrong", count=6)
    _seed_feedback(db_session, user_id=user.id, verdict="correct", count=4)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/calibration", headers=_headers(user)
    )
    body = res.json()
    assert body["total_feedback"] == 10
    assert body["reliable"] is True
    # 6/10 wrong → wrong_rate=60; 0/10 partial → adjustment = -(60/100*15) - 0
    assert body["wrong_rate"] == 60
    assert body["adjustment"] == -9


# ─── Adjustment formula ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_mixed_verdicts_combine_correctly(app_client, make_user, db_session):
    """6 wrong / 3 partial / 1 correct at 10 rows → -(60*15/100) - (30*7/100) = -11."""
    user = make_user(email="fc-mixed@test.com", tier=UserTier.PRO)
    _seed_feedback(db_session, user_id=user.id, verdict="wrong", count=6)
    _seed_feedback(db_session, user_id=user.id, verdict="partial", count=3)
    _seed_feedback(db_session, user_id=user.id, verdict="correct", count=1)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/calibration", headers=_headers(user)
    )
    body = res.json()
    assert body["reliable"] is True
    # 6/10 = 60% wrong, 3/10 = 30% partial
    # adjustment = -(0.60 * 15) - (0.30 * 7) = -9 - 2.1 = -11.1 → rounds to -11
    assert body["wrong_rate"] == 60
    assert body["adjustment"] == -11


@pytest.mark.asyncio
async def test_all_correct_zero_adjustment(app_client, make_user, db_session):
    """All-correct user → adjustment must be exactly 0 (formula yields 0)."""
    user = make_user(email="fc-correct@test.com", tier=UserTier.PRO)
    _seed_feedback(db_session, user_id=user.id, verdict="correct", count=10)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/calibration", headers=_headers(user)
    )
    body = res.json()
    assert body["adjustment"] == 0
    assert body["wrong_rate"] == 0
    assert body["reliable"] is True


@pytest.mark.asyncio
async def test_partials_alone_produce_mild_penalty(app_client, make_user, db_session):
    """10 partials, no wrongs → -(0*15) - (1.0*7) = -7."""
    user = make_user(email="fc-partial@test.com", tier=UserTier.PRO)
    _seed_feedback(db_session, user_id=user.id, verdict="partial", count=10)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/calibration", headers=_headers(user)
    )
    body = res.json()
    assert body["adjustment"] == -7
    assert body["wrong_rate"] == 0


# ─── Tenant isolation / auth ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_scoped_to_caller(app_client, make_user, db_session):
    """Alice's verdicts must not influence Bob's calibration."""
    alice = make_user(email="fc-alice@test.com", tier=UserTier.PRO)
    bob = make_user(email="fc-bob@test.com", tier=UserTier.PRO)
    _seed_feedback(db_session, user_id=alice.id, verdict="wrong", count=10)
    _seed_feedback(db_session, user_id=bob.id, verdict="correct", count=10)
    db_session.commit()

    res = await app_client.get(
        "/api/agent/feedback/calibration", headers=_headers(alice)
    )
    body = res.json()
    assert body["adjustment"] == -15
    assert body["reliable"] is True

    res = await app_client.get(
        "/api/agent/feedback/calibration", headers=_headers(bob)
    )
    body = res.json()
    assert body["adjustment"] == 0
    assert body["reliable"] is True


@pytest.mark.asyncio
async def test_requires_auth(app_client):
    res = await app_client.get("/api/agent/feedback/calibration")
    assert res.status_code == 401


# ─── Access tier ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_free_user_without_agent_addon_blocked(app_client, make_user):
    """Free / Plus (no add-on) users do not get agent surfaces."""
    user = make_user(email="fc-free@test.com", tier=UserTier.FREE)
    res = await app_client.get(
        "/api/agent/feedback/calibration", headers=_headers(user)
    )
    # _ensure_agent_access denies non-agent tiers; 402 (payment required) or
    # 403 are both acceptable — what matters is that the endpoint isn't a
    # free backdoor into agent-mode data.
    assert res.status_code in (402, 403), res.text


@pytest.mark.asyncio
async def test_pro_user_allowed(app_client, make_user, db_session):
    user = make_user(email="fc-pro@test.com", tier=UserTier.PRO)
    _seed_feedback(db_session, user_id=user.id, verdict="wrong", count=10)
    db_session.commit()
    res = await app_client.get(
        "/api/agent/feedback/calibration", headers=_headers(user)
    )
    assert res.status_code == 200
    assert res.json()["reliable"] is True
