"""Blacklist coverage: every auth path must consult token_blacklist.

A user who clicks "Logout" expects the session to actually end. Today
the blacklist only short-circuits access tokens — two endpoints still
accept a "logged-out" session:

  - GET /api/auth/me — decodes the bearer token directly, bypassing
    get_current_user, so the blacklist is never consulted.
  - POST /api/auth/refresh — accepts the refresh token directly via
    JSON body or Authorization header. /logout does NOT blacklist the
    refresh token, so a logged-out client can mint a fresh access
    token via /refresh and continue using the API as if nothing
    happened.

These tests pin the contract: after logout, both /me and /refresh
must reject the previously-valid tokens with 401.
"""

import pytest


def _make_user_and_tokens(make_user):
    """Create a user and return (user, access, refresh) JWT strings."""
    from arena.core.auth import create_access_token, create_refresh_token
    from arena.db_models import UserTier

    user = make_user(email="bl@test.com", tier=UserTier.PLUS)
    access = create_access_token(user.id, user.email)
    refresh = create_refresh_token(user.id, user.email)
    return user, access, refresh


@pytest.fixture(autouse=True)
def _reset_blacklist(isolated_db):
    """Each test starts with a wiped revoked_tokens table so revocation
    from a prior test never bleeds in. The blacklist is now DB-backed,
    so the reset has to actually delete the rows.
    """
    from arena.db_models import RevokedToken
    SessionLocal = isolated_db
    s = SessionLocal()
    try:
        s.query(RevokedToken).delete()
        s.commit()
    finally:
        s.close()
    yield
    s = SessionLocal()
    try:
        s.query(RevokedToken).delete()
        s.commit()
    finally:
        s.close()


class TestLogoutInvalidatesAccessToken:
    @pytest.mark.asyncio
    async def test_me_rejects_blacklisted_access_token(
        self, app_client, make_user
    ):
        user, access, _refresh = _make_user_and_tokens(make_user)
        headers = {"Authorization": f"Bearer {access}"}

        # Sanity: /me works BEFORE logout.
        ok = await app_client.get("/api/auth/me", headers=headers)
        assert ok.status_code == 200

        # Logout revokes the access token.
        logout = await app_client.post("/api/auth/logout", headers=headers)
        assert logout.status_code == 200

        # /me must now reject the same token. Today it does NOT — bug.
        after = await app_client.get("/api/auth/me", headers=headers)
        assert after.status_code == 401, (
            "GET /api/auth/me must honor the blacklist and return 401 "
            "after /logout, otherwise a logged-out session is reusable."
        )


class TestLogoutInvalidatesRefreshToken:
    @pytest.mark.asyncio
    async def test_refresh_rejects_blacklisted_refresh_token(
        self, app_client, make_user
    ):
        user, access, refresh = _make_user_and_tokens(make_user)
        headers = {"Authorization": f"Bearer {access}"}

        # Logout. The client is supposed to send its current refresh
        # token so /logout can revoke it. Today it doesn't, but the
        # endpoint should still accept and revoke it.
        logout = await app_client.post(
            "/api/auth/logout",
            headers=headers,
            json={"refresh_token": refresh},
        )
        assert logout.status_code == 200

        # /refresh with the now-revoked refresh token must fail. Today
        # it does NOT — bug. A logged-out client can silently mint a
        # new access token via /refresh.
        refreshed = await app_client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh},
        )
        assert refreshed.status_code == 401, (
            "POST /api/auth/refresh must reject a refresh token that was "
            "blacklisted by /logout, otherwise logout is a no-op."
        )

    @pytest.mark.asyncio
    async def test_logout_blacklists_access_token_via_authorization_header(
        self, app_client, make_user, isolated_db
    ):
        # /logout must also blacklist the access token in the header (the
        # one its auth dep validated). Otherwise logging out from a
        # browser session that only has the header set (no body) leaks the
        # access token.
        user, access, _refresh = _make_user_and_tokens(make_user)
        headers = {"Authorization": f"Bearer {access}"}

        logout = await app_client.post("/api/auth/logout", headers=headers)
        assert logout.status_code == 200

        # Access token blacklisted.
        from arena.core.token_blacklist import token_blacklist
        # Use a fresh session to read the table, separate from the
        # request-scoped app_client session.
        from arena.db_models import RevokedToken
        SessionLocal = isolated_db
        s = SessionLocal()
        try:
            assert token_blacklist.is_blacklisted(access, s) is True
        finally:
            s.close()

        # /me rejects the blacklisted access token via the dep chain.
        after = await app_client.get("/api/auth/me", headers=headers)
        assert after.status_code == 401


class TestLogoutDoesNotRevokeForeignRefresh:
    """Authenticated caller must not be able to blacklist another user's refresh."""

    @pytest.mark.asyncio
    async def test_logout_ignores_foreign_refresh_token(
        self, app_client, make_user, isolated_db
    ):
        from arena.core.auth import create_access_token, create_refresh_token
        from arena.core.token_blacklist import token_blacklist
        from arena.db_models import UserTier

        victim = make_user(email="victim-logout@test.com", tier=UserTier.PLUS)
        attacker = make_user(email="attacker-logout@test.com", tier=UserTier.PLUS)
        victim_refresh = create_refresh_token(victim.id, victim.email)
        attacker_access = create_access_token(attacker.id, attacker.email)

        logout = await app_client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {attacker_access}"},
            json={"refresh_token": victim_refresh},
        )
        assert logout.status_code == 200

        SessionLocal = isolated_db
        s = SessionLocal()
        try:
            assert token_blacklist.is_blacklisted(victim_refresh, s) is False, (
                "logout must not blacklist another user's refresh token"
            )
        finally:
            s.close()

        # Victim can still rotate with their refresh token.
        refreshed = await app_client.post(
            "/api/auth/refresh",
            json={"refresh_token": victim_refresh},
        )
        assert refreshed.status_code == 200, (
            f"victim refresh must still work after foreign logout attempt; "
            f"got {refreshed.status_code} {refreshed.text}"
        )
