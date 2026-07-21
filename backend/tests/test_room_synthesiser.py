"""Tests for the room synthesis helpers.

room_synthesiser._parse_json_object and _empty_result are the small
helpers consumed by synthesise_room. Drift here means either the room
synthesis silently returns the empty envelope (frontend shows nothing)
or crashes the room on malformed LLM output.

We pin:
  - _empty_result returns the documented 4-key envelope
  - _parse_json_object strips fences (with and without language tag),
    rejects non-dict top-level, returns None on malformed input
"""
from __future__ import annotations

from arena.core.room_synthesiser import _empty_result, _parse_json_object


# ── _empty_result ──────────────────────────────────────────────────


def test_empty_result_has_documented_envelope_shape() -> None:
    out = _empty_result()
    # The synthesise_room contract returns {contradictions, patterns,
    # blind_spots, synthesis}. The RoomPage UI iterates over each of
    # these keys — a missing key would silently render an empty panel.
    assert set(out.keys()) == {"contradictions", "patterns", "blind_spots", "synthesis"}
    assert out["contradictions"] == []
    assert out["patterns"] == []
    assert out["blind_spots"] == []
    assert out["synthesis"] == ""


def test_empty_result_returns_fresh_independent_dicts() -> None:
    # Each call must return a fresh dict so callers can mutate the
    # result without poisoning subsequent empty-fallback paths.
    a = _empty_result()
    b = _empty_result()
    assert a is not b
    a["contradictions"].append("mutated")
    assert b["contradictions"] == []


# ── _parse_json_object: happy paths ────────────────────────────────


def test_parse_plain_json_object() -> None:
    raw = '{"contradictions": [], "patterns": ["a"], "synthesis": "ok"}'
    out = _parse_json_object(raw)
    assert out == {"contradictions": [], "patterns": ["a"], "synthesis": "ok"}


def test_parse_fenced_json_with_language_tag() -> None:
    raw = '```json\n{"patterns": ["a"]}\n```'
    out = _parse_json_object(raw)
    assert out == {"patterns": ["a"]}


def test_parse_fenced_json_without_language_tag() -> None:
    raw = '```\n{"patterns": ["a"]}\n```'
    out = _parse_json_object(raw)
    assert out == {"patterns": ["a"]}


def test_parse_handles_inner_whitespace_and_newlines() -> None:
    raw = '```json\n\n{\n  "patterns": ["x"]\n}\n\n```'
    out = _parse_json_object(raw)
    assert out == {"patterns": ["x"]}


def test_parse_returns_original_when_already_clean_json() -> None:
    # If the input is already a clean JSON object (no fence), the
    # parser should still parse it correctly. The regex fence-strip
    # branch should not destroy clean input.
    raw = '{"synthesis": "no fence here"}'
    out = _parse_json_object(raw)
    assert out == {"synthesis": "no fence here"}


# ── _parse_json_object: failure paths ─────────────────────────────


def test_parse_empty_string_returns_none() -> None:
    assert _parse_json_object("") is None


def test_parse_whitespace_only_returns_none() -> None:
    # Sanity: whitespace-only should be treated as empty (the strip
    # happens before the JSON parse, so empty + whitespace look the
    # same to the parser).
    assert _parse_json_object("   \n\t  ") is None


def test_parse_unfenced_malformed_json_returns_none() -> None:
    out = _parse_json_object("not json at all")
    assert out is None


def test_parse_fenced_malformed_json_returns_none() -> None:
    # Fence wrapper is stripped, but the body is still invalid JSON —
    # the parser must not silently return an empty envelope.
    out = _parse_json_object("```json\n{not valid}\n```")
    assert out is None


def test_parse_non_dict_top_level_returns_none() -> None:
    # Real LLMs sometimes emit a bare list when asked for an object.
    # The parser must NOT wrap it as a dict — that would silently
    # change the consumer's iteration shape.
    for raw in ["[]", '"just a string"', "42", "null", "true"]:
        assert _parse_json_object(raw) is None, f"Failed for {raw!r}"


def test_parse_fenced_list_returns_none() -> None:
    # Same guarantee when the list is wrapped in a fence.
    assert _parse_json_object("```json\n[1, 2, 3]\n```") is None


def test_parse_garbage_with_partial_object_returns_none() -> None:
    # Unlike _parse_synthesis_json in agent_orchestration, the room
    # parser does NOT have a regex-fallback rescue path — it relies on
    # the LLM emitting valid JSON. Garbage must return None.
    out = _parse_json_object("before {not valid} after")
    assert out is None


def test_parse_handles_extra_keys_silently() -> None:
    # Models sometimes add commentary. The parser must NOT raise; it
    # returns the dict verbatim and the caller is expected to filter
    # to the documented keys.
    raw = '{"patterns": ["a"], "extra_commentary": "ignore"}'
    out = _parse_json_object(raw)
    assert out == {"patterns": ["a"], "extra_commentary": "ignore"}
