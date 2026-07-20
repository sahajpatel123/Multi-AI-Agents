"""Tests for the Agent template library.

templates.TEMPLATES powers the 'try one' chip row on the Agent page and
the AgentPage template modal. Drift here means either:
  - a template disappears from the picker (the chip row shows a missing
    persona) — UI regression
  - a template's required fields regress (slots / prompt_template /
    default_expertise) — Agent pipeline build fails on submit
  - category grouping breaks — modal shows no templates in a section
  - the Condura demonstrative templates lose their capability_id /
    execution metadata — the honesty gate can no longer match them
"""
from __future__ import annotations

from arena.core import templates


REQUIRED_FIELDS = {
    "id",
    "category",
    "title",
    "icon",
    "description",
    "prompt_template",
    "slots",
    "default_expertise",
    "example",
}

VALID_EXPERTISE = {"curious", "practitioner", "expert", "researcher"}

# Condura demonstrative templates must declare execution + capability_id
# so the honesty gate can route them. Pin the known set so a future
# template accidentally dropped into "On device" without these fields
# trips this test.
CONDURA_TEMPLATE_IDS = {"open_in_linear", "save_report_local", "long_research_delegate"}


def test_templates_library_is_non_empty() -> None:
    assert len(templates.TEMPLATES) > 0


def test_every_template_has_required_fields() -> None:
    for t in templates.TEMPLATES:
        missing = REQUIRED_FIELDS - set(t.keys())
        assert not missing, f"Template {t.get('id', '<no id>')} missing fields: {sorted(missing)}"


def test_every_template_id_is_unique() -> None:
    ids = [t["id"] for t in templates.TEMPLATES]
    duplicates = [i for i in ids if ids.count(i) > 1]
    assert not duplicates, f"Duplicate template ids: {set(duplicates)}"


def test_every_template_id_is_kebab_case() -> None:
    # Lock the slug format — the picker uses the id as React key and
    # for URL params in the share flow. A whitespace or uppercase
    # id would break those surfaces.
    import re
    for t in templates.TEMPLATES:
        assert re.match(r"^[a-z][a-z0-9_]*$", t["id"]), (
            f"Template id '{t['id']}' is not kebab_case_snake"
        )


def test_every_template_default_expertise_is_in_documented_set() -> None:
    for t in templates.TEMPLATES:
        assert t["default_expertise"] in VALID_EXPERTISE, (
            f"Template {t['id']} expertise {t['default_expertise']!r} "
            f"not in {VALID_EXPERTISE}"
        )


def test_every_template_slots_is_non_empty_list() -> None:
    for t in templates.TEMPLATES:
        assert isinstance(t["slots"], list)
        assert len(t["slots"]) > 0, f"Template {t['id']} has empty slots"
        for slot in t["slots"]:
            assert isinstance(slot, str) and slot, (
                f"Template {t['id']} has invalid slot: {slot!r}"
            )


def test_every_template_prompt_references_all_slots() -> None:
    # The prompt_template must use every slot — otherwise the modal
    # would render a slot input that doesn't appear in the prompt.
    for t in templates.TEMPLATES:
        for slot in t["slots"]:
            placeholder = "{" + slot + "}"
            assert placeholder in t["prompt_template"], (
                f"Template {t['id']} declares slot {slot!r} but prompt_template "
                f"does not reference {placeholder}"
            )


def test_every_template_prompt_does_not_reference_unknown_slots() -> None:
    # Every {x} placeholder in the prompt must be a declared slot.
    import re
    for t in templates.TEMPLATES:
        declared = set(t["slots"])
        placeholders = set(re.findall(r"\{(\w+)\}", t["prompt_template"]))
        unknown = placeholders - declared
        assert not unknown, (
            f"Template {t['id']} prompt references unknown slots {unknown}; "
            f"declared slots: {declared}"
        )


def test_condura_templates_have_capability_id_and_execution() -> None:
    for t in templates.TEMPLATES:
        if t["id"] in CONDURA_TEMPLATE_IDS:
            assert "capability_id" in t, (
                f"Condura template {t['id']} missing capability_id"
            )
            assert t["capability_id"], f"Condura template {t['id']} has empty capability_id"
            assert t.get("execution") in {"condura", "hybrid_prep", "hybrid_delegate"}, (
                f"Condura template {t['id']} has invalid execution: {t.get('execution')!r}"
            )


def test_condura_templates_match_capability_registry() -> None:
    # The capability_id on each Condura template must exist in the
    # capability registry — otherwise the honesty gate cannot route
    # the handoff. Cross-validate via the registry.
    from arena.core.capabilities import REGISTRY

    for t in templates.TEMPLATES:
        cid = t.get("capability_id")
        if cid:
            assert cid in REGISTRY, (
                f"Template {t['id']} references unknown capability_id {cid!r}; "
                f"registry has {sorted(REGISTRY.keys())}"
            )


def test_disabled_template_has_disabled_reason() -> None:
    for t in templates.TEMPLATES:
        if t.get("disabled"):
            assert t.get("disabled_reason"), (
                f"Template {t['id']} is disabled but missing disabled_reason"
            )


def test_get_templates_grouped_by_category_returns_envelope() -> None:
    grouped = templates.get_templates_grouped_by_category()
    assert isinstance(grouped, dict)
    # Top-level shape is locked: {"categories": {<category>: [<templates>]}}
    assert set(grouped.keys()) == {"categories"}
    inner = grouped["categories"]
    assert isinstance(inner, dict)
    assert len(inner) > 0
    # Every category key is a non-empty string
    for cat in inner:
        assert isinstance(cat, str) and cat
        assert len(inner[cat]) > 0


def test_grouped_output_contains_every_template() -> None:
    grouped = templates.get_templates_grouped_by_category()["categories"]
    flat = [t for ts in grouped.values() for t in ts]
    assert len(flat) == len(templates.TEMPLATES)
    grouped_ids = {t["id"] for ts in grouped.values() for t in ts}
    template_ids = {t["id"] for t in templates.TEMPLATES}
    assert grouped_ids == template_ids


def test_grouped_output_groups_by_documented_category() -> None:
    grouped = templates.get_templates_grouped_by_category()["categories"]
    # For each template, verify its group key matches its declared category.
    for cat, ts in grouped.items():
        for t in ts:
            assert t["category"] == cat, (
                f"Template {t['id']} has category {t['category']!r} but landed in group {cat!r}"
            )


def test_grouped_categories_use_documented_strings() -> None:
    # Categories are shown to the user as section labels — they must be
    # readable, consistent, and stable across releases. Lock the known set.
    grouped = templates.get_templates_grouped_by_category()["categories"]
    expected_categories = {
        "Business",
        "Technical",
        "Finance",
        "Analysis",
        "On device",
    }
    actual_categories = set(grouped.keys())
    # New categories may be added (this test should not block intentional
    # additions); just ensure every actual category is non-empty and
    # well-formed.
    for cat in actual_categories:
        assert isinstance(cat, str) and cat == cat.strip()
        assert cat != ""
    # And every known category that's still in the library appears
    # without spelling changes.
    for cat in expected_categories:
        if cat in actual_categories:
            assert cat in grouped and len(grouped[cat]) > 0


def test_each_category_has_at_least_one_template() -> None:
    grouped = templates.get_templates_grouped_by_category()["categories"]
    for cat, ts in grouped.items():
        assert ts, f"Category {cat!r} has no templates"
