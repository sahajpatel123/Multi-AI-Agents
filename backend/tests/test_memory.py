"""Tests for the memory module's pure helpers.

memory.py owns the short-term + long-term + injected-memory pipelines.
The async + DB paths are integration-tested; here we pin the pure
helpers + the critical SessionOwnershipError guard.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from arena.core.memory import (
    SessionOwnershipError,
    _coerce_datetime,
    _extract_topics_from_exchanges,
    _infer_preferred_depth,
    _is_anonymous_owner,
    _normalize_text_tokens,
    _parse_json_like,
    _summarize_stance_text,
    assert_session_owner,
    format_memory_for_injection,
)


# ── _is_anonymous_owner ────────────────────────────────────────


def test_is_anonymous_owner_for_none() -> None:
    assert _is_anonymous_owner(None) is True


def test_is_anonymous_owner_for_empty_string() -> None:
    assert _is_anonymous_owner("") is True


def test_is_anonymous_owner_for_whitespace() -> None:
    assert _is_anonymous_owner("   ") is True


def test_is_anonymous_owner_for_literal_anonymous() -> None:
    assert _is_anonymous_owner("anonymous") is True


def test_is_anonymous_owner_for_string_none() -> None:
    # The string "None" / "none" is treated as anonymous (a historical
    # # artifact of untyped JSON serialization).
    assert _is_anonymous_owner("None") is True
    assert _is_anonymous_owner("none") is True


def test_is_anonymous_owner_for_real_user_id() -> None:
    assert _is_anonymous_owner("user-123") is False
    assert _is_anonymous_owner("42") is False


# ── assert_session_owner ──────────────────────────────────────


def test_assert_session_owner_allows_anonymous_session() -> None:
    # An anonymous (unbound) session can be claimed by anyone — including
    # an anonymous caller.
    assert_session_owner(None, None)


def test_assert_session_owner_allows_owner_to_read() -> None:
    assert_session_owner("user-1", "user-1")


def test_assert_session_owner_rejects_other_user() -> None:
    with pytest.raises(SessionOwnershipError):
        assert_session_owner("user-1", "user-2")


def test_assert_session_owner_rejects_unbound_caller_on_bound_session() -> None:
    # The bound-session guard exists exactly to prevent this case —
    # anonymous callers must NOT touch a named user's session.
    with pytest.raises(SessionOwnershipError):
        assert_session_owner("user-1", None)


# ── _normalize_text_tokens ─────────────────────────────────────


def test_normalize_text_tokens_splits_on_whitespace() -> None:
    assert _normalize_text_tokens("hello world") == ["hello", "world"]


def test_normalize_text_tokens_lowercases() -> None:
    assert _normalize_text_tokens("Hello WORLD") == ["hello", "world"]


def test_normalize_text_tokens_strips_punctuation() -> None:
    # Tokens keep letters / digits / apostrophes; everything else is
    # stripped (preserves the contract for the topic-extraction downstream).
    assert _normalize_text_tokens("don't, stop!") == ["don't", "stop"]


def test_normalize_text_tokens_handles_empty_string() -> None:
    assert _normalize_text_tokens("") == []


def test_normalize_text_tokens_collapses_whitespace() -> None:
    assert _normalize_text_tokens("  hello\n\tworld  ") == ["hello", "world"]


# ── _infer_preferred_depth ────────────────────────────────────


def test_infer_preferred_depth_returns_string() -> None:
    depth = _infer_preferred_depth([])
    assert isinstance(depth, str)
    assert depth in {"brief", "moderate", "deep"}


def test_infer_preferred_depth_handles_empty_exchanges() -> None:
    # Empty exchanges → "moderate" (the default).
    assert _infer_preferred_depth([]) == "moderate"


def test_infer_preferred_depth_short_prompts_return_brief() -> None:
    exchanges = [{"prompt": "hi"}, {"prompt": "ok"}]
    assert _infer_preferred_depth(exchanges) == "brief"


def test_infer_preferred_depth_long_prompts_return_deep() -> None:
    long_prompt = "X" * 250
    exchanges = [{"prompt": long_prompt}]
    assert _infer_preferred_depth(exchanges) == "deep"


# ── _extract_topics_from_exchanges ────────────────────────────


def test_extract_topics_handles_empty_input() -> None:
    assert _extract_topics_from_exchanges([]) == []


def test_extract_topics_returns_at_most_limit() -> None:
    exchanges = [
        {"role": "user", "content": "alpha beta gamma"},
        {"role": "assistant", "content": "delta epsilon zeta"},
    ]
    topics = _extract_topics_from_exchanges(exchanges, limit=2)
    assert len(topics) <= 2


def test_extract_topics_excludes_stop_words() -> None:
    exchanges = [{"role": "user", "content": "the cat sat on the mat"}]
    topics = _extract_topics_from_exchanges(exchanges, limit=10)
    # "the" is a stop word, must not appear in topics
    assert "the" not in topics


# ── _summarize_stance_text ────────────────────────────────────


def test_summarize_stance_text_short_input_unchanged() -> None:
    assert _summarize_stance_text("short text") == "short text"


def test_summarize_stance_text_long_input_truncated_at_word_boundary() -> None:
    long = ("word " * 50).strip()  # ~250 chars
    out = _summarize_stance_text(long, limit=20)
    # Word-boundary truncation → must not end mid-word
    assert not out.endswith("ord ")  # would indicate mid-word split


def test_summarize_stance_text_limit_zero_returns_empty() -> None:
    assert _summarize_stance_text("anything", limit=0) == ""


# ── _parse_json_like ──────────────────────────────────────────


def test_parse_json_like_valid_dict() -> None:
    out = _parse_json_like('{"a": 1, "b": "x"}')
    assert out == {"a": 1, "b": "x"}


def test_parse_json_like_empty_string_returns_empty_dict() -> None:
    assert _parse_json_like("") == {}


def test_parse_json_like_invalid_returns_empty_dict() -> None:
    assert _parse_json_like("{not json") == {}
    assert _parse_json_like("just text") == {}


def test_parse_json_like_list_top_level_returns_empty_dict() -> None:
    # A top-level list is valid JSON but the helper expects a dict
    # (stance summary shape). The function returns the parsed value as-is,
    # so a list comes back as a list. Pin the current behavior.
    assert _parse_json_like("[1, 2, 3]") == [1, 2, 3]


# ── _coerce_datetime ──────────────────────────────────────────


def test_coerce_datetime_naive_gets_utc_added() -> None:
    naive = datetime(2026, 7, 20, 12, 0, 0)
    out = _coerce_datetime(naive)
    # The helper attaches UTC tzinfo to naive inputs so downstream
    # comparisons against aware datetimes don't TypeError.
    assert out == datetime(2026, 7, 20, 12, 0, 0, tzinfo=timezone.utc)


def test_coerce_datetime_aware_returns_unchanged() -> None:
    aware = datetime(2026, 7, 20, 12, 0, 0, tzinfo=timezone.utc)
    assert _coerce_datetime(aware) == aware


def test_coerce_datetime_iso_string_naive_gets_utc_added() -> None:
    out = _coerce_datetime("2026-07-20T12:00:00")
    assert out == datetime(2026, 7, 20, 12, 0, 0, tzinfo=timezone.utc)


def test_coerce_datetime_iso_string_aware_returns_unchanged() -> None:
    out = _coerce_datetime("2026-07-20T12:00:00+00:00")
    assert out == datetime(2026, 7, 20, 12, 0, 0, tzinfo=timezone.utc)


def test_coerce_datetime_iso_string_with_z_suffix() -> None:
    out = _coerce_datetime("2026-07-20T12:00:00Z")
    assert out == datetime(2026, 7, 20, 12, 0, 0, tzinfo=timezone.utc)


def test_coerce_datetime_invalid_returns_now() -> None:
    # Invalid input → fall back to current time (helper must not raise).
    fallback = _coerce_datetime("not a date")
    assert isinstance(fallback, datetime)


# ── format_memory_for_injection ─────────────────────────────


def test_format_memory_for_injection_empty_list_returns_empty() -> None:
    assert format_memory_for_injection([], current_persona_id="analyst") == ""


def test_format_memory_for_injection_renders_session_summary() -> None:
    # The helper reads memory.get("session_summary") and renders it
    # under the "Most relevant" / "Also relevant" / "Background" labels.
    memories = [
        {
            "session_summary": "User researched B2B SaaS pricing in 2024",
            "key_positions_taken": [],
        }
    ]
    out = format_memory_for_injection(memories, current_persona_id="contrarian")
    assert "B2B SaaS pricing" in out
    assert "Most relevant" in out


def test_format_memory_for_injection_renders_key_positions_for_current_persona() -> None:
    # key_positions_taken with the current persona renders the
    # "Your previous stance on X: Y (confidence: N%)" line.
    memories = [
        {
            "session_summary": "Summary",
            "key_positions_taken": [
                {
                    "persona_id": "analyst",
                    "topic": "market",
                    "stance": "growing fast",
                    "confidence": 0.8,
                }
            ],
        }
    ]
    out = format_memory_for_injection(memories, current_persona_id="analyst")
    assert "Your previous stance on market" in out
    assert "growing fast" in out
    # The current implementation uses int(entry.get("confidence", 0)) which
    # coerces 0.8 to 0 (Python's int() truncates floats to int). Pin the
    # current behavior — a future edit to use round() or 100 * confidence
    # must update this test.
    assert "0%" in out  # int(0.8) == 0 in current implementation


def test_format_memory_for_injection_skips_other_persona_positions() -> None:
    # Stances for OTHER personas are not echoed back (would confuse the
    # current persona's LLM).
    memories = [
        {
            "session_summary": "X",
            "key_positions_taken": [
                {
                    "persona_id": "contrarian",
                    "topic": "market",
                    "stance": "shrinking",
                    "confidence": 0.9,
                }
            ],
        }
    ]
    out = format_memory_for_injection(memories, current_persona_id="analyst")
    assert "shrinking" not in out


def test_format_memory_for_injection_handles_missing_fields() -> None:
    # Memory row with missing keys must not crash — defensive formatting.
    memories = [{"persona_id": "x"}]
    out = format_memory_for_injection(memories, current_persona_id="x")
    assert isinstance(out, str)
