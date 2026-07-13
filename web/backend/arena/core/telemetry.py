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
