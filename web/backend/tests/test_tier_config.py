"""Unit tests for arena.core.tier_config.

Pure functions; no I/O. Covers the tier matrix, persona access, feature flags,
and limit helpers.
"""

import pytest

from arena.core.tier_config import (
    ALL_PERSONAS,
    FREE_PERSONAS,
    TIER_CREDIT_BUDGETS,
    TIER_DAILY_LIMITS,
    TIER_FEATURES,
    TIER_MESSAGE_LIMITS,
    TIER_PERSONAS,
    UserTier,
    get_credit_budget,
    get_daily_limit,
    get_tier_personas,
    get_tier_str,
    has_feature,
    normalize_tier,
    upgrade_target,
    validate_persona_access,
)


class TestNormalizeTier:
    def test_passes_through_enum(self):
        assert normalize_tier(UserTier.PRO) is UserTier.PRO

    def test_uppercases_string(self):
        assert normalize_tier("pro") is UserTier.PRO
        assert normalize_tier("Pro") is UserTier.PRO
        assert normalize_tier("PRO") is UserTier.PRO

    def test_empty_is_free(self):
        assert normalize_tier("") is UserTier.FREE
        assert normalize_tier(None) is UserTier.FREE

    def test_unknown_string_is_free(self):
        assert normalize_tier("mystery") is UserTier.FREE

    def test_legacy_registered_maps_to_free(self):
        # "registered" was an old tier name in UserTier enum; map to FREE.
        assert normalize_tier("REGISTERED") is UserTier.FREE


class TestLimits:
    def test_message_limits_strictly_increase_with_tier(self):
        order = [UserTier.GUEST, UserTier.FREE, UserTier.PLUS, UserTier.PRO]
        limits = [TIER_MESSAGE_LIMITS[t] for t in order]
        assert limits == sorted(limits)
        assert limits[0] < limits[-1]

    def test_credit_budgets_strictly_increase_with_tier(self):
        order = [UserTier.GUEST, UserTier.FREE, UserTier.PLUS, UserTier.PRO]
        budgets = [TIER_DAILY_LIMITS[t] for t in order]
        assert budgets == sorted(budgets)
        assert budgets[0] < budgets[-1]

    def test_credit_budget_alias_matches(self):
        # Backward-compat alias for older imports.
        assert TIER_CREDIT_BUDGETS is TIER_DAILY_LIMITS

    def test_get_daily_limit_unknown_returns_free_default(self):
        assert get_daily_limit("alien-tier") == TIER_MESSAGE_LIMITS[UserTier.FREE]

    def test_get_credit_budget_unknown_returns_free_default(self):
        assert get_credit_budget("alien-tier") == TIER_DAILY_LIMITS[UserTier.FREE]


class TestPersonaAccess:
    def test_free_tier_has_six_personas(self):
        assert len(FREE_PERSONAS) == 6
        assert FREE_PERSONAS.issubset(ALL_PERSONAS)

    def test_all_tier_unlocks_everyone(self):
        assert TIER_PERSONAS[UserTier.PLUS] == ALL_PERSONAS
        assert TIER_PERSONAS[UserTier.PRO] == ALL_PERSONAS

    def test_get_tier_personas_accepts_string(self):
        assert get_tier_personas("plus") == ALL_PERSONAS
        assert get_tier_personas("FREE") == FREE_PERSONAS

    def test_validate_persona_access_allows_free_set(self):
        ok, blocked = validate_persona_access(UserTier.FREE, list(FREE_PERSONAS))
        assert ok is True
        assert blocked == []

    def test_validate_persona_access_blocks_locked(self):
        # scientist is Plus-only
        ok, blocked = validate_persona_access(UserTier.FREE, ["scientist"])
        assert ok is False
        assert "scientist" in blocked

    def test_validate_persona_access_none_is_always_ok(self):
        assert validate_persona_access(UserTier.FREE, None) == (True, [])


class TestFeatures:
    def test_free_has_no_special_features(self):
        f = TIER_FEATURES[UserTier.FREE]
        assert f["debate"] is False
        assert f["discuss"] is False
        assert f["agent_mode"] is False

    def test_pro_unlocks_everything(self):
        f = TIER_FEATURES[UserTier.PRO]
        for v in f.values():
            assert v is True, f"PRO feature disabled: {v}"

    def test_has_feature_unknown_tier_returns_false(self):
        assert has_feature("ghost", "debate") is False

    def test_has_feature_agent_mode_pro_no_user(self):
        assert has_feature(UserTier.PRO, "agent_mode") is True

    def test_has_feature_agent_mode_plus_needs_addon(self, make_user):
        u_plus = make_user(tier=UserTier.PLUS)
        # Plus without addon: no agent_mode
        assert has_feature(UserTier.PLUS, "agent_mode", user=u_plus) is False
        # Plus with addon_active: yes
        u_plus.agent_addon_active = True
        assert has_feature(UserTier.PLUS, "agent_mode", user=u_plus) is True


class TestUpgradeTarget:
    def test_guest_upgrades_to_plus(self):
        assert upgrade_target(UserTier.GUEST) == "plus"

    def test_free_upgrades_to_plus(self):
        assert upgrade_target(UserTier.FREE) == "plus"

    def test_plus_upgrades_to_pro(self):
        assert upgrade_target(UserTier.PLUS) == "pro"

    def test_pro_has_no_upgrade(self):
        assert upgrade_target(UserTier.PRO) is None


class TestGetTierStr:
    def test_enum_value(self):
        from types import SimpleNamespace

        user = SimpleNamespace(tier=UserTier.PRO)
        assert get_tier_str(user) == "pro"

    def test_string_value(self):
        from types import SimpleNamespace

        user = SimpleNamespace(tier="PLUS")
        assert get_tier_str(user) == "plus"

    def test_none_tier(self):
        from types import SimpleNamespace

        user = SimpleNamespace(tier=None)
        assert get_tier_str(user) == ""


class TestPersonaCatalog:
    def test_at_least_16_personas(self):
        assert len(ALL_PERSONAS) >= 16

    def test_free_set_names(self):
        expected = {"analyst", "philosopher", "pragmatist", "contrarian", "futurist", "empath"}
        assert FREE_PERSONAS == expected