"""Regression tests for ``get_request_client_ip``.

The client-IP extraction sits in front of every IP-keyed rate limit
(auth, payment, agent history). The HOT-PATH-ANALYSIS HIGH finding
``Multi-worker rate-limit bypass`` was partly caused by taking the
LEFTMOST hop of ``X-Forwarded-For`` — letting a single attacker
rotate forged identities forever.

The current contract: take the RIGHTMOST valid IP hop (the address
the edge proxy observed, not a client-injected prefix).

Pins:
  - In production (proxy headers trusted): rightmost valid IP wins.
  - In non-production: always use the direct TCP peer — spoofable
    headers are ignored.
  - X-Real-IP is consulted as a fallback only when XFF is absent or
    has no valid hops.
  - Values that don't look like an IP are rejected (fall back to
    peer / rightmost-valid).
  - IPv6 addresses are accepted (including bracket-wrapped
    ``[::1]:8000`` form from some proxies).
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import Request

from arena.core.client_ip import get_request_client_ip


def _make_request(
    *,
    peer: str = "127.0.0.1",
    xff: str | None = None,
    real_ip: str | None = None,
) -> Request:
    """Build a minimal FastAPI Request stub with the headers we care about."""
    headers: dict[str, str] = {}
    if xff is not None:
        headers["X-Forwarded-For"] = xff
    if real_ip is not None:
        headers["X-Real-IP"] = real_ip

    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (peer, 0),
    }
    return Request(scope)


@pytest.fixture(autouse=True)
def _force_production_proxy_trust(monkeypatch):
    """Most tests want the proxy headers TRUSTED (production path).
    The non-production test in the suite overrides via its own
    ``monkeypatch.setattr``."""
    from arena.core import client_ip as client_ip_mod

    monkeypatch.setattr(client_ip_mod, "_trust_proxy_headers", lambda: True)


class TestRightmostHopWins:
    """The rightmost valid IP in XFF is the address the edge proxy
    observed. A client-injected LEFT prefix is ignored."""

    def test_single_hop(self):
        req = _make_request(peer="10.0.0.1", xff="203.0.113.7")
        assert get_request_client_ip(req) == "203.0.113.7"

    def test_two_hops_rightmost_wins(self):
        """A client cannot fake themselves by prefixing a fake IP."""
        req = _make_request(peer="10.0.0.1", xff="198.51.100.99, 203.0.113.7")
        assert get_request_client_ip(req) == "203.0.113.7"

    def test_three_hops_rightmost_wins(self):
        req = _make_request(peer="10.0.0.1", xff="192.0.2.1, 198.51.100.99, 203.0.113.7")
        assert get_request_client_ip(req) == "203.0.113.7"

    def test_leftmost_injected_fake_is_ignored(self):
        """The headline regression: a client forging the leftmost hop
        must NOT see that forged value returned."""
        req = _make_request(peer="10.0.0.1", xff="0.0.0.0, 203.0.113.7")
        # The leftmost is "0.0.0.0" (a route to nowhere); the rightmost
        # is "203.0.113.7" (the real client). Return the real client.
        assert get_request_client_ip(req) == "203.0.113.7"


class TestXRealIPFallback:
    """X-Real-IP is consulted only when XFF is absent or invalid."""

    def test_real_ip_used_when_no_xff(self):
        req = _make_request(peer="10.0.0.1", real_ip="203.0.113.7")
        assert get_request_client_ip(req) == "203.0.113.7"

    def test_real_ip_ignored_when_xff_present(self):
        """XFF takes precedence — a misconfigured reverse proxy that
        sends both headers will produce XFF-wins semantics."""
        req = _make_request(peer="10.0.0.1", xff="203.0.113.7", real_ip="198.51.100.99")
        assert get_request_client_ip(req) == "203.0.113.7"

    def test_real_ip_with_invalid_xff(self):
        """If XFF has no valid IP, fall back to X-Real-IP."""
        req = _make_request(peer="10.0.0.1", xff="not-an-ip", real_ip="203.0.113.7")
        assert get_request_client_ip(req) == "203.0.113.7"

    def test_real_ip_invalid_falls_back_to_peer(self):
        req = _make_request(peer="10.0.0.1", real_ip="garbage")
        assert get_request_client_ip(req) == "10.0.0.1"


class TestNonProductionIgnoresHeaders:
    """In non-production, spoofable headers are ignored — the direct
    TCP peer is always returned. This prevents local dev / staging
    from being rate-limit-bypassed via a forged XFF."""

    def test_non_production_ignores_xff(self, monkeypatch):
        from arena.core import client_ip as client_ip_mod
        monkeypatch.setattr(client_ip_mod, "_trust_proxy_headers", lambda: False)
        req = _make_request(peer="127.0.0.1", xff="198.51.100.99")
        # The peer wins.
        assert get_request_client_ip(req) == "127.0.0.1"

    def test_non_production_ignores_real_ip(self, monkeypatch):
        from arena.core import client_ip as client_ip_mod
        monkeypatch.setattr(client_ip_mod, "_trust_proxy_headers", lambda: False)
        req = _make_request(peer="127.0.0.1", real_ip="198.51.100.99")
        assert get_request_client_ip(req) == "127.0.0.1"


class TestInvalidValuesFallback:
    """Header values that don't look like IPs are rejected."""

    def test_xff_garbage_falls_back_to_peer(self):
        req = _make_request(peer="10.0.0.1", xff="banana, papaya")
        assert get_request_client_ip(req) == "10.0.0.1"

    def test_xff_empty_falls_back_to_peer(self):
        req = _make_request(peer="10.0.0.1", xff="")
        # Empty header treated as absent → peer wins.
        assert get_request_client_ip(req) == "10.0.0.1"

    def test_xff_mixed_valid_invalid_picks_rightmost_valid(self):
        req = _make_request(peer="10.0.0.1", xff="not-an-ip, also-bad, 203.0.113.7")
        assert get_request_client_ip(req) == "203.0.113.7"

    def test_xff_all_invalid_falls_back_to_peer(self):
        req = _make_request(peer="10.0.0.1", xff="foo, bar, baz")
        assert get_request_client_ip(req) == "10.0.0.1"


class TestIPv6Support:
    """IPv6 is a first-class citizen — the helper must parse it."""

    def test_ipv6_address(self):
        req = _make_request(peer="::1", xff="2001:db8::1")
        assert get_request_client_ip(req) == "2001:db8::1"

    def test_ipv6_with_port(self):
        req = _make_request(peer="::1", xff="[2001:db8::1]:8080")
        assert get_request_client_ip(req) == "2001:db8::1"

    def test_ipv4_with_port(self):
        req = _make_request(peer="10.0.0.1", xff="203.0.113.7:8080")
        assert get_request_client_ip(req) == "203.0.113.7"

    def test_mixed_ipv4_ipv6_picks_rightmost_valid(self):
        req = _make_request(peer="10.0.0.1", xff="203.0.113.7, 2001:db8::1")
        assert get_request_client_ip(req) == "2001:db8::1"


class TestFallbackToPeer:
    """When all else fails, return the direct TCP peer."""

    def test_no_headers_returns_peer(self):
        req = _make_request(peer="192.0.2.42")
        assert get_request_client_ip(req) == "192.0.2.42"

    def test_unknown_peer_when_no_client_info(self):
        """Defensive: a request with no ``client`` attribute returns
        ``"unknown"`` — never empty, never raises."""
        scope = {"type": "http", "headers": []}
        req = Request(scope)
        # No client → falls back to "unknown".
        assert get_request_client_ip(req) == "unknown"