"""Loyalty scheduler hardening: per-user isolation + failure backoff."""

from __future__ import annotations
from arena.core.datetime_utils import utcnow_naive

from datetime import datetime, timedelta, timezone

import pytest

import arena.core.loyalty_scheduler as loyalty


def _make_user(*, id: int = 1, loyalty_resume_at=None, attempts: int = 0, next_attempt_at=None):
    return type(
        "User",
        (),
        {
            "id": id,
            "loyalty_reward_active": True,
            "loyalty_free_months_remaining": 0,
            "loyalty_resume_at": loyalty_resume_at,
            "loyalty_resume_attempts": attempts,
            "loyalty_resume_next_attempt_at": next_attempt_at,
            "subscription_id": 1,
            "consecutive_payments": 2,
        },
    )()


def test_user_is_due_respects_resume_at_and_backoff():
    now = utcnow_naive()
    past = now - timedelta(hours=1)
    future = now + timedelta(hours=1)
    assert loyalty._user_is_due(_make_user(id=1, loyalty_resume_at=past), now) is True
    assert loyalty._user_is_due(_make_user(id=2, loyalty_resume_at=future), now) is False

    # Backoff still active even if resume_at is past: not due.
    assert (
        loyalty._user_is_due(
            _make_user(id=3, loyalty_resume_at=past, next_attempt_at=now + timedelta(minutes=15)),
            now,
        )
        is False
    )

    # Backoff elapsed: due.
    assert (
        loyalty._user_is_due(
            _make_user(id=4, loyalty_resume_at=past, next_attempt_at=now - timedelta(minutes=1)),
            now,
        )
        is True
    )


def test_next_retry_after_follows_backoff_ladder():
    now = utcnow_naive()
    # _RETRY_BACKOFF_MINUTES is indexed by failure count: index 0 = 5m
    # after the first failure, index 1 = 30m after the second, etc.
    # 1 failure -> 30 min (index 1)
    delta_1 = (loyalty._next_retry_after(1) - now).total_seconds() / 60
    assert 29 <= delta_1 <= 31
    # 2 failures -> 120 min (index 2)
    delta_2 = (loyalty._next_retry_after(2) - now).total_seconds() / 60
    assert 119 <= delta_2 <= 121
    # 99 failures -> caps at 24h
    delta_99 = (loyalty._next_retry_after(99) - now).total_seconds() / 60
    assert 1439 <= delta_99 <= 1441


class _FakeQuery:
    def __init__(self, payload):
        self._payload = payload

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self._payload.get("first")

    def all(self):
        return self._payload.get("all", [])


class _FakeSession:
    def __init__(self, *, users, subscription):
        self._users = users
        self._subscription = subscription
        self.commits = 0
        self.rollbacks = 0
        self.added: list = []

    def query(self, _model):
        if _model.__name__ == "Subscription":
            return _FakeQuery({"first": self._subscription})
        return _FakeQuery({"all": self._users})

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


@pytest.mark.asyncio
async def test_check_loyalty_resumes_isolates_per_user_failure(monkeypatch):
    """One Razorpay failure must not block another user's success."""

    class FakeSubscriptions:
        def __init__(self, fail_ids: set[str]):
            self.fail_ids = fail_ids
            self.calls: list[str] = []

        def resume(self, rzp_id: str, payload: dict):
            self.calls.append(rzp_id)
            if rzp_id in self.fail_ids:
                raise RuntimeError("simulated 502")
            return {"id": rzp_id, "status": "active"}

    fake = FakeSubscriptions(fail_ids={"rzp-bad"})
    monkeypatch.setattr(
        loyalty,
        "_get_razorpay_client",
        lambda: type("C", (), {"subscription": fake})(),
    )

    # Direct the two .first() lookups based on the requested id.
    next_sub_id = {"n": 0}
    subs_by_id = {
        1: type("Sub", (), {"razorpay_subscription_id": "rzp-good"})(),
        2: type("Sub", (), {"razorpay_subscription_id": "rzp-bad"})(),
    }

    class SwitchingSession(_FakeSession):
        def query(self, model):
            if model.__name__ == "Subscription":
                n = next_sub_id["n"]
                next_sub_id["n"] += 1
                return _FakeQuery({"first": subs_by_id.get(n + 1)})
            return super().query(model)

    past = utcnow_naive() - timedelta(hours=1)
    good = _make_user(id=1, loyalty_resume_at=past)
    bad = _make_user(id=2, loyalty_resume_at=past)
    session = SwitchingSession(users=[good, bad], subscription=None)

    await loyalty.check_loyalty_resumes(session)

    assert good.loyalty_reward_active is False
    assert good.consecutive_payments == 0
    assert bad.loyalty_reward_active is True
    assert bad.loyalty_resume_attempts == 1
    assert bad.loyalty_resume_next_attempt_at is not None
    assert sorted(fake.calls) == ["rzp-bad", "rzp-good"]


@pytest.mark.asyncio
async def test_check_loyalty_resumes_clears_state_when_subscription_missing(monkeypatch):
    """If Razorpay id is gone, the loyalty state must drop to neutral so
    the user is not stuck paying for a paused schedule indefinitely."""
    monkeypatch.setattr(loyalty, "_get_razorpay_client", lambda: object())

    past = utcnow_naive() - timedelta(hours=1)
    user = _make_user(
        id=11,
        loyalty_resume_at=past,
        attempts=3,
        next_attempt_at=past + timedelta(minutes=10),
    )
    session = _FakeSession(users=[user], subscription=None)

    await loyalty.check_loyalty_resumes(session)

    assert user.loyalty_reward_active is False
    assert user.loyalty_resume_at is None
    assert user.loyalty_resume_attempts == 0
    assert user.loyalty_resume_next_attempt_at is None