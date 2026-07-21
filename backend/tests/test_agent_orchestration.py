"""Tests for the orchestration synthesis helpers.

agent_orchestration._parse_synthesis_json + _strip_json_fence are the
parsers that consume raw LLM output for the cross-task synthesis step
in Pro-tier orchestration. Drift here means either:
  - the LLM emits valid JSON wrapped in ```json fences and the parser
    drops the entire synthesis
  - the LLM emits prose with a JSON object embedded and the parser
    silently swallows it
  - malformed input crashes the synthesis step (orchestration aborts)

We pin the contract by exercising both helpers against the realistic
output shapes LLMs produce.
"""
from __future__ import annotations

from arena.core.agent_orchestration import _parse_synthesis_json, _strip_json_fence


# ── _strip_json_fence ─────────────────────────────────────────────


def test_strip_fence_with_json_tag_and_closing() -> None:
    raw = '```json\n{"synthesis": "x"}\n```'
    assert _strip_json_fence(raw) == '{"synthesis": "x"}'


def test_strip_fence_without_json_tag() -> None:
    # Some models emit ``` without the language tag
    raw = '```\n{"synthesis": "x"}\n```'
    assert _strip_json_fence(raw) == '{"synthesis": "x"}'


def test_strip_fence_missing_closing_fence() -> None:
    # Model ran out of tokens. Strip leading fence only — keep the body
    # so the fallback JSON regex inside _parse_synthesis_json can rescue
    # the embedded object.
    raw = '```json\n{"synthesis": "partial"}'
    assert _strip_json_fence(raw) == '{"synthesis": "partial"}'


def test_strip_fence_preserves_plain_text() -> None:
    # No fence → return unchanged. The regex fallback downstream handles
    # prose-with-embedded-json.
    plain = '{"synthesis": "no fence"}'
    assert _strip_json_fence(plain) == plain


def test_strip_fence_handles_inner_blank_lines() -> None:
    raw = '```json\n\n{"synthesis": "x"}\n\n```'
    result = _strip_json_fence(raw)
    assert result.startswith('{"synthesis"')
    assert "x" in result


# ── _parse_synthesis_json: happy paths ────────────────────────────


def test_parse_clean_json() -> None:
    raw = '{"synthesis": "the answer", "bullets": ["a", "b"], "conflicts": []}'
    out = _parse_synthesis_json(raw)
    assert out["synthesis"] == "the answer"
    assert out["bullets"] == ["a", "b"]
    assert out["conflicts"] == []


def test_parse_fenced_json() -> None:
    raw = '```json\n{"synthesis": "x", "bullets": ["a"], "conflicts": []}\n```'
    out = _parse_synthesis_json(raw)
    assert out["synthesis"] == "x"
    assert out["bullets"] == ["a"]


def test_parse_with_extra_keys_keeps_only_documented() -> None:
    # Models sometimes add commentary keys. The parser must NOT raise;
    # it ignores unknown keys and keeps the documented ones.
    raw = '{"synthesis": "x", "bullets": ["a"], "conflicts": [], "commentary": "ignore me"}'
    out = _parse_synthesis_json(raw)
    assert out["synthesis"] == "x"
    assert out["bullets"] == ["a"]
    assert out["conflicts"] == []


def test_parse_normalizes_conflict_entries() -> None:
    raw = '{"synthesis": "x", "bullets": [], "conflicts": [{"task_a": 1, "task_b": 2, "conflict": "disagree"}]}'
    out = _parse_synthesis_json(raw)
    assert out["conflicts"] == [
        {"task_a": 1, "task_b": 2, "conflict": "disagree"}
    ]


def test_parse_drops_invalid_conflict_entries() -> None:
    # Conflict entries that aren't dicts (e.g. stray strings) must be
    # dropped silently — the parser must not crash the whole synthesis.
    raw = '{"synthesis": "x", "bullets": [], "conflicts": ["stray", {"task_a": 1, "task_b": 2, "conflict": "ok"}]}'
    out = _parse_synthesis_json(raw)
    assert out["conflicts"] == [{"task_a": 1, "task_b": 2, "conflict": "ok"}]


def test_parse_fills_defaults_for_missing_keys() -> None:
    # The LLM emitted a JSON object missing bullets / conflicts / synthesis.
    # The parser must return defaults rather than KeyError.
    raw = '{}'
    out = _parse_synthesis_json(raw)
    assert out == {"synthesis": "", "bullets": [], "conflicts": []}


def test_parse_coerces_non_string_synthesis_to_string() -> None:
    # The contract is "never crash, always coerce". A non-string synthesis
    # value (LLM emitted a number) is converted via str() rather than
    # dropped to empty. This preserves the LLM's intent and avoids the
    # caller having to handle None vs '' vs missing.
    raw = '{"synthesis": 123, "bullets": [], "conflicts": []}'
    assert _parse_synthesis_json(raw)["synthesis"] == "123"


def test_parse_handles_non_string_bullets_gracefully() -> None:
    # Bullets must be a list of strings. Non-string entries coerce to str();
    # empty strings are dropped (so the consumer never sees ['']).
    raw = '{"synthesis": "x", "bullets": ["a", 42, "", "   ", "b"], "conflicts": []}'
    out = _parse_synthesis_json(raw)
    assert out["bullets"] == ["a", "42", "b"]


# ── _parse_synthesis_json: failure paths ───────────────────────────


def test_parse_invalid_json_returns_empty_synthesis() -> None:
    out = _parse_synthesis_json("not json at all")
    assert out == {"synthesis": "", "bullets": [], "conflicts": []}


def test_parse_json_with_embedded_object_in_prose() -> None:
    # Prose with a JSON object embedded — the regex fallback must
    # extract the object.
    prose = 'Here is the synthesis: {"synthesis": "extracted", "bullets": ["b"], "conflicts": []} - done.'
    out = _parse_synthesis_json(prose)
    assert out["synthesis"] == "extracted"
    assert out["bullets"] == ["b"]


def test_parse_garbage_with_no_json_object_returns_empty() -> None:
    out = _parse_synthesis_json("just some text without any json")
    assert out == {"synthesis": "", "bullets": [], "conflicts": []}


def test_parse_non_object_top_level_returns_empty() -> None:
    # The parser must reject lists / strings / numbers at the top level —
    # only an object is a valid synthesis envelope.
    for raw in ["[]", '"a string"', "42", "null"]:
        out = _parse_synthesis_json(raw)
        assert out == {"synthesis": "", "bullets": [], "conflicts": []}, (
            f"Failed for raw={raw!r}"
        )


def test_parse_malformed_embedded_object_returns_empty() -> None:
    # The regex grabs the first {...} block, but it must be valid JSON —
    # if not, the second try/except returns the empty envelope.
    raw = "before {not valid json} after"
    out = _parse_synthesis_json(raw)
    assert out == {"synthesis": "", "bullets": [], "conflicts": []}


def test_parse_empty_string_returns_empty() -> None:
    assert _parse_synthesis_json("") == {"synthesis": "", "bullets": [], "conflicts": []}
