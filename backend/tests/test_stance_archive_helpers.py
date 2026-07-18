"""Unit tests for pure helpers in arena.core.stance_archive."""

from __future__ import annotations

from arena.core.stance_archive import (
    extract_topic,
    summarize_stance_text,
    _normalize_topic,
)


def test_extract_topic_strips_stop_words():
    topic = extract_topic("What should I know about quantum computing today?")
    assert "what" not in topic.lower().split()
    assert "about" not in topic.lower().split()
    assert "quantum" in topic.lower() or "Quantum" in topic
    assert len(topic) <= 50


def test_extract_topic_empty_becomes_general():
    assert extract_topic("") == "general topic"
    assert extract_topic("the a an is are") == "general topic"


def test_extract_topic_preserves_acronyms_and_capitals():
    topic = extract_topic("Explain how NASA builds the ISS modules")
    # Stop words filtered; meaningful tokens remain
    assert "NASA" in topic or "nasa" in topic.lower()
    assert "ISS" in topic or "iss" in topic.lower() or "modules" in topic.lower()


def test_normalize_topic_collapses_space_and_lowercases():
    assert _normalize_topic("  Quantum   Computing  ") == "quantum computing"
    assert len(_normalize_topic("x" * 80)) == 50


def test_summarize_stance_text_short_passthrough():
    s = "Markets remain tight near term."
    assert summarize_stance_text(s) == s


def test_summarize_stance_text_truncates_on_word_boundary():
    words = "word " * 80
    out = summarize_stance_text(words)
    assert out.endswith("...")
    assert len(out) <= 200
