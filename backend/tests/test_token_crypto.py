"""Unit tests for arena.core.token_crypto Fernet helpers."""

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet

from arena.core import token_crypto as tc


@pytest.fixture(autouse=True)
def _reset_fernet_singleton(monkeypatch):
    """Each test starts with a clean module-level Fernet cache."""
    monkeypatch.setattr(tc, "_fernet", None)
    yield
    monkeypatch.setattr(tc, "_fernet", None)


def test_get_fernet_none_without_key(monkeypatch):
    monkeypatch.delenv("ENCRYPTION_KEY", raising=False)
    assert tc.get_fernet() is None


def test_get_fernet_none_with_invalid_key(monkeypatch):
    monkeypatch.setenv("ENCRYPTION_KEY", "not-a-valid-fernet-key")
    assert tc.get_fernet() is None


def test_encrypt_decrypt_roundtrip(monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("ENCRYPTION_KEY", key)
    blob = tc.encrypt_token("super-secret-oauth-token")
    assert blob != "super-secret-oauth-token"
    assert tc.decrypt_token(blob) == "super-secret-oauth-token"


def test_encrypt_raises_when_unavailable(monkeypatch):
    monkeypatch.delenv("ENCRYPTION_KEY", raising=False)
    with pytest.raises(RuntimeError, match="encryption_unavailable"):
        tc.encrypt_token("x")


def test_try_decrypt_returns_none_on_bad_blob(monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("ENCRYPTION_KEY", key)
    assert tc.try_decrypt_token("totally-not-ciphertext") is None


def test_try_decrypt_returns_none_when_key_missing(monkeypatch):
    monkeypatch.delenv("ENCRYPTION_KEY", raising=False)
    assert tc.try_decrypt_token("anything") is None


def test_try_decrypt_success(monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("ENCRYPTION_KEY", key)
    blob = tc.encrypt_token("mcp-token-1")
    assert tc.try_decrypt_token(blob) == "mcp-token-1"
