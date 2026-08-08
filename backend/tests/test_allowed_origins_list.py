"""Regression tests for ``Settings.allowed_origins_list``.

The helper parses the comma-separated ``ALLOWED_ORIGINS`` env var
into a list of trimmed, non-empty origins. The CORS middleware +
``validate_secrets`` both depend on this list. A regression that
drops the strip/filter step would leave a whitespace-only entry in
the list, which the CORS middleware would interpret as a wildcard
or reject the request — silent breakage on every preflight.

Pins:
  - Empty / whitespace-only entries are dropped.
  - Surrounding whitespace on each entry is stripped.
  - Single origin returned as a one-element list.
  - The order of origins is preserved (CORS preflight requires the
    echoed origin to match an entry in order).
  - Empty string → empty list (NOT a list with one empty string).
  - Comma-separated string with no spaces is parsed correctly.
"""

from __future__ import annotations

import pytest

from arena.config import Settings


def _make_settings(allowed_origins: str) -> Settings:
    """Build a Settings instance with the given ``allowed_origins``
    string. We bypass the lru_cache by constructing fresh; the
    ``Settings`` pydantic model reads from env vars at construction
    time but the ``allowed_origins`` constructor arg overrides."""
    import os

    # Set env so the Settings() constructor doesn't fail on missing
    # required vars; the helper Settings we instantiate via
    # __init__ ignores env if init args are provided.
    os.environ.setdefault("SECRET_KEY", "x" * 64)
    os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test-key-for-unit")
    os.environ.setdefault("ENVIRONMENT", "test")

    return Settings(allowed_origins=allowed_origins)


class TestAllowedOriginsListParsing:
    def test_empty_string_returns_empty_list(self):
        s = _make_settings("")
        assert s.allowed_origins_list == []

    def test_whitespace_only_string_returns_empty_list(self):
        s = _make_settings("   ")
        assert s.allowed_origins_list == []

    def test_single_origin(self):
        s = _make_settings("https://app.example.com")
        assert s.allowed_origins_list == ["https://app.example.com"]

    def test_multiple_origins_preserve_order(self):
        s = _make_settings(
            "https://app.example.com,https://admin.example.com,https://api.example.com"
        )
        assert s.allowed_origins_list == [
            "https://app.example.com",
            "https://admin.example.com",
            "https://api.example.com",
        ]

    def test_strips_surrounding_whitespace(self):
        s = _make_settings("  https://app.example.com  ,  https://admin.example.com  ")
        assert s.allowed_origins_list == [
            "https://app.example.com",
            "https://admin.example.com",
        ]

    def test_drops_empty_entries_from_double_commas(self):
        """``"a,,b"`` must produce ``["a", "b"]`` — not ``["a", "", "b"]``."""
        s = _make_settings("https://app.example.com,,https://admin.example.com")
        assert s.allowed_origins_list == [
            "https://app.example.com",
            "https://admin.example.com",
        ]

    def test_drops_whitespace_only_entries(self):
        """``"a, ,b"`` must produce ``["a", "b"]`` — not include the
        whitespace-only entry that would CORS-interpret as a wildcard."""
        s = _make_settings("https://app.example.com, ,https://admin.example.com")
        assert s.allowed_origins_list == [
            "https://app.example.com",
            "https://admin.example.com",
        ]

    def test_localhost_dev_origin_preserved(self):
        """The dev fallback origin is a typical entry — pin that
        it's not dropped by the strip/filter logic."""
        s = _make_settings("http://localhost:5173,http://localhost:3000")
        assert s.allowed_origins_list == [
            "http://localhost:5173",
            "http://localhost:3000",
        ]

    def test_https_origin_preserved(self):
        s = _make_settings("https://arena.example.com")
        assert s.allowed_origins_list == ["https://arena.example.com"]

    def test_mixed_http_and_https(self):
        s = _make_settings("http://localhost,https://prod.example.com")
        assert s.allowed_origins_list == [
            "http://localhost",
            "https://prod.example.com",
        ]


class TestAllowedOriginsListDefensive:
    def test_trailing_comma_does_not_produce_empty_trailing_entry(self):
        """``"a,"`` must NOT produce ``["a", ""]`` — the trailing
        empty entry would CORS-match every origin and re-introduce
        the wildcard regression."""
        s = _make_settings("https://app.example.com,")
        assert s.allowed_origins_list == ["https://app.example.com"]

    def test_leading_comma_does_not_produce_empty_leading_entry(self):
        s = _make_settings(",https://app.example.com")
        assert s.allowed_origins_list == ["https://app.example.com"]

    def test_repeated_commas_drop_all_empty_entries(self):
        """``"a,,,b"`` produces ``["a", "b"]`` — every empty entry is
        dropped, not just the first."""
        s = _make_settings("https://app.example.com,,,,https://admin.example.com")
        assert s.allowed_origins_list == [
            "https://app.example.com",
            "https://admin.example.com",
        ]

    def test_only_commas_returns_empty_list(self):
        s = _make_settings(",,,")
        assert s.allowed_origins_list == []