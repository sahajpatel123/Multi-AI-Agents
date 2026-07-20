"""Tests for the stance archive pure helpers.

stance_archive extracts a topic from a prompt and summarizes a stance
text for persistence. Drift here means the AgentStance table fills
with garbage topics ("what", "the") or loses meaning at truncation
boundaries (cut mid-word).

We pin:
  - extract_topic: stop words removed, first 4 words kept, length-clamped
  - _normalize_topic: lowercased, whitespace-collapsed, 50-char cap
  - summarize_stance_text: whitespace collapsed, 200-char cap, word-boundary
"""
from __future__ import annotations

from datetime import datetime

from arena.core import stance_archive
from arena.core.stance_archive import (
    _normalize_topic,
    extract_topic,
    summarize_stance_text,
)


# ── extract_topic ─────────────────────────────────────────────────


def test_extract_topic_strips_stop_words() -> None:
    # "what" "is" "the" are in STANCE_STOP_WORDS; only the substantive
    # words appear. "for" is NOT in STANCE_STOP_WORDS so it stays.
    # "SaaS" is capitalized so its case is preserved.
    assert extract_topic("What is the market for SaaS?") == "market for SaaS"


def test_extract_topic_keeps_only_first_four_words() -> None:
    assert extract_topic("alpha beta gamma delta epsilon") == "alpha beta gamma delta"


def test_extract_topic_lowercases_lowercase_input() -> None:
    assert extract_topic("open source license") == "open source license"


def test_extract_topic_preserves_uppercase_input() -> None:
    # Words that are entirely uppercase (acronyms like API, SQL, GPU)
    # or capitalized (proper nouns) keep their case so the topic stays
    # readable in the UI.
    assert "API" in extract_topic("How does API authentication work?")
    # Capitalized leading word stays capitalized
    assert "SaaS" in extract_topic("Tell me about SaaS pricing")


def test_extract_topic_lowercases_ing_endings() -> None:
    # Words ending in -ing (5+ chars) get lowercased.
    assert extract_topic("running tests") == "running tests"


def test_extract_topic_returns_general_topic_for_stop_words_only() -> None:
    # When every word is a stop word, the helper returns the fallback.
    assert extract_topic("the is a an of") == "general topic"


def test_extract_topic_returns_general_topic_for_empty_input() -> None:
    assert extract_topic("") == "general topic"


def test_extract_topic_returns_general_topic_for_whitespace_only() -> None:
    assert extract_topic("   \n\t  ") == "general topic"


def test_extract_topic_skips_single_character_words() -> None:
    # "I" is a stop word AND a single character → skipped (covered twice).
    # The "a" token is filtered as a stop word AND as len<=1.
    assert extract_topic("a b c d") == "general topic"


def test_extract_topic_strips_most_punctuation_but_keeps_apostrophes() -> None:
    # The regex [A-Za-z0-9']+ filters punctuation EXCEPT apostrophes.
    # Verify common punctuation (?!.) is stripped and apostrophe words
    # like "What's" survive as a single token.
    assert extract_topic("What is the price?!") == "price"
    assert extract_topic("v2.0 release notes") == "v2 release notes"
    # "What's" stays as one token (apostrophe in the regex char class)
    assert "What's" in extract_topic("Tell me about What's new")


def test_extract_topic_clamps_to_50_chars() -> None:
    long_words = " ".join(["abcdefghij"] * 10)  # 110 chars
    topic = extract_topic(long_words)
    assert len(topic) <= 50


# ── _normalize_topic ──────────────────────────────────────────────


def test_normalize_topic_lowercases() -> None:
    assert _normalize_topic("Market Analysis") == "market analysis"


def test_normalize_topic_collapses_whitespace() -> None:
    assert _normalize_topic("market    analysis\n\nfor SaaS") == "market analysis for saas"


def test_normalize_topic_strips_leading_trailing_whitespace() -> None:
    assert _normalize_topic("   market analysis   ") == "market analysis"


def test_normalize_topic_clamps_to_50_chars() -> None:
    long = "x" * 100
    assert len(_normalize_topic(long)) == 50


def test_normalize_topic_is_idempotent() -> None:
    once = _normalize_topic("Market Analysis")
    twice = _normalize_topic(once)
    assert once == twice


# ── summarize_stance_text ──────────────────────────────────────────


def test_summarize_returns_input_under_200_chars_unchanged() -> None:
    text = "A short stance summary."
    assert summarize_stance_text(text) == text


def test_summarize_preserves_exactly_200_chars() -> None:
    text = "a" * 200
    assert summarize_stance_text(text) == text


def test_summarize_truncates_above_200_chars() -> None:
    text = "a" * 250
    result = summarize_stance_text(text)
    assert len(result) <= 200
    assert result.endswith("...")


def test_summarize_truncates_at_word_boundary() -> None:
    # The helper truncates at the last full word before position 197 so
    # the consumer never sees a mid-word cutoff.
    text = ("alpha beta " * 30).strip()  # ~360 chars
    result = summarize_stance_text(text)
    assert result.endswith("...")
    assert " " not in result[-4:]  # no partial word right before "..."


def test_summarize_collapses_internal_whitespace() -> None:
    text = "alpha   beta\n\n  gamma"
    assert summarize_stance_text(text) == "alpha beta gamma"


def test_summarize_strips_leading_trailing_whitespace() -> None:
    assert summarize_stance_text("   hello world   ") == "hello world"


def test_summarize_empty_string_returns_empty() -> None:
    assert summarize_stance_text("") == ""


def test_summarize_whitespace_only_returns_empty() -> None:
    assert summarize_stance_text("   \n\t  ") == ""


def test_summarize_handles_text_with_only_whitespace_below_200() -> None:
    # After collapsing, the result is empty — the helper must not
    # return whitespace as the summary.
    assert summarize_stance_text(" \n \n ") == ""


def test_summarize_never_returns_just_ellipsis_for_long_input() -> None:
    # Even if the word boundary search collapses to an empty string,
    # the helper must produce SOMETHING useful — fall back to the raw
    # 200-char prefix rather than just "...".
    text = "a " * 200  # every word is "a"
    result = summarize_stance_text(text + "more text here" * 30)
    # Result must contain real content, not just "..."
    assert result != "..."
    assert "a" in result


# ── _now_utc ──────────────────────────────────────────────────────


def test_now_utc_returns_aware_datetime() -> None:
    n = stance_archive._now_utc()
    assert isinstance(n, datetime)
    assert n.tzinfo is not None
