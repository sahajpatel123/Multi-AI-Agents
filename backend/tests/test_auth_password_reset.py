"""Password reset endpoints: issuance, redemption, replay defence, enumeration."""

from __future__ import annotations

import pytest

from arena.core.auth import hash_password, verify_password
from arena.db_models import PasswordResetToken, User


def _hashed(token: str) -> str:
    import hashlib

    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@pytest.mark.asyncio
async def test_forgot_password_response_is_identical_for_known_and_unknown_email(
    app_client,
):
    a = await app_client.post(
        "/api/auth/forgot-password", json={"email": "nobody-here@example.com"}
    )
    assert a.status_code == 200
    body_a = a.json()

    # Register a real user, then re-issue.
    await app_client.post(
        "/api/auth/register",
        json={"email": "reset-target@example.com", "password": "Strong1Pass", "name": "R"},
    )
    b = await app_client.post(
        "/api/auth/forgot-password", json={"email": "reset-target@example.com"}
    )
    assert b.status_code == 200
    assert b.json() == body_a


@pytest.mark.asyncio
async def test_forgot_password_persists_single_token(db_session, app_client):
    await app_client.post(
        "/api/auth/register",
        json={"email": "reset-target@example.com", "password": "Strong1Pass", "name": "R"},
    )

    res = await app_client.post(
        "/api/auth/forgot-password", json={"email": "reset-target@example.com"}
    )
    assert res.status_code == 200

    rows = (
        db_session.query(PasswordResetToken)
        .filter(PasswordResetToken.user_id.isnot(None))
        .all()
    )
    assert len(rows) == 1
    assert rows[0].used_at is None
    assert rows[0].expires_at > rows[0].created_at


@pytest.mark.asyncio
async def test_reset_password_invalidates_old_password_and_replays_once(
    db_session, app_client, make_user
):
    user = make_user(email="reset-bob@example.com")

    # Drive /forgot-password to create a token row, then grab the hash so
    # we can fabricate a matching raw token.
    res = await app_client.post(
        "/api/auth/forgot-password", json={"email": "reset-bob@example.com"}
    )
    assert res.status_code == 200
    row = (
        db_session.query(PasswordResetToken)
        .filter(PasswordResetToken.user_id == user.id)
        .first()
    )
    assert row is not None
    raw_token = "replacement-" + row.token_hash[:20]  # must satisfy 32+ char body
    # Override the row with a token whose hash matches our raw value.
    row.token_hash = _hashed(raw_token)
    db_session.add(row)
    db_session.commit()

    # First redemption rotates the password.
    res = await app_client.post(
        "/api/auth/reset-password",
        json={"token": raw_token, "new_password": "Strong2Pass"},
    )
    assert res.status_code == 200, res.text
    refreshed = db_session.query(User).filter(User.id == user.id).first()
    assert verify_password("Strong2Pass", refreshed.password_hash)[0] is True

    # Mark the token used (the handler does this; verify here).
    db_session.refresh(row)
    assert row.used_at is not None

    # Second use is rejected — replay protection.
    res = await app_client.post(
        "/api/auth/reset-password",
        json={"token": raw_token, "new_password": "Strong3Pass"},
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_reset_password_rejects_unknown_token(app_client):
    res = await app_client.post(
        "/api/auth/reset-password",
        json={"token": "a" * 64, "new_password": "Strong2Pass"},
    )
    assert res.status_code == 400
    assert res.json()["detail"]["error"] == "reset_token_invalid"


@pytest.mark.asyncio
async def test_reset_password_rejects_same_as_current(app_client, make_user, db_session):
    user = make_user(email="reset-carla@example.com")

    res = await app_client.post(
        "/api/auth/forgot-password", json={"email": "reset-carla@example.com"}
    )
    assert res.status_code == 200
    row = (
        db_session.query(PasswordResetToken)
        .filter(PasswordResetToken.user_id == user.id)
        .first()
    )
    raw_token = "replacement-" + row.token_hash[:20]
    row.token_hash = _hashed(raw_token)
    db_session.add(row)
    db_session.commit()

    res = await app_client.post(
        "/api/auth/reset-password",
        json={"token": raw_token, "new_password": "Strong1Pass"},
    )
    assert res.status_code == 400
    assert res.json()["detail"]["error"] == "password_same"


@pytest.mark.asyncio
async def test_reset_password_rejects_weak_password(app_client, make_user, db_session):
    user = make_user(email="reset-dean@example.com")
    res = await app_client.post(
        "/api/auth/forgot-password", json={"email": "reset-dean@example.com"}
    )
    assert res.status_code == 200
    row = (
        db_session.query(PasswordResetToken)
        .filter(PasswordResetToken.user_id == user.id)
        .first()
    )
    raw_token = "replacement-" + row.token_hash[:20]
    row.token_hash = _hashed(raw_token)
    db_session.add(row)
    db_session.commit()

    res = await app_client.post(
        "/api/auth/reset-password",
        json={"token": raw_token, "new_password": "alllower"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_hash_reset_token_stable():
    a = _hashed("a-very-long-and-stable-token")
    b = _hashed("a-very-long-and-stable-token")
    assert a == b
    assert len(a) == 64  # sha256 hex digest