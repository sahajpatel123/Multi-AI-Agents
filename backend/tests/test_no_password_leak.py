"""No-password-hash leak guard.

A leaked bcrypt hash is enough for an offline cracking campaign
against the user (assuming their email is known — they almost
certainly are, since this is a chatroom product). Even with a
strong hash like argon2 or bcrypt cost 12, a hash dump is a breach
that lands a company on a regulatory disclosure list.

UserResponse (arena/models/schemas.py) does NOT include password_hash
in its fields, and every User payload returned by /api/auth/* goes
through orm_user_to_response(user, db) which projects through that
schema. So the password_hash should never appear in any JSON the
backend emits.

These tests pin that contract by scanning every response body from
the auth endpoints for the bcrypt-hash prefix and the SHA-256 hex
prefix (the JWT blacklist stores SHA-256(token) — it should never
be in a user-facing response either).

If a future refactor adds password_hash to UserResponse, switches to
a different serializer that bypasses the schema, or starts logging
the raw user row somewhere reachable by HTTP, these tests fail.
"""

import pytest

# Known hash prefixes that must NEVER appear in an HTTP response body.
# If you find one of these in a /api/* response, a credential has
# leaked — rotate the affected users' passwords AND audit the
# change that introduced the leak.
_LEAK_PATTERNS = (
    "$2a$",     # bcrypt (older cost)
    "$2b$",     # bcrypt (current)
    "$2y$",     # bcrypt (PHP variant)
    "$argon2",
)


def _body_contains_hash(body: str) -> bool:
    return any(prefix in body for prefix in _LEAK_PATTERNS)


class TestAuthResponsesDoNotLeakHash:
    """Every response from /api/auth/* must be hash-free."""

    @pytest.mark.asyncio
    async def test_register_response_has_no_password_hash(
        self, app_client
    ):
        res = await app_client.post(
            "/api/auth/register",
            json={
                "email": "leak1@test.com",
                "password": "Strong1Pass",
                "name": "Leak Tester",
            },
        )
        # 201 on success. Any hash prefix in the body would be a leak.
        assert res.status_code == 201, res.text
        assert not _body_contains_hash(res.text), (
            f"register response contains a hash prefix: {res.text[:300]}"
        )

    @pytest.mark.asyncio
    async def test_login_response_has_no_password_hash(
        self, app_client, make_user
    ):
        from arena.core.auth import hash_password
        user = make_user(email="leak2@test.com")
        # make_user already hashed via auth fixture; just login with the
        # plain-text the fixture expects.
        res = await app_client.post(
            "/api/auth/login",
            json={"email": "leak2@test.com", "password": "Strong1Pass"},
        )
        assert res.status_code == 200, res.text
        assert not _body_contains_hash(res.text), (
            f"login response contains a hash prefix: {res.text[:300]}"
        )

    @pytest.mark.asyncio
    async def test_me_response_has_no_password_hash(
        self, app_client, auth_headers, isolated_db
    ):
        headers = auth_headers()
        res = await app_client.get("/api/auth/me", headers=headers)
        assert res.status_code == 200, res.text
        assert not _body_contains_hash(res.text), (
            f"/me response contains a hash prefix: {res.text[:300]}"
        )

    @pytest.mark.asyncio
    async def test_refresh_response_has_no_password_hash(
        self, app_client, make_user, isolated_db
    ):
        from arena.core.auth import create_refresh_token
        from arena.db_models import UserTier
        user = make_user(email="leak3@test.com", tier=UserTier.PLUS)
        refresh = create_refresh_token(user.id, user.email)
        res = await app_client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh},
        )
        assert res.status_code == 200, res.text
        assert not _body_contains_hash(res.text), (
            f"refresh response contains a hash prefix: {res.text[:300]}"
        )

    @pytest.mark.asyncio
    async def test_register_then_me_full_payload_is_hash_free(
        self, app_client, isolated_db
    ):
        """End-to-end check: register a fresh user, then GET /me, then
        confirm every field of the response JSON is hash-free. This is
        the regression test for 'someone added User.password_hash to
        UserResponse and shipped it' — the test inspects every value,
        not just the top-level body, so a nested leak fails too.
        """
        import json
        reg = await app_client.post(
            "/api/auth/register",
            json={
                "email": "leak4@test.com",
                "password": "Strong1Pass",
                "name": "Leak Four",
            },
        )
        assert reg.status_code == 201
        access = reg.json()["access_token"]
        me = await app_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {access}"},
        )
        assert me.status_code == 200

        # Walk every value in the response recursively.
        def _walk(obj):
            if isinstance(obj, dict):
                for v in obj.values():
                    yield from _walk(v)
            elif isinstance(obj, list):
                for v in obj:
                    yield from _walk(v)
            else:
                yield obj

        for v in _walk(me.json()):
            if isinstance(v, str) and _body_contains_hash(v):
                pytest.fail(
                    f"/me response contains a hash prefix in a "
                    f"nested field: {v[:120]!r}"
                )