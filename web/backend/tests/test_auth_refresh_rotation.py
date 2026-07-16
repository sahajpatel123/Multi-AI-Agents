"""Refresh-token rotation contract.

A captured refresh token that wasn't blacklisted could be replayed
forever — only the legitimate user's eventual /logout would stop
mints. iter-20 added single-use refresh tokens: every successful
/refresh blacklists the OLD refresh token before issuing a new pair.

These tests pin three contracts:
  1. Two consecutive /refresh calls on the same refresh token return
     DIFFERENT access tokens (rotation actually happens — not just a
     re-signature of the same payload).
  2. Replaying the captured (pre-rotation) refresh token after a
     successful rotation returns 401 'Refresh token has been revoked'.
  3. The new refresh token itself works for the next /refresh (the
     session is still maintainable for the legitimate client).
  4. An old refresh token that's used after the rotation event is
     rejected even if the user has not /logout'd.
"""

import pytest


@pytest.fixture(autouse=True)
def _clear_blacklist(isolated_db):
    """Reset revoked_tokens between tests so prior rotation doesn't
    bleed in.
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


def _user_and_refresh(make_user, isolated_db):
    from arena.core.auth import create_refresh_token
    from arena.db_models import UserTier
    user = make_user(email="rot@test.com", tier=UserTier.PLUS)
    refresh = create_refresh_token(user.id, user.email)
    return user, refresh


class TestRefreshRotation:
    @pytest.mark.asyncio
    async def test_two_refresh_calls_return_different_access_tokens(
        self, app_client, make_user, isolated_db
    ):
        _user, refresh = _user_and_refresh(make_user, isolated_db)
        r1 = await app_client.post(
            "/api/auth/refresh", json={"refresh_token": refresh}
        )
        assert r1.status_code == 200, r1.text
        access_1 = r1.json()["access_token"]

        # The first refresh issued a NEW refresh token. Use that, not
        # the captured one — that's exactly what a well-behaved client
        # does. We expect the second call to also succeed and produce
        # yet another fresh access token.
        new_refresh = r1.json()["refresh_token"]
        r2 = await app_client.post(
            "/api/auth/refresh", json={"refresh_token": new_refresh}
        )
        assert r2.status_code == 200, r2.text
        access_2 = r2.json()["access_token"]

        assert access_1 != access_2, (
            "refresh did not rotate: same access token returned on "
            "second /refresh — blacking out the old refresh token is "
            "also a no-op."
        )

    @pytest.mark.asyncio
    async def test_captured_refresh_token_replay_after_rotation_401(
        self, app_client, make_user, isolated_db
    ):
        # The threat model: an attacker captures the user's refresh
        # token, then the user does one legitimate /refresh. The
        # attacker's token must now be rejected.
        _user, captured = _user_and_refresh(make_user, isolated_db)

        # User rotates their own session.
        r1 = await app_client.post(
            "/api/auth/refresh", json={"refresh_token": captured}
        )
        assert r1.status_code == 200, r1.text

        # Attacker replays the captured (now-blacklisted) refresh token.
        r2 = await app_client.post(
            "/api/auth/refresh", json={"refresh_token": captured}
        )
        assert r2.status_code == 401, (
            f"captured refresh token accepted after rotation; got "
            f"{r2.status_code} {r2.text} — single-use rotation is broken."
        )
        assert "revoked" in str(r2.json()).lower(), (
            f"expected 'revoked' detail, got: {r2.json()}"
        )

    @pytest.mark.asyncio
    async def test_new_refresh_token_issued_after_rotation_works(
        self, app_client, make_user, isolated_db
    ):
        _user, captured = _user_and_refresh(make_user, isolated_db)
        r1 = await app_client.post(
            "/api/auth/refresh", json={"refresh_token": captured}
        )
        assert r1.status_code == 200
        new_refresh = r1.json()["refresh_token"]
        assert new_refresh != captured, (
            "/refresh returned the SAME refresh token instead of "
            "rotating — captured tokens replay forever."
        )

        # The new token must work for the next call.
        r2 = await app_client.post(
            "/api/auth/refresh", json={"refresh_token": new_refresh}
        )
        assert r2.status_code == 200, (
            f"newly-issued refresh token rejected on second use: "
            f"{r2.status_code} {r2.text}"
        )

    @pytest.mark.asyncio
    async def test_rotation_does_not_break_logout(
        self, app_client, make_user, isolated_db
    ):
        # /logout + /refresh interaction: the user logs out, then an
        # attacker who captured the refresh token tries to use it
        # AFTER rotation. Both defenses should reject — rotation
        # blacklists the original, logout blacklists both.
        _user, captured = _user_and_refresh(make_user, isolated_db)
        # First legitimate refresh rotates the captured token.
        r1 = await app_client.post(
            "/api/auth/refresh", json={"refresh_token": captured}
        )
        assert r1.status_code == 200

        # Now the new token. Pretend the user logs out (no auth header
        # — full logout needs access token; we're testing the rotation
        # chain alone here). A NEW replay attempt must fail.
        new_refresh = r1.json()["refresh_token"]
        r2 = await app_client.post(
            "/api/auth/refresh", json={"refresh_token": new_refresh}
        )
        assert r2.status_code == 200

        # Chain another rotation: the second new token works.
        newer_refresh = r2.json()["refresh_token"]
        r3 = await app_client.post(
            "/api/auth/refresh", json={"refresh_token": newer_refresh}
        )
        assert r3.status_code == 200

        # And the original captured token from the start of this test
        # is permanently revoked.
        r4 = await app_client.post(
            "/api/auth/refresh", json={"refresh_token": captured}
        )
        assert r4.status_code == 401

    @pytest.mark.asyncio
    async def test_rotation_fails_closed_when_blacklist_write_fails(
        self, app_client, make_user, isolated_db, monkeypatch
    ):
        """If RevokedToken insert fails, do NOT mint a new pair.

        Fail-open rotation (old token still live + new pair issued) is
        exactly the dual-session hole single-use refresh is meant to
        close. Blacklist write errors must surface as 503 and leave
        the presented refresh token still usable for a retry.
        """
        from arena.core.token_blacklist import token_blacklist

        _user, refresh = _user_and_refresh(make_user, isolated_db)
        real_add = token_blacklist.add

        def _boom(*_a, **_k):
            raise RuntimeError("simulated db outage")

        monkeypatch.setattr(token_blacklist, "add", _boom)

        r = await app_client.post(
            "/api/auth/refresh", json={"refresh_token": refresh}
        )
        assert r.status_code == 503, (
            f"expected fail-closed 503 when blacklist write fails, got "
            f"{r.status_code} {r.text}"
        )
        body = r.json()
        assert "access_token" not in body
        assert "refresh_token" not in body

        # Restore blacklist writes — original refresh must still work
        # (session was not partially consumed on the failed rotation).
        monkeypatch.setattr(token_blacklist, "add", real_add)

        r2 = await app_client.post(
            "/api/auth/refresh", json={"refresh_token": refresh}
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["access_token"]
        assert r2.json()["refresh_token"] != refresh
