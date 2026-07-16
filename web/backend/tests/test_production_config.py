"""Production fail-closed settings + health shape for ship readiness."""

from __future__ import annotations

import pytest


def test_get_health_data_healthy_when_db_connected():
    from arena.core.observability import get_health_data, get_health_data_detailed

    # Public helper — used by GET /api/health (unauthenticated). Must
    # NOT leak version/uptime/total_requests_today.
    public = get_health_data(db_connected=True)
    assert public["status"] == "healthy"
    assert public["database"] == "connected"
    for sensitive in ("version", "uptime_seconds", "total_requests_today"):
        assert sensitive not in public, (
            f"public helper must not expose {sensitive!r}; got {sorted(public.keys())}"
        )

    # Detailed helper — used by GET /api/health/detailed (authenticated).
    # Operators need the full panel there.
    detailed = get_health_data_detailed(db_connected=True)
    assert "version" in detailed
    assert "uptime_seconds" in detailed
    assert "total_requests_today" in detailed


def test_get_health_data_degraded_when_db_disconnected():
    from arena.core.observability import get_health_data

    body = get_health_data(db_connected=False)
    assert body["status"] == "degraded"
    assert body["database"] == "disconnected"


def _settings(**kwargs):
    from arena.config import Settings

    base = {
        "anthropic_api_key": "sk-ant-test-key-not-real-but-valid-prefix",
        "secret_key": "a" * 40,
        "environment": "development",
        "allowed_origins": "http://localhost:5173",
        "database_url": "",
        "encryption_key": "",
        "frontend_public_url": "http://localhost:5173",
        "openai_api_key": "",
    }
    base.update(kwargs)
    return Settings(**base)


def test_production_rejects_weak_secret_key(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("RENDER_SERVICE_ID", raising=False)
    s = _settings(
        environment="production",
        secret_key="change-me-in-production-use-a-long-random-string",
        database_url="postgresql://user:pass@db/arena",
        encryption_key="x" * 44,  # invalid Fernet — will also fail; use real one below
        allowed_origins="https://arena.example.com",
        frontend_public_url="https://arena.example.com",
    )
    with pytest.raises(SystemExit):
        s.validate_secrets()


def test_production_rejects_localhost_only_cors(monkeypatch):
    from cryptography.fernet import Fernet

    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("RENDER_SERVICE_ID", raising=False)
    key = Fernet.generate_key().decode()
    s = _settings(
        environment="production",
        secret_key="prod-secret-key-" + "x" * 24,
        database_url="postgresql://user:pass@db/arena",
        encryption_key=key,
        allowed_origins="http://localhost:5173,http://127.0.0.1:5173",
        frontend_public_url="https://arena.example.com",
    )
    with pytest.raises(SystemExit):
        s.validate_secrets()


def test_production_rejects_wildcard_cors(monkeypatch):
    from cryptography.fernet import Fernet

    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("RENDER_SERVICE_ID", raising=False)
    key = Fernet.generate_key().decode()
    s = _settings(
        environment="production",
        secret_key="prod-secret-key-" + "x" * 24,
        database_url="postgresql://user:pass@db/arena",
        encryption_key=key,
        allowed_origins="*",
        frontend_public_url="https://arena.example.com",
    )
    with pytest.raises(SystemExit):
        s.validate_secrets()


def test_production_accepts_ship_safe_config(monkeypatch):
    from cryptography.fernet import Fernet

    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("RENDER_SERVICE_ID", raising=False)
    key = Fernet.generate_key().decode()
    s = _settings(
        environment="production",
        secret_key="prod-secret-key-" + "x" * 24,
        database_url="postgresql://user:pass@db/arena",
        encryption_key=key,
        allowed_origins="https://arena.example.com",
        frontend_public_url="https://arena.example.com",
    )
    s.validate_secrets()  # must not SystemExit


def test_development_allows_sqlite_without_encryption(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("RENDER_SERVICE_ID", raising=False)
    s = _settings(
        environment="development",
        secret_key="dev-secret-key-" + "x" * 24,
        database_url="",
        encryption_key="",
        allowed_origins="http://localhost:5173",
    )
    s.validate_secrets()  # must not SystemExit
