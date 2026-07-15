"""The anonymous /analytics/event endpoint must bound its free-form metadata
blob so it can't be used to bloat the uxevents table."""

import pytest
from pydantic import ValidationError


def _make(metadata):
    from arena.routes.analytics import UXEventRequest

    return UXEventRequest(
        session_id="sess-123",
        event_type="card_click",
        metadata=metadata,
    )


def test_metadata_none_and_small_ok():
    assert _make(None).metadata is None
    small = {"a": 1, "b": "hello", "nested": {"x": [1, 2, 3]}}
    assert _make(small).metadata == small


def test_metadata_rejects_too_many_keys():
    with pytest.raises(ValidationError):
        _make({str(i): i for i in range(31)})


def test_metadata_rejects_oversized_payload():
    with pytest.raises(ValidationError):
        _make({"blob": "x" * 4100})


def test_metadata_rejects_non_object():
    with pytest.raises(ValidationError):
        _make([1, 2, 3])
