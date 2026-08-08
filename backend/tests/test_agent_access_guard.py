"""Regression tests for ``_ensure_agent_access`` tier gate.

The guard sits in front of every agent-mode endpoint — history, tasks,
detail, live updates. It MUST:

  - Allow Pro through unconditionally.
  - Allow Plus through ONLY when the Agent add-on is active OR cancelling
    (cancelling means the user paid for the period and gets to keep using
    it until the period rolls over — same model as the main subscription).
  - Reject Free and Plus-without-addon with a 403 envelope that includes
    an ``upgrade_required`` hint so the frontend can deep-link to the
    upgrade surface.
  - Reject a deleted / missing user with 401 (NOT 403), so the message
    reflects the actual state — the user is gone, not unauthorized.

A refactor that drops the ``upgrade_required`` field or changes the
status code would break the upsell surface silently.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from arena.core.tier_config import UserTier
from arena.routes.agent import _ensure_agent_access


class _StubUserResponse:
    def __init__(self, id: int):
        self.id = id


class _StubUserRow:
    """Quacks like the User ORM row the guard expects."""

    def __init__(self, *, id: int, tier: str, agent_addon_active: bool = False,
                 agent_addon_cancelling: bool = False):
        self.id = id
        self.tier = tier
        self.agent_addon_active = agent_addon_active
        self.agent_addon_cancelling = agent_addon_cancelling


def _patch_user_lookup(monkeypatch, row):
    """Patch the guard's `db.query(User).filter(...).first()` to return ``row``."""
    class _Query:
        def filter(self, *args, **kwargs):
            return self

        def first(self):
            return row

    def _fake_query(model):
        return _Query()

    monkeypatch.setattr("arena.routes.agent.User", object())
    monkeypatch.setattr("arena.routes.agent.db.query", lambda *a, **kw: _Query())


@pytest.fixture
def db_session():
    """Dummy session — the guard only calls ``.query(...).first()``."""
    class _DummySession:
        class _Query:
            def __init__(self, return_value):
                self._return_value = return_value

            def filter(self, *args, **kwargs):
                return self

            def first(self):
                return self._return_value

        def query(self, *args, **kwargs):
            # The test sets the desired return via the override below.
            return self._Query(self._next_return)

        def set_return(self, value):
            self._next_return = value

    s = _DummySession()
    s.set_return(None)
    return s


def test_pro_user_passes(db_session):
    db_session.set_return(_StubUserRow(id=1, tier=UserTier.PRO))
    # No exception → pass.
    _ensure_agent_access(_StubUserResponse(id=1), db_session)


def test_plus_with_active_addon_passes(db_session):
    db_session.set_return(
        _StubUserRow(id=2, tier=UserTier.PLUS, agent_addon_active=True)
    )
    _ensure_agent_access(_StubUserResponse(id=2), db_session)


def test_plus_with_cancelling_addon_passes(db_session):
    """User paid through the current period; cancelling means they keep
    access until the rollover. Same model as the main subscription."""
    db_session.set_return(
        _StubUserRow(id=3, tier=UserTier.PLUS, agent_addon_cancelling=True)
    )
    _ensure_agent_access(_StubUserResponse(id=3), db_session)


def test_plus_without_addon_is_rejected_with_403(db_session):
    db_session.set_return(_StubUserRow(id=4, tier=UserTier.PLUS))

    with pytest.raises(HTTPException) as exc:
        _ensure_agent_access(_StubUserResponse(id=4), db_session)

    assert exc.value.status_code == 403
    detail = exc.value.detail
    assert detail["error"] == "agent_not_available"
    # The frontend deep-links to /upgrade from this hint — never drop it.
    assert detail["upgrade_required"] == "plus"


def test_free_tier_is_rejected_with_403(db_session):
    db_session.set_return(_StubUserRow(id=5, tier=UserTier.FREE))

    with pytest.raises(HTTPException) as exc:
        _ensure_agent_access(_StubUserResponse(id=5), db_session)

    assert exc.value.status_code == 403
    assert exc.value.detail["error"] == "agent_not_available"
    assert exc.value.detail["upgrade_required"] == "plus"


def test_missing_user_is_rejected_with_401(db_session):
    """User record is gone (deleted) → 401, NOT 403. The frontend treats
    401 as 'log out and re-auth', which is the correct UX."""
    db_session.set_return(None)

    with pytest.raises(HTTPException) as exc:
        _ensure_agent_access(_StubUserResponse(id=99), db_session)

    assert exc.value.status_code == 401
    assert exc.value.detail["error"] == "not_found"