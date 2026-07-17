"""Comprehensive regression test for the /logout IDOR fix.

iter-11 closed the basic /me + /refresh blacklist-bypass. iter-33
watcher (commit db251e1) closed the IDOR: previously, an attacker
could submit a VICTIM's refresh token to /logout and have it
blacklisted, locking the victim out. The /logout endpoint now
verifies token ownership (the refresh token's `sub` claim matches
the authenticated caller's user_id) before blacklisting.

These tests pin the FULL security property:
  1. The victim's refresh token is NOT in revoked_tokens after the
     attacker's logout attempt.
  2. The victim can still use their refresh token to mint a new
     access token.
  3. The blacklist contains ONLY the attacker's tokens, not the
     victim's.
  4. Repeating the attack doesn't accumulate collateral damage —
     each attempt leaves the victim unaffected.
  5. The attacker's OWN access token IS blacklisted (so the
     legitimate logout isn't a no-op for the attacker).
"""

import pytest


@pytest.fixture(autouse=True)
def _reset_blacklist(isolated_db):
    """Wipe revoked_tokens before and after each test so the IDOR
    attempts from prior tests don't bleed in.
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


class TestLogoutIDORProperty:
    """End-to-end IDOR contract."""

    @pytest.mark.asyncio
    async def test_attacker_logout_does_not_blacklist_victims_refresh(
        self, app_client, make_user, isolated_db
    ):
        from arena.core.auth import create_access_token, create_refresh_token
        from arena.db_models import RevokedToken, UserTier

        # Two users, separate sessions.
        victim = make_user(email="victim-idor@test.com", tier=UserTier.PLUS)
        attacker = make_user(email="attacker-idor@test.com", tier=UserTier.PLUS)

        victim_refresh = create_refresh_token(victim.id, victim.email)
        attacker_access = create_access_token(attacker.id, attacker.email)

        # Attacker logs out their own session, but the body has VICTIM's refresh.
        r = await app_client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {attacker_access}"},
            json={"refresh_token": victim_refresh},
        )
        assert r.status_code == 200, (
            f"/logout returned {r.status_code} — IDOR protection is "
            f"rejecting the legitimate call too. Should succeed without "
            f"blacklisting anything foreign."
        )

        # 1. Victim's refresh token is NOT in revoked_tokens.
        SessionLocal = isolated_db
        s = SessionLocal()
        try:
            victim_row = s.query(RevokedToken).filter_by(
                reason="logout"
            ).all()
            victim_hashes = {row.token_hash for row in victim_row}
            from arena.core.token_blacklist import _hash_token
            assert _hash_token(victim_refresh) not in victim_hashes, (
                "IDOR: attacker's /logout call blacklisted the victim's "
                "refresh token. The /logout endpoint must verify the "
                "refresh token's `sub` matches the caller's user_id."
            )
        finally:
            s.close()

        # 2. Victim can still use their refresh token.
        r = await app_client.post(
            "/api/auth/refresh",
            json={"refresh_token": victim_refresh},
        )
        assert r.status_code == 200, (
            f"victim's refresh token was rejected (status {r.status_code}); "
            f"the IDOR victim's session was collateral damage."
        )
        new_access = r.json()["access_token"]
        assert new_access, "rotated access token must be non-empty"

        # 3. The new access token works for the victim.
        me = await app_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {new_access}"},
        )
        assert me.status_code == 200, me.text
        assert me.json()["email"] == victim.email, (
            f"rotated token should belong to victim, got {me.json()}"
        )

    @pytest.mark.asyncio
    async def test_repeated_attacker_logout_attempts_no_accumulation(
        self, app_client, make_user, isolated_db
    ):
        """Three consecutive IDOR attempts must not progressively damage
        the victim. The blacklist is idempotent on the same token, and
        a non-owned token never reaches the DB.
        """
        from arena.core.auth import create_access_token, create_refresh_token
        from arena.core.token_blacklist import _hash_token
        from arena.db_models import RevokedToken, UserTier

        victim = make_user(email="victim-repeat@test.com", tier=UserTier.PLUS)
        attacker = make_user(email="attacker-repeat@test.com", tier=UserTier.PLUS)

        victim_refresh = create_refresh_token(victim.id, victim.email)

        SessionLocal = isolated_db
        # 3 IDOR attempts — mint a fresh attacker access each time because
        # a successful logout blacklists the previous access token.
        for _ in range(3):
            attacker_access = create_access_token(attacker.id, attacker.email)
            r = await app_client.post(
                "/api/auth/logout",
                headers={"Authorization": f"Bearer {attacker_access}"},
                json={"refresh_token": victim_refresh},
            )
            assert r.status_code == 200

        # Victim's refresh token is still NOT in the table.
        s = SessionLocal()
        try:
            victim_hash = _hash_token(victim_refresh)
            row = s.query(RevokedToken).filter_by(token_hash=victim_hash).first()
            assert row is None, (
                f"after 3 IDOR attempts, victim's refresh is in revoked_tokens: {row}"
            )
        finally:
            s.close()

    @pytest.mark.asyncio
    async def test_attacker_own_logout_still_works_during_idor_attempt(
        self, app_client, make_user, isolated_db
    ):
        """The IDOR fix must not break the legitimate logout path:
        the attacker's OWN access token should still get blacklisted
        (so logging out genuinely ends the attacker's session).
        """
        from arena.core.auth import create_access_token, create_refresh_token
        from arena.core.token_blacklist import _hash_token
        from arena.db_models import RevokedToken, UserTier

        attacker = make_user(email="attacker-legit@test.com", tier=UserTier.PLUS)
        attacker_access = create_access_token(attacker.id, attacker.email)

        # Some random refresh token (not the attacker's own) — the
        # endpoint should still log out the attacker's access token.
        fake_refresh = "fake-refresh-not-owned-by-attacker"
        r = await app_client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {attacker_access}"},
            json={"refresh_token": fake_refresh},
        )
        assert r.status_code == 200

        # Attacker's access token is blacklisted.
        SessionLocal = isolated_db
        s = SessionLocal()
        try:
            access_hash = _hash_token(attacker_access)
            row = s.query(RevokedToken).filter_by(token_hash=access_hash).first()
            assert row is not None, (
                "attacker's own access token was not blacklisted — the "
                "IDOR fix may have accidentally broken the legitimate "
                "logout of the access token."
            )
        finally:
            s.close()
