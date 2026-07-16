"""X-Forwarded-For must not let attackers rotate rate-limit identity.

Regression for the leftmost-hop spoof: a client that set
``X-Forwarded-For: 1.2.3.4`` previously got a brand-new rate-limit key
per request, voiding login / registration lockouts.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from arena.core.client_ip import get_request_client_ip


def _request(
    *,
    peer: str = "10.0.0.9",
    headers: dict | None = None,
) -> MagicMock:
    req = MagicMock()
    req.client = SimpleNamespace(host=peer)
    hdrs = headers or {}
    req.headers.get = lambda key, default=None: hdrs.get(key) or hdrs.get(key.lower()) or default
    return req


@pytest.fixture
def production_env(monkeypatch):
    from arena.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("ENVIRONMENT", "production")
    # Re-import path uses get_settings each call; clear cache so is_production flips.
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    get_settings.cache_clear()


@pytest.fixture
def development_env(monkeypatch):
    from arena.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("ENVIRONMENT", "development")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class TestClientIpDevIgnoresSpoofedXff:
    def test_uses_peer_when_xff_present(self, development_env):
        req = _request(
            peer="203.0.113.10",
            headers={"X-Forwarded-For": "1.1.1.1, 2.2.2.2"},
        )
        assert get_request_client_ip(req) == "203.0.113.10"

    def test_uses_peer_without_headers(self, development_env):
        req = _request(peer="198.51.100.7")
        assert get_request_client_ip(req) == "198.51.100.7"

    def test_spoof_rotation_cannot_change_key(self, development_env):
        """Classic bypass: attacker sends a new leftmost XFF each try."""
        peer = "203.0.113.50"
        keys = {
            get_request_client_ip(
                _request(peer=peer, headers={"X-Forwarded-For": f"9.9.9.{i}"})
            )
            for i in range(20)
        }
        assert keys == {peer}


class TestClientIpProductionUsesRightmostHop:
    def test_rightmost_xff_wins(self, production_env, monkeypatch):
        # Force is_production True even if Settings picks up other env.
        from arena import config

        monkeypatch.setattr(
            config.Settings,
            "is_production",
            property(lambda self: True),
        )
        config.get_settings.cache_clear()

        req = _request(
            peer="10.0.0.1",
            headers={"X-Forwarded-For": "1.2.3.4, 5.6.7.8, 198.51.100.20"},
        )
        assert get_request_client_ip(req) == "198.51.100.20"

    def test_ignores_invalid_rightmost_falls_back(self, production_env, monkeypatch):
        from arena import config

        monkeypatch.setattr(
            config.Settings,
            "is_production",
            property(lambda self: True),
        )
        config.get_settings.cache_clear()

        req = _request(
            peer="10.0.0.2",
            headers={"X-Forwarded-For": "1.2.3.4, not-an-ip"},
        )
        # Rightmost invalid → walk left → 1.2.3.4 is valid.
        assert get_request_client_ip(req) == "1.2.3.4"

    def test_x_real_ip_when_no_xff(self, production_env, monkeypatch):
        from arena import config

        monkeypatch.setattr(
            config.Settings,
            "is_production",
            property(lambda self: True),
        )
        config.get_settings.cache_clear()

        req = _request(
            peer="10.0.0.3",
            headers={"X-Real-IP": "198.51.100.99"},
        )
        assert get_request_client_ip(req) == "198.51.100.99"

    def test_leftmost_spoof_alone_does_not_win_over_real_hop(
        self, production_env, monkeypatch
    ):
        from arena import config

        monkeypatch.setattr(
            config.Settings,
            "is_production",
            property(lambda self: True),
        )
        config.get_settings.cache_clear()

        # Attacker injects leftmost; edge proxy appends real client on the right.
        req = _request(
            peer="10.0.0.4",
            headers={"X-Forwarded-For": "8.8.8.8, 203.0.113.77"},
        )
        assert get_request_client_ip(req) == "203.0.113.77"
