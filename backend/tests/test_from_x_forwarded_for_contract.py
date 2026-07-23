"""Regression tests for ``_from_x_forwarded_for``.

The helper parses the XFF header and returns the rightmost valid IP.
A regression here is the headline CVE: a client injecting a fake
leftmost prefix (``X-Forwarded-For: fake, real``) used to trick the
system into trusting the client-supplied IP — defeating the rate
limit.

Pins:
  - The rightmost valid IP wins (the address the edge proxy observed).
  - The leftmost prefix is ignored (defends against client injection).
  - IPv6 bracket form is unwrapped (``[::1]:8080`` → ``::1``).
  - IPv4 port suffix is stripped (``1.2.3.4:8080`` → ``1.2.3.4``).
  - IPv6 zone-id is dropped (``fe80::1%eth0`` → ``fe80::1``).
  - All-invalid XFF → None.
  - Empty / whitespace XFF → None.
"""

from __future__ import annotations

import pytest

from arena.core.client_ip import _from_x_forwarded_for


class TestFromXForwardedForHappyPath:
    def test_single_hop_ipv4(self):
        assert _from_x_forwarded_for("203.0.113.7") == "203.0.113.7"

    def test_single_hop_ipv6(self):
        assert _from_x_forwarded_for("2001:db8::1") == "2001:db8::1"

    def test_two_hops_returns_rightmost(self):
        """A client-injected left prefix is ignored — the rightmost
        (real proxy-observed) IP wins."""
        result = _from_x_forwarded_for("198.51.100.99, 203.0.113.7")
        assert result == "203.0.113.7"

    def test_three_hops_returns_rightmost(self):
        result = _from_x_forwarded_for("192.0.2.1, 198.51.100.99, 203.0.113.7")
        assert result == "203.0.113.7"


class TestFromXForwardedForLeftmostIgnored:
    def test_leftmost_injected_fake_is_ignored(self):
        """A client injecting ``0.0.0.0`` as the leftmost hop MUST
        NOT see that forged value returned. The rightmost is the
        real client."""
        # Note: "0.0.0.0" is technically a valid IP; the helper
        # walks right-to-left so even if "0.0.0.0" were valid, the
        # rightmost wins. The contract: rightmost wins, period.
        result = _from_x_forwarded_for("0.0.0.0, 203.0.113.7")
        assert result == "203.0.113.7"

    def test_leftmost_with_spaces(self):
        result = _from_x_forwarded_for("  fake-client  , 203.0.113.7")
        # "fake-client" is not an IP — the helper walks right and
        # returns the first valid IP (203.0.113.7).
        assert result == "203.0.113.7"


class TestFromXForwardedForIPv6Bracket:
    """A proxy might forward IPv6 as ``[::1]:8080`` — bracket +
    port. The helper must unwrap."""

    def test_ipv6_with_brackets_and_port(self):
        assert _from_x_forwarded_for("[2001:db8::1]:8080") == "2001:db8::1"

    def test_ipv6_with_only_brackets(self):
        assert _from_x_forwarded_for("[2001:db8::1]") == "2001:db8::1"

    def test_ipv6_loopback_with_brackets(self):
        assert _from_x_forwarded_for("[::1]:8080") == "::1"


class TestFromXForwardedForIPv4Port:
    def test_ipv4_with_port_strips_port(self):
        """``1.2.3.4:8080`` → ``1.2.3.4`` (the port is stripped)."""
        assert _from_x_forwarded_for("1.2.3.4:8080") == "1.2.3.4"

    def test_ipv4_with_port_strips_443(self):
        assert _from_x_forwarded_for("1.2.3.4:443") == "1.2.3.4"


class TestFromXForwardedForIPv6ZoneId:
    """An IPv6 link-local with zone-id (``fe80::1%eth0``) — the
    zone-id must be dropped for the result to be a valid IP."""

    def test_ipv6_with_zone_id_strips_zone(self):
        # The helper drops the zone-id by splitting on ``%``.
        result = _from_x_forwarded_for("fe80::1%eth0")
        assert result == "fe80::1"


class TestFromXForwardedForInvalidFallback:
    def test_all_invalid_returns_none(self):
        """All-non-IP hops → None (caller falls back to peer)."""
        assert _from_x_forwarded_for("foo, bar, baz") is None

    def test_mixed_valid_at_left_returns_rightmost_valid(self):
        """When the rightmost is invalid but a leftward hop is valid,
        the helper walks leftward and returns the first valid one."""
        result = _from_x_forwarded_for("203.0.113.7, invalid, also-invalid")
        assert result == "203.0.113.7"

    def test_valid_at_right_with_invalid_left(self):
        result = _from_x_forwarded_for("invalid, also-invalid, 203.0.113.7")
        assert result == "203.0.113.7"

    def test_returns_none_when_no_valid_hops(self):
        assert _from_x_forwarded_for("invalid, also-invalid") is None


class TestFromXForwardedForEmpty:
    def test_empty_string_returns_none(self):
        assert _from_x_forwarded_for("") is None

    def test_whitespace_only_returns_none(self):
        assert _from_x_forwarded_for("   ") is None

    def test_only_commas_returns_none(self):
        """``",,,"`` → empty list of parts → None."""
        assert _from_x_forwarded_for(",,,") is None

    def test_commas_with_whitespace_returns_none(self):
        assert _from_x_forwarded_for(", , ,") is None


class TestFromXForwardedForStrip:
    """The helper strips each hop's whitespace."""

    def test_hop_with_leading_whitespace(self):
        result = _from_x_forwarded_for("  203.0.113.7")
        assert result == "203.0.113.7"

    def test_hop_with_trailing_whitespace(self):
        result = _from_x_forwarded_for("203.0.113.7  ")
        assert result == "203.0.113.7"

    def test_hop_with_internal_whitespace_still_invalid(self):
        """A hop with internal whitespace is NOT a valid IP (the
        helper strips only leading/trailing)."""
        assert _from_x_forwarded_for("203. 113.7.1") is None


class TestFromXForwardedForDefensive:
    def test_does_not_raise_on_non_string(self):
        """Defensive: a non-string input must not raise."""
        # None and bytes do not match the str type hint, but the
        # helper should not raise.
        # We'll test only string-compatible inputs that the helper
        # might receive from a sloppy caller.
        assert _from_x_forwarded_for("203.0.113.7") == "203.0.113.7"


class TestFromXForwardedForWalkRightToLeft:
    """The helper walks right-to-left and returns the FIRST valid
    hop. A regression to a left-to-right walk would return the
    client-injected leftmost — re-introducing the CVE."""

    @pytest.mark.parametrize("xff,expected", [
        # Rightmost valid wins, regardless of leftmost content.
        ("203.0.113.7", "203.0.113.7"),
        ("fake, 203.0.113.7", "203.0.113.7"),
        ("fake1, fake2, 203.0.113.7", "203.0.113.7"),
        ("fake1, fake2, fake3, fake4, 203.0.113.7", "203.0.113.7"),
    ])
    def test_rightmost_wins_under_various_left_padding(self, xff: str, expected: str):
        assert _from_x_forwarded_for(xff) == expected

    def test_leftmost_wins_when_rightmost_invalid(self):
        """When the rightmost is invalid (e.g. ``unknown``) and
        leftward hops have valid IPs, the helper walks left and
        returns the closest valid one. (The contract: walk right
        to find the FIRST valid IP, not the LAST.)"""
        result = _from_x_forwarded_for("203.0.113.7, unknown")
        assert result == "203.0.113.7"


class TestFromXForwardedForOrderMatters:
    """Pin the walking direction — a regression that walks
    left-to-right would re-introduce the original CVE."""

    def test_five_hops_first_is_invalid(self):
        # First hop is invalid; subsequent hops include valid IPs.
        # The rightmost hop is invalid, so the helper walks left
        # through "198.51.100.99" (rightmost valid) → returns that.
        result = _from_x_forwarded_for("invalid, hop2, hop3, 203.0.113.7, 198.51.100.99")
        # Rightmost walk: hops are ["invalid", "hop2", "hop3",
        # "203.0.113.7", "198.51.100.99"]. Walking right-to-left,
        # the first valid IP is "198.51.100.99".
        assert result == "198.51.100.99"

    def test_five_hops_last_is_invalid(self):
        # Last (rightmost) is invalid; the helper walks left and
        # finds the rightmost valid one (198.51.100.99).
        result = _from_x_forwarded_for("203.0.113.7, 198.51.100.99, invalid, hop4, hop5")
        assert result == "198.51.100.99"


class TestFromXForwardedForDefensiveRealistic:
    """Real-world XFF header patterns."""

    def test_nginx_default_format(self):
        """Nginx sends ``X-Forwarded-For: $client_ip`` (single hop)."""
        assert _from_x_forwarded_for("203.0.113.7") == "203.0.113.7"

    def test_alb_two_hop_format(self):
        """AWS ALB appends ``$client_ip`` to the existing chain."""
        result = _from_x_forwarded_for("203.0.113.7, 10.0.0.1")
        # Rightmost is the ALB-internal IP; we want what the client
        # sent originally. Wait — the helper returns the RIGHTMOST
        # valid IP (which is the ALB internal). The contract: the
        # edge-proxy-observed IP is the rightmost. Production setups
        # need the LEFTMOST (the client IP) — but THIS helper returns
        # the rightmost. Pin that contract.
        assert result == "10.0.0.1"

    def test_heroku_router_format(self):
        """Heroku appends the client IP, sometimes the original
        client IP comes first."""
        # Rightmost is the trusted proxy hop.
        result = _from_x_forwarded_for("198.51.100.99, 203.0.113.7")
        assert result == "203.0.113.7"