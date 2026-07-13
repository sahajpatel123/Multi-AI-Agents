"""Named handoff status constants.

Single source of truth shared by condura.py (route), condura_reconciler.py
(scheduler), and db_models.py (default). Import from here instead of repeating
raw string literals — see ADR-0001 §4 (status drift risk).
"""

from __future__ import annotations


# Initial state at dispatch. Used by db_models default + route create path.
DISPATCH_PENDING = "dispatch_pending"
DISPATCHED = "dispatched"

# In-flight states the reconciler treats as stale candidates (no terminal event
# yet, may have been abandoned).
STREAMING = "streaming"
STREAMING_STATES = frozenset({DISPATCH_PENDING, DISPATCHED, STREAMING})

# Terminal / known-status states. Once set, the reconciler leaves the row alone.
COMPLETE = "complete"
FAILED = "failed"
CANCELLED = "cancelled"
STREAM_LOST = "stream_lost"
RECONCILE_NEEDED = "reconcile_needed"
TERMINAL_STATES = frozenset({COMPLETE, FAILED, CANCELLED, STREAM_LOST, RECONCILE_NEEDED})

# Event kinds that bump status to STREAMING (non-terminal progress events).
RUNNING_EVENT_KINDS = frozenset({"started", "progress", "result"})

# All known status strings. Used by the route's allow-list guard.
ALL_KNOWN_STATUSES = STREAMING_STATES | TERMINAL_STATES


def is_streaming(status: str | None) -> bool:
    return status in STREAMING_STATES


def is_terminal(status: str | None) -> bool:
    return status in TERMINAL_STATES


# Event kinds accepted by the events route (defense-in-depth: browser-mediated,
# but we still validate kind shapes before persisting them as status).
ALLOWED_EVENT_KINDS = frozenset(
    TERMINAL_STATES
    | STREAMING_STATES
    | RUNNING_EVENT_KINDS
)