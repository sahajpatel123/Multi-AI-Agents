"""Regression tests for ``_looks_like_ip``.

The helper is the IP-validation gate inside
``_from_x_forwarded_for`` and the X-Real-IP fallback. A regression
here would either:

  - Accept non-IP values → spoof the rightmost-XFF contract (a
    fake IP in XFF passes validation, bypassing the security fix).
  - Reject valid IPv6 → silent loss of IPv6 client identification.
  - Accept empty / whitespace / port-suffixed values → false positives
    pollute the bucket.

Pins:
  - IPv4 dotted-quad returns True.
  - IPv6 (full + compressed) returns True.
  - IP with port returns False (port must be stripped by caller).
  - Empty / whitespace / non-IP strings return False.
  - Non-string input returns False (NOT raises).
"""

from __future__ import annotations

import pytest

from arena.core.client_ip import _looks_like_ip


class TestLooksLikeIpIpv4:
    @pytest.mark.parametrize("addr", [
        "127.0.0.1",
        "0.0.0.0",
        "255.255.255.255",
        "10.0.0.1",
        "192.168.1.1",
        "203.0.113.42",
    ])
    def test_valid_ipv4_returns_true(self, addr: str):
        assert _looks_like_ip(addr) is True

    @pytest.mark.parametrize("addr", [
        "256.0.0.1",          # octet > 255
        "1.2.3.4.5",          # 5 octets
        "1.2.3",              # 3 octets
        "1.2.3.4.",           # trailing dot
        ".1.2.3.4",           # leading dot
        "abc.def.ghi.jkl",    # non-numeric
    ])
    def test_invalid_ipv4_returns_false(self, addr: str):
        assert _looks_like_ip(addr) is False


class TestLooksLikeIpIpv6:
    @pytest.mark.parametrize("addr", [
        "::1",
        "::",
        "2001:db8::1",
        "fe80::1",
        "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
        "::ffff:192.0.2.1",   # IPv4-mapped
    ])
    def test_valid_ipv6_returns_true(self, addr: str):
        assert _looks_like_ip(addr) is True

    @pytest.mark.parametrize("addr", [
        "2001:db8::1::",       # double ::
        "2001:db8:xyz::1",     # invalid hex
        "gggg::",              # invalid characters
    ])
    def test_invalid_ipv6_returns_false(self, addr: str):
        assert _looks_like_ip(addr) is False


class TestLooksLikeIpWithPort:
    """An IP with a port is NOT a valid IP — the caller (the XFF
    parser) strips the port before calling. A regression that
    accepted port-suffixed values would let the original XFF-parser
    fallback path mishandle them."""

    @pytest.mark.parametrize("addr", [
        "203.0.113.1:8080",
        "203.0.113.1:443",
        "[2001:db8::1]:8080",
    ])
    def test_ip_with_port_returns_false(self, addr: str):
        assert _looks_like_ip(addr) is False


class TestLooksLikeIpEmptyInput:
    def test_empty_string_returns_false(self):
        assert _looks_like_ip("") is False

    def test_whitespace_only_returns_false(self):
        assert _looks_like_ip("   ") is False

    def test_newline_returns_false(self):
        assert _looks_like_ip("\n") is False

    def test_tab_returns_false(self):
        assert _looks_like_ip("\t") is False


class TestLooksLikeIpNonString:
    def test_none_returns_false(self):
        assert _looks_like_ip(None) is False  # type: ignore[arg-type]

    def test_int_returns_int_representation(self):
        """An int input is interpreted as an IPv4 address by the
        stdlib (42 → 0.0.0.42). The helper's contract: pass the
        input through to ipaddress.ip_address, which accepts ints
        for IPv4. Document this — callers must pre-stringify."""
        # Pin actual behavior so a future refactor that breaks
        # int-coercion is caught.
        assert _looks_like_ip(0) is True  # 0.0.0.0
        assert _looks_like_ip(42) is True  # 0.0.0.42
        assert _looks_like_ip(0xFFFFFFFF) is True  # 255.255.255.255

    def test_bytes_returns_false(self):
        assert _looks_like_ip(b"203.0.113.1") is False  # type: ignore[arg-type]

    def test_list_returns_false(self):
        assert _looks_like_ip(["203.0.113.1"]) is False  # type: ignore[arg-type]


class TestLooksLikeIpDefensive:
    def test_does_not_raise_on_garbage(self):
        """Arbitrary garbage input does not raise — the helper
        returns False."""
        # Various non-IP strings.
        for value in ("not-an-ip", "  203.0.113.1  extra  ", "abc 1 2 3 4", ""):
            # Should NOT raise.
            assert _looks_like_ip(value) is False

    def test_returns_strict_bool(self):
        """The return type is a strict bool — a regression that
        returned an int (1/0) would technically still work in
        truthy checks but break type hints and serialization."""
        result = _looks_like_ip("203.0.113.1")
        assert isinstance(result, bool)
        # And NOT a regular int (bool IS a subclass of int).
        assert type(result) is bool


class TestLooksLikeIpIdempotence:
    def test_repeated_call_is_deterministic(self):
        for _ in range(3):
            assert _looks_like_ip("203.0.113.1") is True
            assert _looks_like_ip("not-an-ip") is False


class TestLooksLikeIpBoundaryValues:
    """Pin the IP-library boundary values — these are the edge cases
    the Python stdlib handles."""

    def test_unspecified_address(self):
        """The unspecified address ``"0.0.0.0"`` is a valid IP."""
        assert _looks_like_ip("0.0.0.0") is True

    def test_broadcast_address(self):
        """The broadcast address ``"255.255.255.255"`` is a valid IP."""
        assert _looks_like_ip("255.255.255.255") is True

    def test_loopback_ipv6(self):
        assert _looks_like_ip("::1") is True

    def test_unspecified_ipv6(self):
        assert _looks_like_ip("::") is True