"""Unit tests for arena.core.handoff_status named status constants."""

from __future__ import annotations

from arena.core import handoff_status as hs


def test_streaming_and_terminal_partition():
    assert hs.STREAMING_STATES.isdisjoint(hs.TERMINAL_STATES)
    assert hs.ALL_KNOWN_STATUSES == hs.STREAMING_STATES | hs.TERMINAL_STATES


def test_is_streaming_helpers():
    assert hs.is_streaming(hs.DISPATCH_PENDING) is True
    assert hs.is_streaming(hs.DISPATCHED) is True
    assert hs.is_streaming(hs.STREAMING) is True
    assert hs.is_streaming(hs.COMPLETE) is False
    assert hs.is_streaming(None) is False
    assert hs.is_streaming("bogus") is False


def test_is_terminal_helpers():
    for s in hs.TERMINAL_STATES:
        assert hs.is_terminal(s) is True
    assert hs.is_terminal(hs.DISPATCHED) is False
    assert hs.is_terminal(None) is False


def test_allowed_event_kinds_cover_progress_and_terminal():
    assert "started" in hs.ALLOWED_EVENT_KINDS
    assert "progress" in hs.ALLOWED_EVENT_KINDS
    assert "result" in hs.ALLOWED_EVENT_KINDS
    assert hs.COMPLETE in hs.ALLOWED_EVENT_KINDS
    assert hs.STREAM_LOST in hs.ALLOWED_EVENT_KINDS
    assert "random_noise" not in hs.ALLOWED_EVENT_KINDS


def test_constant_string_values_stable():
    # Pin public contract consumed by routes + reconciler + db defaults.
    assert hs.DISPATCH_PENDING == "dispatch_pending"
    assert hs.COMPLETE == "complete"
    assert hs.RECONCILE_NEEDED == "reconcile_needed"
