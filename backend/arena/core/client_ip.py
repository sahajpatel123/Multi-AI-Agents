"""Client IP extraction for rate limiting and lockouts.

Security contract
-----------------
Clients can freely set ``X-Forwarded-For``. Taking the *leftmost* hop
(the historical path in ``login_limiter`` / ``rate_limits``) let a single
attacker rotate forged identities and bypass login / registration
lockouts forever.

Rules this module enforces:
1. Always know the direct TCP peer (``request.client.host``).
2. Only consult proxy headers when running in production (we are behind
   a reverse proxy that appends / records the real connecting IP).
3. When consulting ``X-Forwarded-For``, take the **rightmost** hop —
   that is the address our edge proxy observed, not a client-injected
   prefix (``X-Forwarded-For: fake, real`` → ``real``).
4. Reject values that do not look like an IP; fall back to the peer.
"""

from __future__ import annotations

import ipaddress
import logging
from typing import Optional

from fastapi import Request

logger = logging.getLogger(__name__)


def _looks_like_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return False


def _direct_peer(request: Request) -> str:
    if request.client and request.client.host:
        host = request.client.host.strip()
        if host:
            return host
    return "unknown"


def _trust_proxy_headers() -> bool:
    """True only in production (edge reverse proxy in front of the app)."""
    try:
        from arena.config import get_settings

        return bool(get_settings().is_production)
    except Exception:
        # Fail closed: if settings are unavailable, never trust client
        # headers for rate-limit identity.
        return False


def _from_x_forwarded_for(header_value: str) -> Optional[str]:
    """Return the rightmost valid IP hop from an X-Forwarded-For header."""
    parts = [p.strip() for p in header_value.split(",") if p.strip()]
    if not parts:
        return None
    # Walk from the right so a client-injected left prefix is ignored.
    for candidate in reversed(parts):
        # Strip optional port (rare but seen on some proxies).
        host = candidate.split("%")[0]  # drop IPv6 zone id if present
        if host.startswith("[") and "]" in host:
            host = host[1 : host.index("]")]
        elif host.count(":") == 1 and not host.startswith(":"):
            # IPv4:port
            host = host.rsplit(":", 1)[0]
        if _looks_like_ip(host):
            return host
    return None


def get_request_client_ip(request: Request) -> str:
    """Return the client IP used for rate-limit / lockout keys.

    Production (trusted reverse proxy):
        Prefer rightmost X-Forwarded-For hop, then X-Real-IP, then peer.
    Non-production:
        Always use the direct TCP peer — ignore spoofable headers so
        local tests and misconfigured staging cannot be rate-limit
        bypassed via a forged XFF.
    """
    peer = _direct_peer(request)

    if not _trust_proxy_headers():
        return peer

    xff = request.headers.get("X-Forwarded-For") or request.headers.get("x-forwarded-for")
    if xff:
        hop = _from_x_forwarded_for(xff)
        if hop:
            return hop

    real_ip = (request.headers.get("X-Real-IP") or request.headers.get("x-real-ip") or "").strip()
    if real_ip and _looks_like_ip(real_ip):
        return real_ip

    return peer
