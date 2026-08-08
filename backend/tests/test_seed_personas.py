# Tests for the persona library seed function.
#
# seed_persona_library runs at app startup and must be:
#   - idempotent: a second call against a populated DB must be a no-op
#     (otherwise we would create duplicate PersonaLibrary rows on every
#     deploy, blowing up the personas panel).
#   - complete: must insert all 16 personas with the documented metadata.
#   - consistent: every seeded system_prompt must match PERSONA_PROMPTS
#     for the same persona_id, so the seeded library cannot drift from
#     the in-memory prompt dictionary the orchestrator routes against.
#   - ordered: display_order must be 1..16 with no gaps and no duplicates.
#
# We exercise the function with a small fake Session that records added
# rows + commit calls, so the test stays free of the real DB engine.
from __future__ import annotations

from typing import Any

from arena.core.agents import PERSONA_PROMPTS
from arena.core.seed_personas import seed_persona_library
from arena.db_models import PersonaLibrary


class _FakeQuery:
    def __init__(self, count_value: int) -> None:
        self._count_value = count_value

    def count(self) -> int:
        return self._count_value


class _FakeSession:
    """Minimal SQLAlchemy Session stub.

    Records every add() and the call-site of commit() so the test can
    assert exactly which rows the seed function tried to persist.
    """

    def __init__(self, existing_count: int = 0) -> None:
        self.added: list[PersonaLibrary] = []
        self.commits: int = 0
        self._existing_count = existing_count

    def query(self, _model: Any) -> _FakeQuery:
        return _FakeQuery(self._existing_count)

    def add(self, instance: PersonaLibrary) -> None:
        self.added.append(instance)

    def commit(self) -> None:
        self.commits += 1


async def test_seed_inserts_all_16_personas_when_db_is_empty() -> None:
    db = _FakeSession(existing_count=0)
    await seed_persona_library(db)
    assert db.commits == 1
    assert len(db.added) == 16


async def test_seed_is_idempotent_when_personas_already_seeded() -> None:
    db = _FakeSession(existing_count=16)
    await seed_persona_library(db)
    # No add() calls, no commit — early return path
    assert db.added == []
    assert db.commits == 0


async def test_seed_uses_persona_prompts_as_source_of_truth() -> None:
    # Every seeded persona's system_prompt must match PERSONA_PROMPTS[id].
    # If a future edit adds a new key to PERSONA_PROMPTS but forgets to add
    # it to the seed list (or vice versa), this test trips loudly.
    db = _FakeSession(existing_count=0)
    await seed_persona_library(db)
    seeded_ids = {row.persona_id for row in db.added}
    assert seeded_ids == set(PERSONA_PROMPTS.keys())
    for row in db.added:
        assert row.system_prompt == PERSONA_PROMPTS[row.persona_id], (
            f"Drift on {row.persona_id}: seeded prompt does not match PERSONA_PROMPTS"
        )


async def test_seed_assigns_sequential_display_order_1_through_16() -> None:
    db = _FakeSession(existing_count=0)
    await seed_persona_library(db)
    orders = sorted(row.display_order for row in db.added)
    assert orders == list(range(1, 17))


async def test_seed_picks_up_every_free_tier_persona() -> None:
    # The free tier exposes the 6 personas in FREE_PERSONAS. All of them
    # must be in the seed so a freshly-created user on the FREE tier can
    # see them in the persona library without waiting on a separate seed.
    from arena.core.tier_config import FREE_PERSONAS

    db = _FakeSession(existing_count=0)
    await seed_persona_library(db)
    seeded_ids = {row.persona_id for row in db.added}
    missing = FREE_PERSONAS - seeded_ids
    assert not missing, f"Free-tier personas missing from seed: {missing}"


async def test_seed_metadata_shape() -> None:
    # Lock the column shape so a future schema drift trips this test
    # before the change reaches production.
    db = _FakeSession(existing_count=0)
    await seed_persona_library(db)
    sample = db.added[0]
    expected_columns = {
        "persona_id",
        "name",
        "color",
        "bg_tint",
        "quote",
        "description",
        "temperature",
        "system_prompt",
        "provider",
        "is_locked",
        "display_order",
    }
    actual_columns = {c.name for c in sample.__table__.columns}
    assert expected_columns.issubset(actual_columns), (
        f"Schema drift: seed references columns not in PersonaLibrary. "
        f"Missing: {expected_columns - actual_columns}"
    )


async def test_seed_uses_unique_persona_ids() -> None:
    db = _FakeSession(existing_count=0)
    await seed_persona_library(db)
    ids = [row.persona_id for row in db.added]
    assert len(ids) == len(set(ids)), "Duplicate persona_id in seed list"


async def test_seed_is_keyword_async_safe() -> None:
    # seed_persona_library is declared `async`; calling it from sync code
    # without `await` would yield a coroutine object instead of running.
    # Lock that the function returns None (not a coroutine) when awaited.
    db = _FakeSession(existing_count=0)
    result = await seed_persona_library(db)
    assert result is None


async def test_seed_color_format_is_hex_string() -> None:
    # Color is rendered into inline CSS custom props (`--slot-color`); a
    # typo here would silently break persona theming. Lock the format.
    db = _FakeSession(existing_count=0)
    await seed_persona_library(db)
    import re

    hex_color = re.compile(r"^#[0-9A-Fa-f]{6}$")
    for row in db.added:
        assert hex_color.match(row.color), (
            f"Persona {row.persona_id} color is not a 6-digit hex string: {row.color}"
        )
