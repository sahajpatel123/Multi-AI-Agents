"""Outbound URL allowlist guard for mcp_runtime.

mcp_runtime.search_*() always hardcodes the vendor URL today, but the
service allowlist is in place so a future config-driven refactor cannot
silently widen the SSRF surface. These tests pin that contract.
"""

import pytest

from arena.core import mcp_runtime


class TestServiceUrlAllowlist:
    """Each MCP service must declare which vendor hosts are reachable."""

    def test_notion_url_assertion_passes(self):
        # Should not raise: api.notion.com is the allowlisted host.
        mcp_runtime._assert_safe_service_url(
            "notion", "https://api.notion.com/v1/search"
        )

    def test_github_url_assertion_passes(self):
        mcp_runtime._assert_safe_service_url(
            "github", "https://api.github.com/search/code"
        )

    def test_google_drive_url_assertion_passes(self):
        mcp_runtime._assert_safe_service_url(
            "google_drive", "https://www.googleapis.com/drive/v3/files"
        )

    def test_unknown_service_rejected(self):
        # No allowlist entry = no requests. Forces deliberate enumeration.
        with pytest.raises(ValueError, match="no URL allowlist"):
            mcp_runtime._assert_safe_service_url(
                "fake_vendor", "https://evil.example.com/v1/search"
            )

    def test_off_allowlist_host_rejected(self):
        # Looks like notion but is not api.notion.com — an attacker-controlled
        # host that someone might typo into a future config-driven URL.
        with pytest.raises(ValueError, match="not in 'notion' allowlist"):
            mcp_runtime._assert_safe_service_url(
                "notion", "https://api.notion.attacker.example/v1/search"
            )

    def test_similar_domain_prefix_attack_rejected(self):
        # Looks identical but is a different owner.
        with pytest.raises(ValueError):
            mcp_runtime._assert_safe_service_url(
                "github", "https://evil.github.com/search/code"
            )

    def test_loopback_rejected(self):
        # SSRF classic — pivot to internal services.
        with pytest.raises(ValueError):
            mcp_runtime._assert_safe_service_url(
                "notion", "http://127.0.0.1:8500/v1/search"
            )

    def test_no_host_rejected(self):
        with pytest.raises(ValueError, match="no host component"):
            mcp_runtime._assert_safe_service_url("notion", "")

    def test_allowlist_is_frozen(self):
        # Defending against a runtime mutation of the allowlist.
        assert isinstance(mcp_runtime.SERVICE_URL_ALLOWLIST["notion"], frozenset)

    def test_search_functions_cite_their_allowlisted_url(self):
        """Document the URLs the search functions actually fire. Any future
        change must update both the function and the test, so the review
        surfaces the vendor change clearly.
        """
        assert "api.notion.com" in mcp_runtime.SERVICE_URL_ALLOWLIST["notion"]
        assert "api.github.com" in mcp_runtime.SERVICE_URL_ALLOWLIST["github"]
        assert (
            "www.googleapis.com"
            in mcp_runtime.SERVICE_URL_ALLOWLIST["google_drive"]
        )
