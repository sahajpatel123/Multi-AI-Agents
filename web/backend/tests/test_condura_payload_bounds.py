"""Condura free-form JSON payloads must be bounded (keys + serialized size).

Event/draft bodies previously accepted arbitrary dicts. Combined with
write rate limits this still allowed a single oversized blob to land in
Postgres. Mirror the analytics metadata bound.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError


def test_event_payload_none_and_small_ok():
    from arena.routes.condura import HandoffEventBody

    assert HandoffEventBody(event_kind="started", payload=None).payload is None
    small = {"status": "ok", "n": 1}
    assert HandoffEventBody(event_kind="started", payload=small).payload == small


def test_event_payload_rejects_too_many_keys():
    from arena.routes.condura import HandoffEventBody

    with pytest.raises(ValidationError):
        HandoffEventBody(
            event_kind="started",
            payload={str(i): i for i in range(50)},
        )


def test_event_payload_rejects_oversized_blob():
    from arena.routes.condura import HandoffEventBody

    with pytest.raises(ValidationError):
        HandoffEventBody(
            event_kind="started",
            payload={"blob": "x" * 5000},
        )


def test_event_payload_rejects_non_object():
    from arena.routes.condura import HandoffEventBody

    with pytest.raises(ValidationError):
        HandoffEventBody(event_kind="started", payload=[1, 2, 3])  # type: ignore[arg-type]


def test_draft_payload_rejects_oversized():
    from arena.routes.condura import HandoffDraftBody

    with pytest.raises(ValidationError):
        HandoffDraftBody(
            capability="agent.long_research",
            payload={"blob": "y" * 60_000},
        )


def test_draft_payload_accepts_reasonable_object():
    from arena.routes.condura import HandoffDraftBody

    body = HandoffDraftBody(
        capability="agent.long_research",
        payload={"task": "research X", "steps": [1, 2, 3]},
    )
    assert body.payload["task"] == "research X"


def test_dispatch_string_fields_capped():
    from arena.routes.condura import HandoffDispatchBody

    with pytest.raises(ValidationError):
        HandoffDispatchBody(
            capability="agent.long_research",
            execution_env="hybrid",
            session_id="s" * 200,
        )
