"""Regression: TIER_FEATURES must have identical feature keys across all tiers.

TIER_FEATURES is a per-tier dict (GUEST/FREE/PLUS/PRO) mapping feature
flags to booleans. Each tier MUST declare the same set of feature keys
— if a new feature is added to PLUS/PRO without being added to GUEST/FREE,
the dicts drift apart and downstream `tier_flags.get('new_feature')`
lookups fail with KeyError on the tiers that don't have it.

This drift class is silent — the access sites (`has_feature(tier, name)`)
default to False on missing keys only if the wrapper handles the
KeyError, otherwise they crash for the missing tiers. Either way, the
absence is invisible until a user on the affected tier hits the feature.

Pin the surface so adding a feature requires updating all four tiers
in lockstep.
"""

from __future__ import annotations


def test_tier_features_have_identical_keys():
    """Every tier dict must declare the same set of feature flags."""
    from arena.core.tier_config import TIER_FEATURES

    feature_sets = {tier: set(flags.keys()) for tier, flags in TIER_FEATURES.items()}
    tiers = list(feature_sets.keys())

    assert len(tiers) >= 2, (
        f"Expected at least 2 tiers; got {tiers}. The TIER_FEATURES matrix "
        f"should cover every UserTier enum value."
    )

    reference_set = feature_sets[tiers[0]]
    for tier in tiers[1:]:
        assert feature_sets[tier] == reference_set, (
            f"TIER_FEATURES drifted: tier {tier!r} has features "
            f"{sorted(feature_sets[tier] - reference_set)} missing "
            f"compared to {tiers[0]!r}, and "
            f"{sorted(reference_set - feature_sets[tier])} that "
            f"{tier!r} has but {tiers[0]!r} does not. Add the missing "
            f"keys to all tiers so `has_feature(tier, name)` works "
            f"consistently."
        )


def test_tier_features_keys_are_strings():
    """Feature keys must be strings, not enums or other types, so
    `has_feature(tier, 'name')` lookups by string stay simple."""
    from arena.core.tier_config import TIER_FEATURES

    non_string = [
        (tier, type(k).__name__, repr(k))
        for tier, flags in TIER_FEATURES.items()
        for k in flags.keys()
        if not isinstance(k, str)
    ]
    assert not non_string, (
        f"TIER_FEATURES keys must be strings, not other types. Found: "
        f"{non_string[:5]}. Enum keys would force callers to import "
        f"the enum just to call has_feature()."
    )


def test_tier_features_values_are_booleans():
    """Feature values must be booleans. A truthy string ("true") or
    None silently coerces to False in some branches and True in others,
    depending on the access path. Pin the type."""
    from arena.core.tier_config import TIER_FEATURES

    bad = [
        (tier, key, type(v).__name__, repr(v))
        for tier, flags in TIER_FEATURES.items()
        for key, v in flags.items()
        if not isinstance(v, bool)
    ]
    assert not bad, (
        f"TIER_FEATURES values must be booleans, got: {bad[:5]}. "
        f"A truthy string or None silently misbehaves depending on the "
        f"caller's truthiness check. Use True / False explicitly."
    )