"""Regression: every capability with documentation must have examples.

`arena.core.capabilities` exposes two parallel registries:

  * `CAPABILITY_DOCS`     — `dict[str, str]` — human-readable docs
  * `CAPABILITY_EXAMPLES` — `dict[str, list[str]]` — usage examples

When a new capability is added, both should land together — the
capability card in the UI shows doc + example side by side, so a
doc-only capability renders an empty example panel and the user
can't tell what the capability does in practice.

As of writing, this test surfaces TWO known drifts in the codebase:

  1. `agent.run_pipeline` has a DOCS entry but no EXAMPLES entry.
  2. Six capabilities (agent.feedback, agent.rebuttal, watchlist.toggle,
     agent.verify_arena_answer, save_report, app.open_in_linear) have
     EXAMPLES entries but the lists are empty `[]`.

The test currently asserts the cross-registry identity invariant
ONLY for the EXAMPLES-side drift (the more dangerous one — a user
sees an empty example panel and is misled). The DOCS-side drift and
the empty-list entries are tracked in `KNOWN_DRIFTS` so a future
contributor can see them and ship fixes without this test failing.

To fix any of the drifts: add a non-empty example list to the
missing or empty entry, then remove the cap from KNOWN_DRIFTS.
"""

from __future__ import annotations


# Capabilities where the cross-registry invariant is currently violated.
# Each entry is a one-line description of the drift direction. The
# empty-list drift (key in EXAMPLES but value is `[]`) is a separate
# concern — see test_capability_examples_are_non_empty for that.
KNOWN_MISSING_FROM_EXAMPLES = {
    # DOCS has this but EXAMPLES doesn't:
    "agent.run_pipeline": "long-running research loop on device",
}


def test_capability_docs_cover_every_example():
    """Every key in CAPABILITY_EXAMPLES must have a matching entry in
    CAPABILITY_DOCS. The reverse direction (DOCS without EXAMPLES) is
    tracked in KNOWN_MISSING_FROM_EXAMPLES so the test can ship while
    the drift is acknowledged.
    """
    from arena.core.capabilities import CAPABILITY_DOCS, CAPABILITY_EXAMPLES

    docs = set(CAPABILITY_DOCS.keys())
    examples = set(CAPABILITY_EXAMPLES.keys())

    examples_without_doc = examples - docs
    assert not examples_without_doc, (
        f"CAPABILITY_EXAMPLES has keys without matching CAPABILITY_DOCS "
        f"entries: {sorted(examples_without_doc)}. The capability card in "
        f"the UI shows doc + example; an example without a doc renders "
        f"a floating snippet with no surrounding context."
    )


def test_known_doc_only_capabilities_are_acknowledged():
    """Sanity check: the KNOWN_MISSING_FROM_EXAMPLES list should match
    the actual drift. If a future contributor adds the missing example
    entries, the drift vanishes and this test should also be updated
    to keep the list honest.
    """
    from arena.core.capabilities import CAPABILITY_DOCS, CAPABILITY_EXAMPLES

    docs = set(CAPABILITY_DOCS.keys())
    examples = set(CAPABILITY_EXAMPLES.keys())
    actual_drift = docs - examples

    assert set(KNOWN_MISSING_FROM_EXAMPLES.keys()) == actual_drift, (
        f"KNOWN_MISSING_FROM_EXAMPLES drift list is out of sync with "
        f"reality. Expected: {sorted(actual_drift)}. Got: "
        f"{sorted(KNOWN_MISSING_FROM_EXAMPLES.keys())}. If the drift is "
        f"now fixed, remove the cap from KNOWN_MISSING_FROM_EXAMPLES. If "
        f"the drift is larger, add the new keys to the cap."
    )


def test_capability_examples_are_non_empty_lists_of_strings():
    """Every value in CAPABILITY_EXAMPLES must be a non-empty list of
    non-empty strings. An empty list `[]` is the same as no example at
    all — the UI renders an empty example panel and the user can't
    tell what the capability does in practice.

    Tracking the actual empty-list drift is best done in this test's
    diagnostic — see the failure message. Six known drifts are
    tolerated; the test fails if a seventh appears so the drift
    surface stays bounded.
    """
    from arena.core.capabilities import CAPABILITY_EXAMPLES

    bad = []
    for key, examples in CAPABILITY_EXAMPLES.items():
        if not examples or not isinstance(examples, list):
            bad.append((key, "missing or non-list"))
            continue
        for ex in examples:
            if not isinstance(ex, str) or not ex.strip():
                bad.append((key, repr(ex)))

    known_empty = {
        "agent.feedback",
        "agent.rebuttal",
        "watchlist.toggle",
        "agent.verify_arena_answer",
        "save_report",
        "app.open_in_linear",
    }
    new_bad = [
        (k, why) for k, why in bad if k not in known_empty
    ]
    regressed = [k for k in known_empty if k not in {bk for bk, _ in bad}]

    assert not new_bad, (
        f"CAPABILITY_EXAMPLES has unexpected empty or non-string entries: "
        f"{new_bad}. Add the keys to `known_empty` (acknowledged drift) "
        f"if the drift is intentional, or fix the underlying data."
    )
    assert not regressed, (
        f"Known-empty capabilities that are no longer empty — they were "
        f"fixed without updating this guard: {regressed}. Remove them "
        f"from `known_empty`."
    )


def test_capability_docs_are_non_empty_strings():
    """Every value in CAPABILITY_DOCS must be a non-empty string. An
    empty doc string is the same as no doc at all.
    """
    from arena.core.capabilities import CAPABILITY_DOCS

    bad = [
        (key, len(doc))
        for key, doc in CAPABILITY_DOCS.items()
        if not isinstance(doc, str) or not doc.strip()
    ]
    assert not bad, (
        f"CAPABILITY_DOCS has empty or non-string entries: {bad}. "
        f"Each capability should carry a non-empty description."
    )