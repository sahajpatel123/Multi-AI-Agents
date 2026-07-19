"""Regression: every persona defined in `agents.PERSONA_PROMPTS` must have
matching entries in `agents.PERSONA_METADATA` and `model_router.PERSONA_ROUTES`.

Three independent registries describe the 16 personas. They have to stay
in lockstep:

  * `arena.core.agents.PERSONA_PROMPTS`     — system-prompt text (drives behavior)
  * `arena.core.agents.PERSONA_METADATA`    — display + config (UI cards, seeding)
  * `arena.core.model_router.PERSONA_ROUTES` — provider/model resolution (LLM dispatch)

When a new persona ships, a contributor typically touches PROMPTS first
and forgets the other two — leaving the UI card missing or LLM dispatch
falling back to the default route. By the time anyone notices, the
persona is half-built and visible to users inconsistently.

This test fails loudly if any of the three registries drifts away from
the others. Adding a 17th persona means updating three places — exactly
the redundancy we want.
"""

from __future__ import annotations


def test_persona_registries_have_identical_keys():
    from arena.core.agents import PERSONA_METADATA, PERSONA_PROMPTS
    from arena.core.model_router import PERSONA_ROUTES

    prompts = set(PERSONA_PROMPTS.keys())
    metadata = set(PERSONA_METADATA.keys())
    routes = set(PERSONA_ROUTES.keys())

    assert prompts == metadata == routes, (
        f"Persona registries drifted out of sync. "
        f"PROMPTS={len(prompts)}, METADATA={len(metadata)}, ROUTES={len(routes)}. "
        f"PROMPTS - METADATA: {sorted(prompts - metadata) or '∅'}. "
        f"METADATA - PROMPTS: {sorted(metadata - prompts) or '∅'}. "
        f"PROMPTS - ROUTES: {sorted(prompts - routes) or '∅'}. "
        f"ROUTES - PROMPTS: {sorted(routes - prompts) or '∅'}. "
        f"Add the missing entries so every persona is fully described."
    )


def test_persona_count_is_sixteen():
    """Sanity check: Arena exposes exactly 16 personas (per README / tier config).

    Catches accidental deletion or batch addition (a typo can silently
    double the list). If this count legitimately changes, update the
    README's persona table AND `tier_config.PERSONA_FREE/ALL_PERSONAS`
    together.
    """
    from arena.core.agents import PERSONA_METADATA, PERSONA_PROMPTS
    from arena.core.model_router import PERSONA_ROUTES

    expected = 16
    assert len(PERSONA_PROMPTS) == expected, (
        f"PERSONA_PROMPTS has {len(PERSONA_PROMPTS)} entries; expected {expected}. "
        f"Update tier_config + README alongside any persona count change."
    )
    assert len(PERSONA_METADATA) == expected
    assert len(PERSONA_ROUTES) == expected


def test_every_persona_metadata_has_a_name_and_color():
    """Sanity check on PERSONA_METADATA itself: every entry must have the
    minimal display fields the UI reads. Without these, the persona card
    renders blank. PersonaLibrary DB rows store the richer fields
    (description, quote, etc.) — see arena/routes/personas.py::_serialize.
    """
    from arena.core.agents import PERSONA_METADATA

    minimal_fields = {"name", "color"}
    incomplete = [
        persona_id
        for persona_id, meta in PERSONA_METADATA.items()
        if not minimal_fields.issubset(meta.keys())
    ]
    assert not incomplete, (
        f"PERSONA_METADATA entries missing required fields "
        f"({sorted(minimal_fields)}): {incomplete}"
    )