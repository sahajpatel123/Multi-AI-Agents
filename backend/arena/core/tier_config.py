"""Central tier configuration and access helpers."""

from __future__ import annotations

from enum import Enum


class UserTier(str, Enum):
    GUEST = "GUEST"
    FREE = "FREE"
    PLUS = "PLUS"
    PRO = "PRO"


FREE_PERSONAS = {
    "analyst",
    "philosopher",
    "pragmatist",
    "contrarian",
    "futurist",
    "empath",
}

ALL_PERSONAS = {
    "analyst",
    "philosopher",
    "pragmatist",
    "contrarian",
    "scientist",
    "historian",
    "economist",
    "ethicist",
    "stoic",
    "futurist",
    "strategist",
    "engineer",
    "optimist",
    "empath",
    "firstprinciples",
    "devilsadvocate",
}

TIER_PERSONAS = {
    UserTier.GUEST: FREE_PERSONAS,
    UserTier.FREE: FREE_PERSONAS,
    UserTier.PLUS: ALL_PERSONAS,
    UserTier.PRO: ALL_PERSONAS,
}

TIER_DAILY_LIMITS = {
    UserTier.GUEST: 3,
    UserTier.FREE: 5,
    UserTier.PLUS: 15,
    UserTier.PRO: 35,
}

TIER_FEATURES = {
    UserTier.GUEST: {
        "debate": False,
        "discuss": False,
        "memory": False,
        "saved_responses": False,
        "full_history": False,
        "agent_mode": False,
        "scoring_audit": False,
        "unlimited_debates": False,
    },
    UserTier.FREE: {
        "debate": False,
        "discuss": False,
        "memory": False,
        "saved_responses": False,
        "full_history": False,
        "agent_mode": False,
        "scoring_audit": False,
        "unlimited_debates": False,
    },
    UserTier.PLUS: {
        "debate": True,
        "discuss": True,
        "memory": True,
        "saved_responses": True,
        "full_history": True,
        "agent_mode": False,
        "scoring_audit": False,
        "unlimited_debates": False,
    },
    UserTier.PRO: {
        "debate": True,
        "discuss": True,
        "memory": True,
        "saved_responses": True,
        "full_history": True,
        "agent_mode": True,
        "scoring_audit": True,
        "unlimited_debates": True,
    },
}


def normalize_tier(value: str | UserTier | None) -> UserTier:
    if isinstance(value, UserTier):
        return value

    normalized = str(value or "").strip().upper()
    legacy_map = {
        "": UserTier.FREE,
        "GUEST": UserTier.GUEST,
        "FREE": UserTier.FREE,
        "REGISTERED": UserTier.FREE,
        "PLUS": UserTier.PLUS,
        "PRO": UserTier.PRO,
    }
    return legacy_map.get(normalized, UserTier.FREE)


def get_tier_personas(tier: UserTier | str | None) -> set[str]:
    return TIER_PERSONAS.get(normalize_tier(tier), TIER_PERSONAS[UserTier.FREE])


def get_daily_limit(tier: UserTier | str | None) -> int:
    return TIER_DAILY_LIMITS.get(normalize_tier(tier), TIER_DAILY_LIMITS[UserTier.FREE])


def has_feature(tier: UserTier | str | None, feature: str) -> bool:
    features = TIER_FEATURES.get(normalize_tier(tier), TIER_FEATURES[UserTier.FREE])
    return features.get(feature, False)


def validate_persona_access(
    tier: UserTier | str | None,
    persona_ids: list[str] | None,
) -> tuple[bool, list[str]]:
    allowed = get_tier_personas(tier)
    blocked = [persona_id for persona_id in (persona_ids or []) if persona_id not in allowed]
    return len(blocked) == 0, blocked


def upgrade_target(tier: UserTier | str | None) -> str | None:
    normalized = normalize_tier(tier)
    if normalized in {UserTier.GUEST, UserTier.FREE}:
        return "plus"
    if normalized == UserTier.PLUS:
        return "pro"
    return None
