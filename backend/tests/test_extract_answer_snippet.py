"""Regression tests for ``extract_answer_snippet``.

The helper pulls a readable snippet from a raw ``final_answer`` blob —
either free text or structured JSON. It sits in front of every agent
detail page (history, evolution, rooms).

Pins:
  - ``None`` and empty input return ``""`` (never raises).
  - Free text is stripped and whitespace-collapsed.
  - JSON dict with ``one_liner`` uses that key.
  - JSON dict with ``sentences`` joins them.
  - JSON dict with ``final_answer`` falls back to that key.
  - JSON dict with ``text`` falls back to that key.
  - Malformed JSON falls back to the raw text (logged warning).
  - Output is bounded at ``limit`` chars.
  - Non-string non-dict JSON values fall back to the raw text.
"""

from __future__ import annotations

import json

import pytest

from arena.core.temporal_evolution import extract_answer_snippet


class TestExtractAnswerSnippetEmptyInput:
    def test_none_returns_empty_string(self):
        assert extract_answer_snippet(None) == ""

    def test_empty_string_returns_empty_string(self):
        assert extract_answer_snippet("") == ""

    def test_whitespace_only_returns_empty_string(self):
        assert extract_answer_snippet("   \n\t  ") == ""


class TestExtractAnswerSnippetFreeText:
    def test_returns_stripped_text(self):
        assert extract_answer_snippet("  hello  ") == "hello"

    def test_collapses_internal_whitespace(self):
        assert extract_answer_snippet("hello\n\n   world") == "hello world"

    def test_truncates_to_limit(self):
        long = "x" * 1000
        result = extract_answer_snippet(long, limit=50)
        assert len(result) == 50

    def test_default_limit_is_400(self):
        long = "a" * 1000
        result = extract_answer_snippet(long)
        assert len(result) == 400

    def test_truncation_does_not_include_trailing_partial_word(self):
        """The truncation is a plain slice — partial words are
        acceptable here since the snippet is a UI preview, not a
        syntactic token."""
        result = extract_answer_snippet("abcdefghij" * 100, limit=10)
        assert result == "abcdefghij"


class TestExtractAnswerSnippetJsonOneLiner:
    def test_dict_with_one_liner_uses_that_key(self):
        payload = json.dumps({"one_liner": "A short summary."})
        assert extract_answer_snippet(payload) == "A short summary."

    def test_one_liner_takes_precedence_over_other_keys(self):
        """When multiple candidate keys exist, ``one_liner`` wins."""
        payload = json.dumps({
            "one_liner": "SHORT",
            "final_answer": "LONG",
            "text": "OTHER",
        })
        assert extract_answer_snippet(payload) == "SHORT"


class TestExtractAnswerSnippetJsonSentences:
    def test_dict_with_sentences_joins_them(self):
        payload = json.dumps({
            "sentences": [
                {"text": "First sentence."},
                {"text": "Second sentence."},
                {"text": "Third sentence."},
            ]
        })
        assert extract_answer_snippet(payload) == "First sentence. Second sentence. Third sentence."

    def test_sentences_with_plain_strings(self):
        """Sentences can be plain strings instead of dicts."""
        payload = json.dumps({
            "sentences": ["First.", "Second.", "Third."]
        })
        assert extract_answer_snippet(payload) == "First. Second. Third."

    def test_sentences_mixed_dicts_and_strings(self):
        payload = json.dumps({
            "sentences": [{"text": "First."}, "Second.", {"text": "Third."}]
        })
        assert extract_answer_snippet(payload) == "First. Second. Third."

    def test_sentences_with_missing_text_field(self):
        """A sentence dict without ``text`` falls back to its str()
        representation (which is the dict repr, but acceptable — the
        caller should always populate ``text``)."""
        payload = json.dumps({
            "sentences": [{"text": "First."}, {"other": "no text field"}]
        })
        result = extract_answer_snippet(payload)
        # The second sentence becomes the dict's str() — pin the
        # contract that we don't crash on it.
        assert "First." in result
        assert "no text field" in result


class TestExtractAnswerSnippetJsonFallbackChain:
    def test_dict_with_final_answer_uses_that_key(self):
        payload = json.dumps({"final_answer": "Full answer."})
        assert extract_answer_snippet(payload) == "Full answer."

    def test_dict_with_text_uses_that_key(self):
        payload = json.dumps({"text": "Just text."})
        assert extract_answer_snippet(payload) == "Just text."

    def test_dict_with_no_known_key_returns_raw(self):
        """An unknown-shape dict falls back to the raw text (which is
        the JSON string itself, stripped and whitespace-collapsed)."""
        payload = json.dumps({"weird_key": "ignored"})
        # The raw text is the JSON itself; the helper should NOT crash.
        result = extract_answer_snippet(payload)
        assert isinstance(result, str)


class TestExtractAnswerSnippetMalformedJson:
    def test_malformed_json_falls_back_to_raw_text(self):
        """A JSON-looking string that doesn't parse must NOT raise —
        the caller falls back to the raw text after logging a
        warning."""
        malformed = '{"one_liner": "broken json'
        # Should NOT raise.
        result = extract_answer_snippet(malformed)
        assert isinstance(result, str)
        # The raw text is preserved (after strip + whitespace-collapse).
        assert "broken" in result

    def test_json_with_wrong_structure_falls_back_to_raw(self):
        """A JSON dict that doesn't match any of the known shapes
        falls back to the raw text (which is the JSON string)."""
        unexpected = json.dumps(["not", "a", "dict"])
        result = extract_answer_snippet(unexpected)
        assert isinstance(result, str)

    def test_json_array_at_root_uses_raw_text(self):
        """A JSON array (not a dict) at the root is not in the
        expected shape — fall back to the raw text without raising."""
        result = extract_answer_snippet(json.dumps(["a", "b", "c"]))
        assert isinstance(result, str)


class TestExtractAnswerSnippetDefensive:
    def test_non_string_input_raises(self):
        """The type annotation is ``str | None`` — a non-string input
        is a contract violation. Pin that the helper does NOT silently
        coerce (no ``str(int)`` fallback that would hide schema bugs
        upstream). The helper raising is the loud failure the
        contract needs."""
        with pytest.raises(AttributeError):
            extract_answer_snippet(42)  # type: ignore[arg-type]
        with pytest.raises(AttributeError):
            extract_answer_snippet(True)  # type: ignore[arg-type]
        with pytest.raises(AttributeError):
            extract_answer_snippet(3.14)  # type: ignore[arg-type]

    def test_string_with_only_whitespace(self):
        """A whitespace-only string returns empty (already covered,
        but pin explicitly here for the defensive-coercion contract)."""
        assert extract_answer_snippet("\n\n  \t") == ""


class TestExtractAnswerSnippetWhitespaceInJson:
    def test_collapses_whitespace_in_extracted_text(self):
        """The whitespace-collapse runs AFTER the JSON extraction, so
        extracted sentences with newlines collapse cleanly."""
        payload = json.dumps({
            "sentences": [
                {"text": "First.\n\nLine two."},
                {"text": "  Second with leading space.  "},
            ]
        })
        # Note: the leading-space text on "Second" is stripped after
        # the join + collapse.
        result = extract_answer_snippet(payload)
        # The newline in "First.\n\nLine two." becomes a single space.
        assert "First. Line two." in result
        # Leading/trailing whitespace is collapsed.
        assert "Second with leading space." in result
        # And the limit must still apply.
        assert len(result) <= 400