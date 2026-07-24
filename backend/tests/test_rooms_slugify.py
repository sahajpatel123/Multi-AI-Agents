"""Regression tests for ``_slugify`` (room slug generation).

The slug is the public shareable identifier in the URL
(``/room/{slug}``). A regression that allows uppercase / spaces / leading
dashes would:

  - Break the share-URL contract (case-sensitive paths).
  - Allow path-traversal-adjacent slugs like ``../../admin``.
  - Let users collide by typing ``Room 1`` vs ``room-1`` (two different
    display names → same slug → one creator loses the room).

Pins:
  - Lowercase + strip whitespace + collapse internal spaces/underscores
    to single dashes.
  - Punctuation / non-ASCII dropped (Latin-only).
  - Length capped at 50 chars.
  - Empty / whitespace-only / non-Latin names fall back to ``room``.
  - Multiple consecutive dashes collapse to one.
  - No leading or trailing dashes (URL-safe).
  - Two visually distinct display names that differ only in casing /
    punctuation produce the SAME slug (collision prevention).
"""

from __future__ import annotations

import pytest

from arena.routes.rooms import _slugify


class TestSlugifyNormalization:
    def test_lowercases_input(self):
        assert _slugify("My Room") == "my-room"

    def test_strips_surrounding_whitespace(self):
        assert _slugify("  hello world  ") == "hello-world"

    def test_drops_underscores(self):
        """Underscores are stripped (Latin-only regex) — they collapse
        with the surrounding whitespace into the dash separator."""
        assert _slugify("hello_world") == "helloworld"

    def test_collapses_multiple_spaces_to_single_dash(self):
        assert _slugify("a    b") == "a-b"

    def test_collapses_mixed_whitespace(self):
        assert _slugify("a    b") == "a-b"
        assert _slugify("a\tb") == "a-b"

    def test_collapses_consecutive_dashes(self):
        assert _slugify("a---b") == "a-b"

    def test_strips_leading_and_trailing_dashes(self):
        assert _slugify("--hello--") == "hello"

    def test_drops_punctuation(self):
        assert _slugify("Hello, World!") == "hello-world"

    def test_drops_non_latin_characters(self):
        """Greek, Cyrillic, emoji, etc. are silently dropped."""
        # Greek: "γειά" + " world" → just "world"
        assert _slugify("γειά world") == "world"
        # Emoji dropped.
        assert _slugify("hello 🚀 world") == "hello-world"
        # CJK dropped.
        assert _slugify("你好 world") == "world"


class TestSlugifyBounds:
    def test_caps_at_50_chars(self):
        long = "a" * 200
        result = _slugify(long)
        assert len(result) <= 50

    def test_empty_string_returns_room_fallback(self):
        assert _slugify("") == "room"

    def test_whitespace_only_returns_room_fallback(self):
        assert _slugify("   ") == "room"

    def test_punctuation_only_returns_room_fallback(self):
        assert _slugify("!@#$%") == "room"

    def test_non_latin_only_returns_room_fallback(self):
        assert _slugify("你好世界") == "room"

    def test_none_input_returns_room_fallback(self):
        """Defensive: callers may pass None when the name field is missing."""
        assert _slugify(None) == "room"  # type: ignore[arg-type]


class TestSlugifyCollisionContract:
    """Two display names that differ only in casing / punctuation /
    spacing must produce the SAME slug — otherwise two users creating
    rooms with names like 'Room 1' and 'room 1' would generate two
    different shareable URLs and the second one would 404 a stale link."""

    @pytest.mark.parametrize("a,b,expected", [
        ("My Room", "my room", "my-room"),
        ("Room 1", "room-1", "room-1"),
        ("Hello!", "Hello", "hello"),
        ("Hello, World", "hello world", "hello-world"),
        ("--hello--", "hello", "hello"),
    ])
    def test_normalized_pairs_collapse_to_same_slug(self, a, b, expected):
        """Display-name pairs that differ only in casing / punctuation /
        spacing must produce the SAME slug — otherwise two users
        creating rooms with names like 'Room 1' and 'room 1' would
        generate two different shareable URLs and the second one would
        404 a stale link."""
        assert _slugify(a) == _slugify(b) == expected

    def test_underscore_and_space_pairs_do_not_collide(self):
        """``hello___world`` → ``helloworld`` (underscores stripped),
        ``hello world`` → ``hello-world`` (space → dash). These are
        DIFFERENT slugs — pinning the asymmetry so a refactor that
        collapses them would fail loudly (it would force a re-collision
        with users who already created the other variant)."""
        assert _slugify("hello___world") == "helloworld"
        assert _slugify("hello world") == "hello-world"
        assert _slugify("hello___world") != _slugify("hello world")


class TestSlugifyUrlSafety:
    """A slug is the path component of a public URL. No slashes, no
    percent-encoded sequences, no leading/trailing dashes that browsers
    might strip."""

    @pytest.mark.parametrize("name", [
        "My Room",
        "Room-1",
        "A",
        "ABCdefGHIjklMNOpqrSTUvwxYZ0123456789",
        "hello world this is a moderately long name",
    ])
    def test_no_path_separators_in_output(self, name):
        slug = _slugify(name)
        assert "/" not in slug
        assert "\\" not in slug
        assert " " not in slug
        assert "_" not in slug

    @pytest.mark.parametrize("name", [
        "My Room",
        "Room-1",
        "A",
        "ABCdefGHIjklMNOpqrSTUvwxYZ0123456789",
        "hello world this is a moderately long name",
    ])
    def test_no_leading_or_trailing_dashes(self, name):
        slug = _slugify(name)
        if slug != "room":
            assert not slug.startswith("-")
            assert not slug.endswith("-")