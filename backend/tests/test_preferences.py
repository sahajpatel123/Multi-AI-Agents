"""Unit tests for arena.core.preferences inference + update helpers."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from arena.core import preferences as prefs


def _prefs_row(**overrides):
    row = SimpleNamespace(
        user_id=1,
        preferred_depth="moderate",
        trusted_persona_id=None,
        topic_interests=[],
        total_prompts=0,
        total_debates=0,
        total_discusses=0,
        most_used_panel=None,
    )
    for k, v in overrides.items():
        setattr(row, k, v)
    return row


def _db():
    db = MagicMock()
    return db


@pytest.mark.asyncio
async def test_infer_depth_from_prompt_length(monkeypatch):
    row = _prefs_row()
    monkeypatch.setattr(prefs, "_ensure_preferences", lambda user_id, db: row)
    db = _db()

    await prefs.infer_preferences_from_session(
        1,
        {
            "exchanges": [
                {"prompt": "short", "mode": "prompt"},
                {"prompt": "x" * 100, "mode": "prompt"},
            ],
            "summary": {},
        },
        db,
    )
    # avg length = (5 + 100) / 2 = 52.5 → brief
    assert row.preferred_depth == "brief"
    assert row.total_prompts == 2
    db.commit.assert_called()


@pytest.mark.asyncio
async def test_infer_deep_depth_and_mode_counters(monkeypatch):
    row = _prefs_row(total_prompts=3, total_debates=1, total_discusses=0)
    monkeypatch.setattr(prefs, "_ensure_preferences", lambda user_id, db: row)

    await prefs.infer_preferences_from_session(
        1,
        {
            "exchanges": [
                {"prompt": "p" * 200, "mode": "debate", "winner_persona_id": "analyst"},
                {"prompt": "q" * 200, "mode": "discuss", "winner_persona_id": "analyst"},
                {"prompt": "r" * 200, "mode": "debate", "winner_persona_id": "stoic"},
            ],
            "summary": {"main_topics": ["AI", "AI", "markets"]},
        },
        _db(),
    )
    assert row.preferred_depth == "deep"
    assert row.trusted_persona_id == "analyst"
    assert row.total_prompts == 6
    assert row.total_debates == 3
    assert row.total_discusses == 1
    assert row.topic_interests == ["AI", "markets"]


@pytest.mark.asyncio
async def test_infer_most_used_panel_and_topic_cap(monkeypatch):
    existing = [f"t{i}" for i in range(11)]
    row = _prefs_row(topic_interests=list(existing))
    monkeypatch.setattr(prefs, "_ensure_preferences", lambda user_id, db: row)

    panel_a = [
        {"persona_id": "a"},
        {"persona_id": "b"},
        {"persona_id": "c"},
        {"persona_id": "d"},
    ]
    panel_b = [
        {"persona_id": "w"},
        {"persona_id": "x"},
        {"persona_id": "y"},
        {"persona_id": "z"},
    ]
    await prefs.infer_preferences_from_session(
        1,
        {
            "exchanges": [
                {"prompt": "m" * 80, "all_responses": panel_a},
                {"prompt": "m" * 80, "all_responses": panel_a},
                {"prompt": "m" * 80, "all_responses": panel_b},
            ],
            "summary": {"main_topics": ["new-topic"]},
        },
        _db(),
    )
    assert row.preferred_depth == "moderate"
    assert row.most_used_panel == ["a", "b", "c", "d"]
    # Cap at last 12 interests.
    assert len(row.topic_interests) == 12
    assert row.topic_interests[-1] == "new-topic"


@pytest.mark.asyncio
async def test_update_user_preferences_only_known_attrs(monkeypatch):
    row = _prefs_row()
    monkeypatch.setattr(prefs, "_ensure_preferences", lambda user_id, db: row)
    db = _db()

    out = await prefs.update_user_preferences(
        1,
        {"preferred_depth": "deep", "not_a_column": "ignored"},
        db,
    )
    assert out is row
    assert row.preferred_depth == "deep"
    assert not hasattr(row, "not_a_column")
    db.commit.assert_called()
