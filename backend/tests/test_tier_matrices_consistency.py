"""Regression: all per-tier matrices in tier_config must declare the same set of tiers.

`tier_config.py` defines several per-tier matrices that look up by tier:

  * TIER_PERSONAS      — set of persona_ids each tier can access
  * TIER_MESSAGE_LIMITS — daily message caps
  * TIER_DAILY_LIMITS   — daily token/credit budgets
  * TIER_CREDIT_BUDGETS — alias for TIER_DAILY_LIMITS
  * TIER_FEATURES       — boolean feature flags

If a new tier is added (e.g. ENTERPRISE), every matrix must be updated
together. If even one is missed, lookups against that matrix crash
with KeyError or fall back to the FREE tier — both silently wrong.

This test pins the cross-matrix invariant: every matrix must declare
the same set of tier keys, and that set must cover every UserTier
enum value.
"""

from __future__ import annotations


def test_all_tier_matrices_declare_the_same_tier_keys():
    """TIER_PERSONAS, TIER_MESSAGE_LIMITS, TIER_DAILY_LIMITS, and
    TIER_FEATURES must each declare the same set of tier keys.

    TIER_CREDIT_BUDGETS is a literal alias for TIER_DAILY_LIMITS, so
    it's covered transitively.
    """
    from arena.core import tier_config

    matrices = {
        "TIER_PERSONAS": tier_config.TIER_PERSONAS,
        "TIER_MESSAGE_LIMITS": tier_config.TIER_MESSAGE_LIMITS,
        "TIER_DAILY_LIMITS": tier_config.TIER_DAILY_LIMITS,
        "TIER_FEATURES": tier_config.TIER_FEATURES,
    }

    matrix_keys = {
        name: set(matrix.keys()) for name, matrix in matrices.items()
    }
    names = list(matrix_keys.keys())

    reference = matrix_keys[names[0]]
    for name in names[1:]:
        assert matrix_keys[name] == reference, (
            f"Tier matrices drifted out of sync. {names[0]}={sorted(reference)}, "
            f"{name}={sorted(matrix_keys[name])}. "
            f"{name} - {names[0]}: {sorted(matrix_keys[name] - reference)}. "
            f"{names[0]} - {name}: {sorted(reference - matrix_keys[name])}. "
            f"Add the missing tier to ALL matrices so lookups against any "
            f"single matrix return the right tier's value (not the FREE fallback)."
        )


def test_tier_matrices_cover_every_user_tier():
    """The set of tier keys in each matrix must include every UserTier
    enum value. If a contributor adds a new UserTier (e.g. ENTERPRISE)
    to the enum but forgets to add an entry in TIER_PERSONAS, this test
    catches it.
    """
    from arena.core import tier_config
    from arena.core.tier_config import UserTier

    expected_tiers = set(UserTier)
    matrices = {
        "TIER_PERSONAS": tier_config.TIER_PERSONAS,
        "TIER_MESSAGE_LIMITS": tier_config.TIER_MESSAGE_LIMITS,
        "TIER_DAILY_LIMITS": tier_config.TIER_DAILY_LIMITS,
        "TIER_FEATURES": tier_config.TIER_FEATURES,
    }

    missing_matrices = [
        name
        for name, matrix in matrices.items()
        if not expected_tiers.issubset(set(matrix.keys()))
    ]

    assert not missing_matrices, (
        f"UserTier enum values {sorted(expected_tiers)} are not all "
        f"declared in these tier matrices: {missing_matrices}. Add an "
        f"entry per missing tier so lookups can return the right value "
        f"instead of falling back to the FREE default."
    )