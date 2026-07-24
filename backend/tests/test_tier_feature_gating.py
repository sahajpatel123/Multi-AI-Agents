"""Regression tests for ``has_feature(agent_mode, user=...)`` gating.

The agent_mode feature is the only tier-flagged feature whose answer
depends on the user row (the Agent add-on). All other features are
purely tier-mapped. Pinning the contract here means a refactor that
loses the `user` argument — or accidentally flips the boolean — cannot
silently unlock Pro-only behavior for free-tier users or block paid
Plus users from the Agent.

Pins:
  - Free + no user → False (free tier never gets agent_mode).
  - Plus + no user → False (cannot prove the addon is active; default-deny).
  - Plus + addon-active user → True.
  - Plus + addon-cancelling user → True (paid through period).
  - Plus + addon flags both False → False.
  - Pro (any user) → True unconditionally.
  - Guest tier → False.
  - Bad tier string normalized to free → False.
"""

from __future__ import annotations

import pytest

from arena.core.tier_config import UserTier, has_feature


class _StubUser:
    """Quacks like the subset of User the gate inspects."""

    def __init__(self, *, agent_addon_active: bool = False,
                 agent_addon_cancelling: bool = False):
        self.agent_addon_active = agent_addon_active
        self.agent_addon_cancelling = agent_addon_cancelling


class TestAgentModeGate:
    def test_free_tier_without_user_is_false(self):
        assert has_feature(UserTier.FREE, "agent_mode") is False

    def test_plus_tier_without_user_is_false(self):
        """No user record → cannot prove addon is active. Default-deny
        means a stale tier string cannot escalate silently."""
        assert has_feature(UserTier.PLUS, "agent_mode") is False

    def test_plus_with_active_addon_is_true(self):
        u = _StubUser(agent_addon_active=True)
        assert has_feature(UserTier.PLUS, "agent_mode", user=u) is True

    def test_plus_with_cancelling_addon_is_true(self):
        u = _StubUser(agent_addon_cancelling=True)
        assert has_feature(UserTier.PLUS, "agent_mode", user=u) is True

    def test_plus_with_both_addon_flags_true_is_true(self):
        u = _StubUser(agent_addon_active=True, agent_addon_cancelling=True)
        assert has_feature(UserTier.PLUS, "agent_mode", user=u) is True

    def test_plus_with_no_addon_is_false(self):
        u = _StubUser()
        assert has_feature(UserTier.PLUS, "agent_mode", user=u) is False

    def test_pro_tier_is_true_without_user(self):
        """Pro users get agent_mode unconditionally — no need to inspect
        the user record."""
        assert has_feature(UserTier.PRO, "agent_mode") is True

    def test_pro_tier_with_any_user_is_true(self):
        u = _StubUser()  # both flags False
        assert has_feature(UserTier.PRO, "agent_mode", user=u) is True

    def test_guest_tier_is_false(self):
        assert has_feature(UserTier.GUEST, "agent_mode") is False

    def test_normalizes_lowercase_string_tier(self):
        """Tier may arrive as a lowercase string from OAuth/profile routes.
        Normalization must happen BEFORE the agent_mode shortcut."""
        assert has_feature("free", "agent_mode") is False
        assert has_feature("plus", "agent_mode", user=_StubUser()) is False
        assert has_feature("pro", "agent_mode") is True

    def test_unknown_feature_returns_false(self):
        """A typo in a feature name must default-deny. The Pro tier
        must NOT silently grant a bogus feature just because the tier
        is high."""
        assert has_feature(UserTier.PRO, "no_such_feature_xyz") is False

    def test_empty_string_tier_treated_as_free(self):
        """Defensive: empty/missing tier must NOT be treated as Pro."""
        assert has_feature("", "agent_mode") is False


class TestNonAgentModeGating:
    """Sanity: features other than agent_mode use the static tier map."""

    def test_pro_has_memory(self):
        assert has_feature(UserTier.PRO, "memory") is True

    def test_free_does_not_have_memory(self):
        assert has_feature(UserTier.FREE, "memory") is False

    def test_plus_has_memory(self):
        assert has_feature(UserTier.PLUS, "memory") is True