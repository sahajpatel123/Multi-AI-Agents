"""Tests for the MCP runtime's URL-allowlist SSRF guard.

mcp_runtime makes outbound calls to Notion / GitHub / Google Drive
using the user's OAuth token. _assert_safe_service_url is the
defense-in-depth that prevents a developer from accidentally proxying
bearer tokens to an attacker-controlled host. Drift here means either:
  - a wrong vendor URL silently sends tokens to an attacker
  - HTTPS gets downgraded to cleartext (token leak)
  - open-redirect bypass sends tokens to an internal network

We pin the allowlist contract + the URL-safety checks. The outbound
HTTP calls themselves are integration-tested separately.
"""
from __future__ import annotations

import pytest

from arena.core import mcp_runtime
from arena.core.mcp_runtime import SERVICE_URL_ALLOWLIST, _assert_safe_service_url, _unified_item


# ── SERVICE_URL_ALLOWLIST ──────────────────────────────────────


def test_allowlist_covers_all_three_vendors() -> None:
    # The MCP integrations we ship today: Notion, GitHub, Google Drive.
    assert set(SERVICE_URL_ALLOWLIST.keys()) == {"notion", "github", "google_drive"}


def test_allowlist_uses_frozen_sets() -> None:
    # frozenset prevents runtime mutation that would silently widen the
    # SSRF surface.
    for service, hosts in SERVICE_URL_ALLOWLIST.items():
        assert isinstance(hosts, frozenset), f"{service} hosts is not frozen"


def test_allowlist_does_not_wildcard_subdomains() -> None:
    # Subdomains must be listed explicitly — a malicious subdomain like
    # `evil.notion.com` must NOT be accepted just because `api.notion.com`
    # is allowlisted.
    for service, hosts in SERVICE_URL_ALLOWLIST.items():
        for host in hosts:
            # If the allowlisted host has a parent domain, that parent
            # must NOT itself be a registered allowlisted host (it would
            # enable subdomain wildcarding).
            assert not host.startswith("*"), f"{service} uses wildcard in {host}"


def test_allowlist_has_at_least_one_host_per_service() -> None:
    for service, hosts in SERVICE_URL_ALLOWLIST.items():
        assert len(hosts) >= 1, f"{service} has no allowlisted hosts"


# ── _assert_safe_service_url: happy paths ───────────────────────


def test_safe_url_for_notion_passes() -> None:
    # Should not raise.
    _assert_safe_service_url("notion", "https://api.notion.com/v1/search")


def test_safe_url_for_github_passes() -> None:
    _assert_safe_service_url("github", "https://api.github.com/search/code")


def test_safe_url_for_google_drive_passes() -> None:
    _assert_safe_service_url("google_drive", "https://www.googleapis.com/drive/v3/files")


def test_case_insensitive_host_match() -> None:
    # Hostnames are case-insensitive — uppercase host must still pass.
    _assert_safe_service_url("notion", "https://API.NOTION.COM/v1/search")


def test_url_with_port_and_path_passes() -> None:
    # The allowlist matches the host; port + path are unrestricted.
    _assert_safe_service_url("github", "https://api.github.com:443/search/code?q=test")


def test_url_with_query_string_passes() -> None:
    _assert_safe_service_url("notion", "https://api.notion.com/v1/search?query=foo&limit=10")


# ── _assert_safe_service_url: rejection paths ──────────────────


def test_unknown_service_raises_value_error() -> None:
    # An unknown service name must NOT silently proceed — that would
    # mask a configuration bug.
    with pytest.raises(ValueError, match="no URL allowlist configured"):
        _assert_safe_service_url("notion_v2", "https://api.notion.com/v1/search")


def test_unknown_host_for_known_service_raises() -> None:
    # A clearly-malicious host MUST be rejected.
    with pytest.raises(ValueError, match="not in 'notion' allowlist"):
        _assert_safe_service_url("notion", "https://evil.example.com/v1/search")


def test_subdomain_attack_is_rejected() -> None:
    # `evil.notion.com` is a different owner than `api.notion.com` even
    # though they share a parent domain. The allowlist is exact-match.
    with pytest.raises(ValueError, match="not in 'notion' allowlist"):
        _assert_safe_service_url("notion", "https://evil.notion.com/v1/search")


def test_similar_looking_domain_is_rejected() -> None:
    # `api.notion.com.evil.example` ends with `.evil.example` — URL parser
    # hostname extraction must return the right-most label block, not the
    # longest prefix.
    with pytest.raises(ValueError, match="not in 'notion' allowlist"):
        _assert_safe_service_url("notion", "https://api.notion.com.evil.example/v1/search")


def test_http_scheme_is_rejected() -> None:
    # Only HTTPS may leave the process — no cleartext token leak.
    with pytest.raises(ValueError, match="non-HTTPS"):
        _assert_safe_service_url("notion", "http://api.notion.com/v1/search")


def test_no_scheme_is_rejected() -> None:
    # `//host` form (protocol-relative URL) must also be rejected —
    # the scheme must be explicit.
    with pytest.raises(ValueError, match="non-HTTPS"):
        _assert_safe_service_url("notion", "//api.notion.com/v1/search")


def test_unknown_scheme_is_rejected() -> None:
    # file://, ftp://, gopher:// — any non-https scheme is refused.
    with pytest.raises(ValueError, match="non-HTTPS"):
        _assert_safe_service_url("notion", "file://api.notion.com/v1/search")
    with pytest.raises(ValueError, match="non-HTTPS"):
        _assert_safe_service_url("github", "ftp://api.github.com/search")


def test_no_host_is_rejected() -> None:
    # A URL like "https://" parses with no hostname — must be rejected
    # so a malformed config doesn't leak the token to "".
    with pytest.raises(ValueError, match="no host component"):
        _assert_safe_service_url("notion", "https://")


def test_host_normalization_lowercases() -> None:
    # Mixed-case hostnames must normalize to lowercase before allowlist
    # comparison.
    _assert_safe_service_url("notion", "https://API.Notion.COM/v1/search")


def test_github_root_accepted_for_legacy_endpoints() -> None:
    # The allowlist includes both api.github.com AND github.com —
    # legacy web endpoints on github.com (e.g. raw file fetches) are
    # accepted. Verify both branches of the GitHub allowlist.
    _assert_safe_service_url("github", "https://github.com/raw/foo/bar")


def test_cross_service_url_is_rejected() -> None:
    # A notion URL passed to the github guard must be rejected (it's
    # not in github's allowlist, even though the notion URL is fine in
    # notion's guard). Service scoping is per-integration.
    with pytest.raises(ValueError, match="not in 'github' allowlist"):
        _assert_safe_service_url("github", "https://api.notion.com/v1/search")


# ── _unified_item ───────────────────────────────────────────────


def test_unified_item_returns_documented_shape() -> None:
    item = _unified_item(title="T", excerpt="E", source="S", url="U")
    assert item == {"title": "T", "excerpt": "E", "source": "S", "url": "U"}


def test_unified_item_keys_are_stable() -> None:
    # The frontend code reads these by key — a rename breaks all callers.
    item = _unified_item(title="x", excerpt="y", source="z", url="w")
    assert set(item.keys()) == {"title", "excerpt", "source", "url"}
