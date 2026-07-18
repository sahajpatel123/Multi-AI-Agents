"""Opt-in anonymous counters for Condura integration.

See docs/condura/INTEGRATION.md privacy notes and TELEMETRY callouts:
probe results are categorical only; no localhost targets beyond state enum.
"""

from __future__ import annotations

import logging
import threading
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_counters: dict[str, int] = defaultdict(int)

# Categorical label sets per counter — used to emit Prometheus HELP/TYPE
# lines so scrapers render the values as the right metric type. Counters
# without a declared type are emitted as untyped.
_COUNTER_TYPES: dict[str, str] = {
    "capability_guard_decisions_total": "counter",
    "handoffs_dispatched_total": "counter",
    "pairing_mismatch_total": "counter",
    "migration_flags_total": "counter",
    "condura_probe_state_total": "counter",
}

# One-line HELP strings, surfaced to scrapers. Keep them short — these
# appear in dashboards and alert descriptions.
_COUNTER_HELP: dict[str, str] = {
    "capability_guard_decisions_total": (
        "Total capability gate decisions, labelled by capability_id and decision."
    ),
    "handoffs_dispatched_total": "Condura handoffs dispatched, labelled by capability_id.",
    "pairing_mismatch_total": "Times a handoff request was rejected because the local/Condura pairing did not match.",
    "migration_flags_total": "Migration flags surfaced to the user.",
    "condura_probe_state_total": "Condura probe state enumerations from the client.",
}


def _key(name: str, labels: dict[str, str] | None) -> str:
    if not labels:
        return name
    parts = ",".join(f"{k}={v}" for k, v in sorted(labels.items()))
    return f"{name}{{{parts}}}"


def incr(name: str, labels: dict[str, str] | None = None, amount: int = 1) -> None:
    with _lock:
        _counters[_key(name, labels)] += amount


def snapshot() -> dict[str, int]:
    with _lock:
        return dict(_counters)


def record_guard_decision(capability_id: str, decision: str) -> None:
    incr(
        "capability_guard_decisions_total",
        {"capability_id": capability_id or "unknown", "decision": decision},
    )


def record_handoff_dispatched(capability_id: str) -> None:
    incr("handoffs_dispatched_total", {"capability_id": capability_id or "unknown"})


def record_pairing_mismatch() -> None:
    incr("pairing_mismatch_total")


def record_migration_flag() -> None:
    incr("migration_flags_total")


def record_probe_state(kind: str) -> None:
    """kind is categorical: not_installed | installed_not_running | ready.

    Never records ports, paths, or probe targets — only the state enum.
    """
    if kind not in {"not_installed", "installed_not_running", "ready", "unknown"}:
        kind = "unknown"
    incr("condura_probe_state_total", {"kind": kind})


def admin_metrics_payload() -> dict[str, Any]:
    return {"counters": snapshot()}


def _escape_label_value(value: str) -> str:
    """Escape a Prometheus label value.

    Backslash, double-quote, and newline must be escaped, per
    https://prometheus.io/docs/instrumenting/exposition_formats/#text-based-format.
    """
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
    )


def render_prometheus() -> str:
    """Render the in-process counters as a Prometheus text-format response.

    The output groups by metric name, emits HELP/TYPE comments once per
    name, then prints each labelled series. Undeclared counters are
    emitted as `# TYPE <name> untyped` so scrapers still accept them
    while flagging the gap for the next maintainer.
    """
    with _lock:
        snapshot = dict(_counters)

    # Group series by metric name and keep the original series ordering so
    # emitted text is stable across calls.
    grouped: dict[str, list[tuple[dict[str, str], int]]] = defaultdict(list)
    for series, value in snapshot.items():
        # ``series`` is "<name>{k=v,...}" or "<name>".
        if "{" in series:
            name, _, label_blob = series.partition("{")
            label_blob = label_blob.rstrip("}")
            labels: dict[str, str] = {}
            for part in label_blob.split(","):
                if "=" in part:
                    k, _, v = part.partition("=")
                    labels[k] = v
        else:
            name, labels = series, {}
        grouped[name].append((labels, value))

    lines: list[str] = []
    for name in sorted(grouped):
        metric_type = _COUNTER_TYPES.get(name, "untyped")
        help_text = _COUNTER_HELP.get(name)
        if help_text:
            lines.append(f"# HELP {name} {help_text}")
        lines.append(f"# TYPE {name} {metric_type}")
        # Stable ordering: sort by sorted-label-tuples so output is diff-friendly.
        for labels, value in sorted(
            grouped[name], key=lambda pair: tuple(sorted(pair[0].items()))
        ):
            if labels:
                rendered = ",".join(
                    f'{k}="{_escape_label_value(v)}"'
                    for k, v in sorted(labels.items())
                )
                lines.append(f"{name}{{{rendered}}} {value}")
            else:
                lines.append(f"{name} {value}")
    return "\n".join(lines) + "\n"
