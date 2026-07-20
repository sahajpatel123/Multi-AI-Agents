"""Tests for the telemetry counters + Prometheus rendering.

telemetry exposes in-process counters for the Condura integration
metrics endpoint. The counters are thread-safe (acquired under a single
lock), labeled, and rendered as Prometheus text format for `/api/metrics`.

Drift here means either:
  - counters silently drop increments (concurrency bug)
  - Prometheus output breaks the exposition format (scraper rejects)
  - probe_state accepts a non-categorical kind and leaks a port / path
    (privacy violation per TELEMETRY.md)
"""
from __future__ import annotations

import threading

import pytest

from arena.core import telemetry


@pytest.fixture(autouse=True)
def _reset_counters():
    """Each test gets a clean counter map so the assertions are isolated."""
    telemetry._counters.clear()
    yield
    telemetry._counters.clear()


# ── _key (label serialization) ────────────────────────────────────


def test_key_with_no_labels_returns_just_name() -> None:
    assert telemetry._key("my_counter", None) == "my_counter"
    assert telemetry._key("my_counter", {}) == "my_counter"


def test_key_with_labels_returns_sorted_csv() -> None:
    # Sorted by key so the same logical label set always produces the
    # same key — without sort, {"a": "1", "b": "2"} and {"b": "2",
    # "a": "1"} would be two distinct counters.
    assert telemetry._key("c", {"b": "2", "a": "1"}) == "c{a=1,b=2}"
    assert telemetry._key("c", {"a": "1", "b": "2"}) == "c{a=1,b=2}"


def test_key_single_label() -> None:
    assert telemetry._key("c", {"capability": "x"}) == "c{capability=x}"


# ── incr + snapshot ───────────────────────────────────────────────


def test_incr_default_amount_is_one() -> None:
    telemetry.incr("c1")
    assert telemetry.snapshot() == {"c1": 1}


def test_incr_accepts_amount() -> None:
    telemetry.incr("c2", amount=5)
    assert telemetry.snapshot() == {"c2": 5}


def test_incr_accumulates_across_calls() -> None:
    telemetry.incr("c3", amount=2)
    telemetry.incr("c3", amount=3)
    telemetry.incr("c3")
    assert telemetry.snapshot() == {"c3": 6}


def test_incr_with_distinct_labels_creates_distinct_counters() -> None:
    telemetry.incr("c4", labels={"k": "a"})
    telemetry.incr("c4", labels={"k": "b"})
    snap = telemetry.snapshot()
    assert snap["c4{k=a}"] == 1
    assert snap["c4{k=b}"] == 1


def test_incr_with_same_labels_accumulates() -> None:
    telemetry.incr("c5", labels={"k": "x"})
    telemetry.incr("c5", labels={"k": "x"}, amount=4)
    assert telemetry.snapshot() == {"c5{k=x}": 5}


def test_incr_thread_safe_under_concurrent_writes() -> None:
    """100 threads each calling incr 100 times → counter == 10000.

    If the lock were dropped or replaced with a non-atomic op, some
    increments would be lost and the count would be < 10000.
    """
    iterations = 100
    threads = 100

    def worker():
        for _ in range(iterations):
            telemetry.incr("thread_safe")

    ts = [threading.Thread(target=worker) for _ in range(threads)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert telemetry.snapshot() == {"thread_safe": iterations * threads}


def test_snapshot_returns_a_copy_not_a_reference() -> None:
    """Callers must not be able to mutate the internal counter dict."""
    telemetry.incr("c6")
    snap = telemetry.snapshot()
    snap["c6"] = 999  # try to mutate
    # The internal counter is untouched
    assert telemetry.snapshot()["c6"] == 1


# ── record_* helpers ──────────────────────────────────────────────


def test_record_guard_decision_uses_documented_labels() -> None:
    telemetry.record_guard_decision("agent.research", "allow")
    snap = telemetry.snapshot()
    # The label set is fixed at {capability_id, decision}. Any drift
    # here would invalidate downstream dashboards.
    assert snap["capability_guard_decisions_total{capability_id=agent.research,decision=allow}"] == 1


def test_record_guard_decision_normalizes_empty_capability() -> None:
    telemetry.record_guard_decision("", "allow")
    snap = telemetry.snapshot()
    # Empty / None capability_id must collapse to "unknown" — the
    # call site of record_guard_decision is forgiving on input, but the
    # labeled series must always have a value.
    assert "capability_id=unknown" in next(iter(snap))


def test_record_handoff_dispatched_increments_labeled_counter() -> None:
    telemetry.record_handoff_dispatched("app.open_in_linear")
    snap = telemetry.snapshot()
    assert snap["handoffs_dispatched_total{capability_id=app.open_in_linear}"] == 1


def test_record_pairing_mismatch_increments_unlabeled_counter() -> None:
    telemetry.record_pairing_mismatch()
    telemetry.record_pairing_mismatch()
    assert telemetry.snapshot() == {"pairing_mismatch_total": 2}


def test_record_migration_flag_increments_unlabeled_counter() -> None:
    telemetry.record_migration_flag()
    assert telemetry.snapshot() == {"migration_flags_total": 1}


def test_record_probe_state_accepts_categorical_kinds() -> None:
    for kind in ("not_installed", "installed_not_running", "ready"):
        telemetry.record_probe_state(kind)
    snap = telemetry.snapshot()
    assert snap["condura_probe_state_total{kind=not_installed}"] == 1
    assert snap["condura_probe_state_total{kind=installed_not_running}"] == 1
    assert snap["condura_probe_state_total{kind=ready}"] == 1


def test_record_probe_state_falls_back_to_unknown_for_invalid_kind() -> None:
    # Privacy guard: any unknown kind (including something like a port
    # number or a file path) must be coerced to the "unknown" category.
    # This is the contract that prevents the metrics endpoint from
    # leaking probe targets.
    telemetry.record_probe_state("localhost:9999")  # type: ignore[arg-type]
    telemetry.record_probe_state("malicious")  # type: ignore[arg-type]
    telemetry.record_probe_state(None)  # type: ignore[arg-type]
    snap = telemetry.snapshot()
    # All three collapse to "unknown"
    assert snap.get("condura_probe_state_total{kind=unknown}", 0) == 3
    # No counter with the literal probe value was created
    assert all("localhost" not in k for k in snap)
    assert all("malicious" not in k for k in snap)


def test_admin_metrics_payload_returns_counters_dict() -> None:
    telemetry.incr("a", amount=3)
    telemetry.incr("b", labels={"x": "y"}, amount=2)
    payload = telemetry.admin_metrics_payload()
    assert payload == {
        "counters": {"a": 3, "b{x=y}": 2},
    }


# ── _escape_label_value (Prometheus exposition format) ─────────────


def test_escape_label_value_escapes_backslash() -> None:
    assert telemetry._escape_label_value("a\\b") == "a\\\\b"


def test_escape_label_value_escapes_double_quote() -> None:
    assert telemetry._escape_label_value('a"b') == 'a\\"b'


def test_escape_label_value_escapes_newline() -> None:
    # The actual output string contains the literal 2-char escape "\n"
    # (backslash + n) where the input had a real newline character.
    assert telemetry._escape_label_value("a\nb") == "a\\nb"


def test_escape_label_value_escapes_all_three_in_one_value() -> None:
    assert telemetry._escape_label_value('a\\b"c\nd') == 'a\\\\b\\"c\\nd'


def test_escape_label_value_leaves_safe_text_unchanged() -> None:
    assert telemetry._escape_label_value("hello-world_42") == "hello-world_42"


# ── render_prometheus ───────────────────────────────────────────────


def test_render_prometheus_emits_help_and_type_for_declared_counters() -> None:
    telemetry.incr("capability_guard_decisions_total", labels={"capability_id": "x", "decision": "allow"})
    out = telemetry.render_prometheus()
    # HELP / TYPE come once per metric name, then the series.
    assert "# HELP capability_guard_decisions_total" in out
    assert "# TYPE capability_guard_decisions_total counter" in out
    assert 'capability_guard_decisions_total{capability_id="x",decision="allow"} 1' in out


def test_render_prometheus_emits_untyped_for_undeclared_counters() -> None:
    telemetry.incr("custom_metric", amount=7)
    out = telemetry.render_prometheus()
    assert "# TYPE custom_metric untyped" in out
    assert "custom_metric 7" in out


def test_render_prometheus_skips_declared_counters_with_no_observations() -> None:
    # The implementation only renders counters that have been incremented
    # at least once. Declared-but-zero counters are omitted from the
    # output (this is the current contract — dashboards that need
    # zero-buckets would have to seed observations). Lock the behavior so
    # a future change to "render declared counters at 0" trips this test.
    out = telemetry.render_prometheus()
    for name in telemetry._COUNTER_TYPES:
        assert name not in out, (
            f"Declared counter {name} appeared in output without any observation; "
            f"if this is now intentional, update the test."
        )
