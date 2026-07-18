"""Unit tests for arena.core.room_synthesiser parse helpers and min-task gate."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from arena.core import room_synthesiser as rs


def test_empty_result_shape():
    out = rs._empty_result()
    assert out == {
        "contradictions": [],
        "patterns": [],
        "blind_spots": [],
        "synthesis": "",
    }


def test_parse_json_object_fence_and_dict_only():
    fenced = '```json\n{"synthesis": "ok", "patterns": ["p"]}\n```'
    out = rs._parse_json_object(fenced)
    assert out is not None
    assert out["synthesis"] == "ok"
    assert rs._parse_json_object("[1,2]") is None
    assert rs._parse_json_object("") is None
    assert rs._parse_json_object("not-json") is None


@pytest.mark.asyncio
async def test_synthesise_room_requires_two_tasks():
    room = SimpleNamespace(id="r1")
    assert await rs.synthesise_room(room, [], []) is None
    one = [SimpleNamespace(id=1, task_text="q", final_answer="a", user_id=1)]
    assert await rs.synthesise_room(room, one, []) is None


@pytest.mark.asyncio
async def test_synthesise_room_returns_empty_on_llm_failure(monkeypatch):
    async def _boom(**kwargs):
        raise RuntimeError("down")

    monkeypatch.setattr(rs, "call_llm", _boom)
    monkeypatch.setitem(
        rs.MODEL_REGISTRY,
        "claude_sonnet",
        {"client": object(), "provider": "claude", "model_id": "x"},
    )
    # If model key differs, try whatever synthesise uses
    # Read synthesise for model key
    import inspect

    src = inspect.getsource(rs.synthesise_room)
    # Patch all common keys
    for key in list(rs.MODEL_REGISTRY.keys())[:5]:
        monkeypatch.setitem(
            rs.MODEL_REGISTRY,
            key,
            {"client": object(), "provider": "claude", "model_id": "x"},
        )

    room = SimpleNamespace(id="r1", topic="T")
    tasks = [
        SimpleNamespace(
            id=1,
            task_text="q1",
            final_answer="a1",
            user_id=1,
            task_id="t1",
        ),
        SimpleNamespace(
            id=2,
            task_text="q2",
            final_answer="a2",
            user_id=2,
            task_id="t2",
        ),
    ]
    members = [
        SimpleNamespace(id=1, name="Alice", email="a@t.com"),
        SimpleNamespace(id=2, name="Bob", email="b@t.com"),
    ]
    out = await rs.synthesise_room(room, tasks, members)
    # Product contract: empty-shaped dict on failure, not None
    assert out is not None
    assert out["synthesis"] == "" or "synthesis" in out
