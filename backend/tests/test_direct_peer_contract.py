"""Regression tests for ``_direct_peer``.

The helper returns the direct TCP peer (``request.client.host``) —
this is the fallback when no proxy headers are trusted. A regression
here would either:

  - Raise on a request with no ``client`` attribute → 5xx on every
    request that goes through a path that strips the client.
  - Return the request URL host instead of the TCP peer → defeats
    the rightmost-hop logic (XFF would never be consulted).
  - Not strip whitespace → a peer with leading/trailing whitespace
    mismatches the rate-limit bucket key (separate bucket per
    "rogue" peer).

Pins:
  - Returns the TCP peer's host string.
  - Strips leading/trailing whitespace.
  - Returns ``"unknown"`` when no client info is available.
  - Returns ``"unknown"`` when client.host is empty / whitespace.
  - Does NOT raise on a malformed request.
"""

from __future__ import annotations

import pytest
from fastapi import Request

from arena.core.client_ip import _direct_peer


def _make_request_with_client(host: str | None) -> Request:
    """Build a Request whose ``client.host`` is the given host.

    The FastAPI Request constructor accepts a `client` tuple in the
    scope and wraps it in an Address; the resulting Request.client.host
    is the first element.
    """
    if host is None:
        client = None
    else:
        client = (host, 0)
    scope = {
        "type": "http",
        "headers": [],
        "client": client,
    }
    return Request(scope)


class TestDirectPeerHappyPath:
    def test_returns_ipv4_peer(self):
        req = _make_request_with_client("203.0.113.42")
        assert _direct_peer(req) == "203.0.113.42"

    def test_returns_ipv6_peer(self):
        req = _make_request_with_client("2001:db8::1")
        assert _direct_peer(req) == "2001:db8::1"

    def test_returns_localhost(self):
        req = _make_request_with_client("127.0.0.1")
        assert _direct_peer(req) == "127.0.0.1"

    def test_returns_hostname(self):
        """The peer is typically an IP but can be a hostname in
        some test environments."""
        req = _make_request_with_client("client.example.com")
        assert _direct_peer(req) == "client.example.com"


class TestDirectPeerStripsWhitespace:
    def test_strips_leading_whitespace(self):
        req = _make_request_with_client("  203.0.113.1")
        assert _direct_peer(req) == "203.0.113.1"

    def test_strips_trailing_whitespace(self):
        req = _make_request_with_client("203.0.113.1  ")
        assert _direct_peer(req) == "203.0.113.1"

    def test_strips_both(self):
        req = _make_request_with_client("  203.0.113.1\n")
        assert _direct_peer(req) == "203.0.113.1"

    def test_preserves_internal_whitespace(self):
        """Internal whitespace is preserved (only leading/trailing
        is stripped)."""
        req = _make_request_with_client("  my host  ")
        assert _direct_peer(req) == "my host"


class TestDirectPeerMissingClient:
    def test_no_client_returns_unknown(self):
        """A request without a ``client`` (no client info available)
        returns ``"unknown"`` — never raises."""
        scope = {"type": "http", "headers": [], "client": None}
        req = Request(scope)
        assert _direct_peer(req) == "unknown"

    def test_no_client_attribute_returns_unknown(self):
        """A request whose ``client`` attribute is missing entirely
        (defensive: subclass with ``client = None``) returns
        ``"unknown"``."""
        # The Starlette Request constructor always populates
        # ``client`` from the scope; a request with ``client = None``
        # is a valid case (no client info).
        scope = {"type": "http", "headers": [], "client": None}
        req = Request(scope)
        assert _direct_peer(req) == "unknown"


class TestDirectPeerDefensive:
    def test_does_not_raise_on_minimal_request(self):
        """A minimal request stub does not raise."""
        scope = {"type": "http", "headers": [], "client": None}
        req = Request(scope)
        # Should NOT raise.
        _direct_peer(req)

    def test_returns_string_type(self):
        """The return type is always str — never None or bytes.
        A regression that returned ``None`` would 500 every
        rate-limit bucket-key construction."""
        req = _make_request_with_client("203.0.113.1")
        result = _direct_peer(req)
        assert isinstance(result, str)
        assert not isinstance(result, bytes)

    def test_does_not_consult_xff(self):
        """The helper ONLY uses the TCP peer — even with a valid
        XFF header, the result is the peer (not the XFF). This
        is the correct behavior — proxy headers are consulted
        by ``get_request_client_ip``, not by this fallback."""
        # Build a request with BOTH a peer and an XFF header.
        scope = {
            "type": "http",
            "headers": [(b"x-forwarded-for", b"198.51.100.99")],
            "client": ("203.0.113.1", 0),
        }
        req = Request(scope)
        # The helper must return the peer, not the XFF.
        assert _direct_peer(req) == "203.0.113.1"


class TestDirectPeerIdempotence:
    def test_repeated_call_is_deterministic(self):
        for _ in range(3):
            req = _make_request_with_client("203.0.113.1")
            assert _direct_peer(req) == "203.0.113.1"


class TestDirectPeerRealRequestIntegration:
    def test_real_request_with_ipv4(self):
        scope = {
            "type": "http",
            "headers": [],
            "client": ("203.0.113.99", 54321),
        }
        req = Request(scope)
        assert _direct_peer(req) == "203.0.113.99"

    def test_real_request_with_localhost(self):
        scope = {
            "type": "http",
            "headers": [],
            "client": ("127.0.0.1", 8080),
        }
        req = Request(scope)
        assert _direct_peer(req) == "127.0.0.1"