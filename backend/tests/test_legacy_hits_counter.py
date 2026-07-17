"""Regression tests for the legacy_password_hits counter.

The legacy password fallback in arena/core/auth.py keeps an in-process
counter so operators can watch admin-gated /api/health/detailed and
see whether any user is still on a pre-SHA256-prehash hash.

These tests pin:
  1. legacy_hits() increments only on successful legacy path matches.
  2. modern matches and failed logins do not increment.
  3. /api/health/detailed surfaces legacy_password_hits to admins only.
  4. /api/health (public) never leaks legacy_password_hits.
"""

from __future__ import annotations

import pytest


def _reset_legacy_hits():
    import arena.core.auth as auth_mod

    with auth_mod._legacy_hit_lock:
        saved = auth_mod._legacy_hits
        auth_mod._legacy_hits = 0
    return saved


def _restore_legacy_hits(saved: int) -> None:
    import arena.core.auth as auth_mod

    with auth_mod._legacy_hit_lock:
        auth_mod._legacy_hits = saved


class TestLegacyHitsCounter:
    def test_starts_at_zero(self):
        from arena.core.auth import legacy_hits

        saved = _reset_legacy_hits()
        try:
            assert legacy_hits() == 0
        finally:
            _restore_legacy_hits(saved)

    def test_increments_on_legacy_path_match(self):
        import bcrypt as _bcrypt
        from arena.core.auth import legacy_hits, verify_password
        import arena.core.auth as auth_mod

        saved = _reset_legacy_hits()
        try:
            plain = "legacy-test-pass"
            legacy_hash = _bcrypt.hashpw(
                plain.encode("utf-8")[:72], _bcrypt.gensalt(12)
            ).decode("utf-8")

            matched, used_legacy = verify_password(plain, legacy_hash)
            assert matched and used_legacy
            assert legacy_hits() == 1
            assert auth_mod._legacy_hits == 1
        finally:
            _restore_legacy_hits(saved)

    def test_does_not_increment_on_modern_path_match(self):
        from arena.core.auth import hash_password, legacy_hits, verify_password

        saved = _reset_legacy_hits()
        try:
            plain = "modern-test-pass"
            modern_hash = hash_password(plain)
            matched, used_legacy = verify_password(plain, modern_hash)
            assert matched and not used_legacy
            assert legacy_hits() == 0
        finally:
            _restore_legacy_hits(saved)

    def test_does_not_increment_on_failed_match(self):
        from arena.core.auth import hash_password, legacy_hits, verify_password

        saved = _reset_legacy_hits()
        try:
            modern_hash = hash_password("correct")
            matched, _ = verify_password("wrong-password", modern_hash)
            assert not matched
            assert legacy_hits() == 0
        finally:
            _restore_legacy_hits(saved)


class TestLegacyHitsInHealthEndpoint:
    @pytest.mark.asyncio
    async def test_detailed_exposes_legacy_password_hits_to_admin(
        self, app_client, auth_headers, isolated_db, monkeypatch
    ):
        from arena import config

        monkeypatch.setenv("ADMIN_EMAIL", "user@test.com")
        config.get_settings.cache_clear()
        headers = auth_headers()
        r = await app_client.get("/api/health/detailed", headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert "legacy_password_hits" in body
        assert isinstance(body["legacy_password_hits"], int)

    @pytest.mark.asyncio
    async def test_non_admin_cannot_read_legacy_password_hits(
        self, app_client, auth_headers, isolated_db, monkeypatch
    ):
        from arena import config

        monkeypatch.setenv("ADMIN_EMAIL", "ops@arena.test")
        config.get_settings.cache_clear()
        headers = auth_headers()
        r = await app_client.get("/api/health/detailed", headers=headers)
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_public_health_does_not_leak_legacy_password_hits(
        self, app_client
    ):
        r = await app_client.get("/api/health")
        assert r.status_code == 200
        body = r.json()
        assert "legacy_password_hits" not in body
