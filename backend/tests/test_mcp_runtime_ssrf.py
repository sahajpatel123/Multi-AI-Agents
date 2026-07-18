"""Unit tests for mcp_runtime SSRF allowlist and unified item shape."""

from __future__ import annotations

import pytest

from arena.core.mcp_runtime import (
    SERVICE_URL_ALLOWLIST,
    _assert_safe_service_url,
    _unified_item,
)


def test_allowlist_covers_known_vendors():
    assert "api.notion.com" in SERVICE_URL_ALLOWLIST["notion"]
    assert "api.github.com" in SERVICE_URL_ALLOWLIST["github"]
    assert "www.googleapis.com" in SERVICE_URL_ALLOWLIST["google_drive"]


def test_assert_safe_service_url_accepts_allowlisted_https():
    _assert_safe_service_url("notion", "https://api.notion.com/v1/search")
    _assert_safe_service_url("github", "https://api.github.com/search/code")
    _assert_safe_service_url(
        "google_drive", "https://www.googleapis.com/drive/v3/files"
    )


def test_assert_safe_service_url_rejects_unknown_service():
    with pytest.raises(ValueError, match="no URL allowlist"):
        _assert_safe_service_url("slack", "https://api.slack.com/foo")


def test_assert_safe_service_url_rejects_http_and_evil_host():
    with pytest.raises(ValueError, match="non-HTTPS"):
        _assert_safe_service_url("notion", "http://api.notion.com/v1/search")
    with pytest.raises(ValueError, match="not in"):
        _assert_safe_service_url("github", "https://evil.github.com/steal")
    with pytest.raises(ValueError, match="not in"):
        _assert_safe_service_url("github", "https://attacker.example/x")


def test_assert_safe_service_url_rejects_missing_host():
    with pytest.raises(ValueError, match="no host"):
        _assert_safe_service_url("notion", "https:///nohost")


def test_unified_item_truncates_fields():
    item = _unified_item(
        title="T" * 600,
        excerpt="E" * 2000,
        source="S" * 200,
        url="https://example.com/" + ("u" * 3000),
    )
    assert len(item["title"]) == 500
    assert len(item["excerpt"]) == 1500
    assert len(item["source"]) == 120
    assert len(item["url"]) == 2000
    assert set(item.keys()) == {"title", "excerpt", "source", "url"}
