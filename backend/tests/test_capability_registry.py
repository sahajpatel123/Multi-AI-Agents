"""Tests for the capability registry in arena.core.capabilities.

Pins the contract that the Agent pipeline (and the cycle-33 rate-limited
GET /api/agent/capabilities* endpoints) depend on. The previous cycle-04
NameError on `HybridPrepCapability` / `HybridDelegateCapability` went
unnoticed because no test exercised the registry shape directly — this
file is the regression guard.
"""

from __future__ import annotations

import pytest

from arena.core.capabilities import (
    CAPABILITY_DOCS,
    ConduraCapability,
    ExecutionEnvironment,
    HybridDelegateCapability,
    HybridPrepCapability,
    REGISTRY,
    WebCapability,
    classify_task_text,
    evaluate_capability_gate,
    get_capability_doc,
    honest_rejection_enabled,
    list_capabilities,
    requires_local_rejection,
    resolve,
)


# ─── Registry shape ─────────────────────────────────────────────────────────


def test_registry_is_non_empty():
    assert len(REGISTRY) >= 8, (
        "Arena ships at least 8 capabilities (4 arena + 6 agent + 2 watchlist); "
        f"got {len(REGISTRY)}"
    )


def test_every_capability_id_is_unique():
    ids = list(REGISTRY.keys())
    assert len(ids) == len(set(ids)), f"duplicate capability IDs: {ids}"


def test_every_capability_id_is_namespaced():
    """Cap IDs use `<namespace>.<verb>` (arena.*, agent.*, watchlist.*, app.*, report.*)."""
    valid_prefixes = ("arena.", "agent.", "watchlist.", "app.", "report.")
    for cap_id in REGISTRY.keys():
        assert cap_id.startswith(valid_prefixes), (
            f"{cap_id} doesn't follow the <namespace>.<verb> convention"
        )


def test_every_capability_has_non_empty_description():
    for cap_id, cap in REGISTRY.items():
        assert isinstance(cap.description, str) and cap.description.strip(), (
            f"{cap_id} has empty description"
        )


def test_every_capability_id_matches_its_object_id():
    for cap_id, cap in REGISTRY.items():
        assert cap.id == cap_id, (
            f"REGISTRY key {cap_id!r} maps to cap.id={cap.id!r}"
        )


def test_every_capability_is_a_recognised_subclass():
    for cap_id, cap in REGISTRY.items():
        assert isinstance(
            cap, (WebCapability, ConduraCapability, HybridPrepCapability, HybridDelegateCapability)
        ), f"{cap_id} is {type(cap).__name__}, not a known Capability subclass"


def test_execution_environment_is_valid():
    for cap_id, cap in REGISTRY.items():
        assert isinstance(cap.execution, ExecutionEnvironment), (
            f"{cap_id}.execution is not an ExecutionEnvironment: {cap.execution!r}"
        )
        assert cap.execution in ExecutionEnvironment, (
            f"{cap_id}.execution={cap.execution!r} not in enum"
        )


# ─── Per-subclass invariants ───────────────────────────────────────────────


def test_web_capabilities_have_no_condura_method():
    """Web capabilities execute on the server — no Condura method should leak."""
    for cap_id, cap in REGISTRY.items():
        if isinstance(cap, WebCapability):
            assert not hasattr(cap, "condura_method") or cap.condura_method is None, (
                f"web cap {cap_id} unexpectedly has condura_method={getattr(cap, 'condura_method', None)!r}"
            )


def test_non_web_capabilities_have_condura_method():
    for cap_id, cap in REGISTRY.items():
        if isinstance(cap, (ConduraCapability, HybridPrepCapability, HybridDelegateCapability)):
            assert cap.condura_method, f"{cap_id} is non-web but has empty condura_method"


def test_hybrid_capabilities_have_stream_heartbeat():
    """HybridDelegateCapability must heartbeat so the client can re-render."""
    for cap_id, cap in REGISTRY.items():
        if isinstance(cap, HybridDelegateCapability):
            assert cap.stream_heartbeat_seconds > 0, (
                f"{cap_id} (HybridDelegate) has stream_heartbeat_seconds={cap.stream_heartbeat_seconds}"
            )


# ─── resolve() ──────────────────────────────────────────────────────────────


def test_resolve_returns_known_capability():
    assert resolve("agent.research").id == "agent.research"


def test_resolve_raises_for_unknown_id():
    """Cycle-04 lesson: missing Hybrid imports crashed /capabilities/stats.
    resolve() must raise a KeyError (not silently return None) for unknown ids."""
    with pytest.raises(KeyError) as exc_info:
        resolve("does.not.exist")
    assert "does.not.exist" in str(exc_info.value)


# ─── list_capabilities() ────────────────────────────────────────────────────


def test_list_capabilities_returns_dict_per_registry_entry():
    items = list_capabilities()
    assert len(items) == len(REGISTRY)
    for item in items:
        assert {"id", "description", "execution"}.issubset(item.keys()), (
            f"missing required keys in {item!r}"
        )


def test_list_capabilities_is_id_unique():
    items = list_capabilities()
    ids = [item["id"] for item in items]
    assert len(ids) == len(set(ids)), f"duplicate ids in list_capabilities: {ids}"


def test_list_capabilities_includes_condura_method_for_non_web():
    items = list_capabilities()
    by_id = {item["id"]: item for item in items}
    for cap_id, cap in REGISTRY.items():
        if isinstance(cap, (ConduraCapability, HybridPrepCapability, HybridDelegateCapability)):
            assert by_id[cap_id].get("condura_method"), (
                f"{cap_id} is non-web but list_capabilities() omitted condura_method"
            )


def test_list_capabilities_includes_stream_heartbeat_for_hybrid_delegate():
    items = list_capabilities()
    by_id = {item["id"]: item for item in items}
    for cap_id, cap in REGISTRY.items():
        if isinstance(cap, HybridDelegateCapability):
            assert by_id[cap_id].get("stream_heartbeat_seconds") == cap.stream_heartbeat_seconds


# ─── CAPABILITY_DOCS ────────────────────────────────────────────────────────


def test_capability_docs_covers_every_registry_entry():
    """Every capability should have developer-facing markdown docs."""
    missing = [cap_id for cap_id in REGISTRY.keys() if cap_id not in CAPABILITY_DOCS]
    assert not missing, f"CAPABILITY_DOCS missing entries for: {missing}"


def test_get_capability_doc_returns_doc_for_known():
    doc = get_capability_doc("agent.research")
    assert isinstance(doc, dict)
    assert "Seven-stage research pipeline" in doc.get("markdown", "")


def test_get_capability_doc_returns_none_for_unknown():
    assert get_capability_doc("does.not.exist") is None


# ─── classify_task_text() ───────────────────────────────────────────────────


def test_classify_task_text_routes_web_keywords_to_web():
    """Pure web-keyword tasks should NOT be classified as Condura-only."""
    result = classify_task_text("Compare two philosophical schools")
    assert result in (
        ExecutionEnvironment.WEB,
        ExecutionEnvironment.HYBRID_PREP,
        ExecutionEnvironment.HYBRID_DELEGATE,
    ), (
        f"web-only task got classified as {result!r}"
    )


def test_classify_task_text_routes_local_keywords_to_condura():
    """Tasks asking to launch a desktop app must route to Condura."""
    result = classify_task_text("Open Linear and create a new issue")
    assert result in (
        ExecutionEnvironment.CONDURA,
        ExecutionEnvironment.HYBRID_PREP,
        ExecutionEnvironment.HYBRID_DELEGATE,
    ), (
        f"local-task got classified as {result!r}"
    )


def test_classify_task_text_routes_recurring_local_runs_to_hybrid_delegate():
    """Recurring on-device runs (watch every X hours, run on my machine)."""
    result = classify_task_text("Every 2 hours run a check on my machine")
    assert result == ExecutionEnvironment.HYBRID_DELEGATE, (
        f"recurring local run got classified as {result!r}"
    )


# ─── Gate / rejection helpers ──────────────────────────────────────────────


def test_evaluate_capability_gate_returns_decision_for_known_id():
    result = evaluate_capability_gate(capability_id="agent.research", task_text=None)
    assert "decision" in result
    assert result["decision"] in ("allow", "fallback", "reject")


def test_evaluate_capability_gate_handles_unknown_id():
    result = evaluate_capability_gate(capability_id="does.not.exist", task_text=None)
    # Either it's rejected outright, or it falls back gracefully.
    assert result["decision"] in ("allow", "fallback", "reject"), (
        f"unknown id produced unknown decision: {result!r}"
    )


def test_requires_local_rejection_consistent_with_honest_rejection_enabled():
    """These two helpers are read by the same fallback path; their outputs
    must agree on whether a Condura request should be rejected or
    downgraded locally."""
    for cap_id in REGISTRY.keys():
        # If honest rejection is OFF, requires_local_rejection must be False.
        # (The gate falls back to web execution instead of returning an error.)
        if not honest_rejection_enabled():
            assert requires_local_rejection(cap_id) is False, (
                f"honest_rejection_enabled() is False but requires_local_rejection({cap_id!r}) is True"
            )